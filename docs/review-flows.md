# Deep Dive: Multi-Agent Review Architecture

## Tổng quan kiến trúc

Cả **Review Merge (Branch)** và **Review Staged Changes** đều sử dụng chung một
pipeline multi-agent. Điểm khác biệt duy nhất nằm ở **đầu vào** (branch diff vs staged diff)
và **số lượng output tab** (branch có thêm MR Description).

---

## 1. Entry Point → Service → Multi-Agent Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│                    REVIEW MERGE (Branch)                            │
│  reviewMergeCommand.ts                                             │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 1. gitService.getAllBranches()                               │  │
│  │ 2. loadReviewPreferences() → provider, model, lang, strategy│  │
│  │ 3. ModelProvider.getAvailableModels()                        │  │
│  │ 4. Tạo WebviewPanel + generateWebviewContent()              │  │
│  │ 5. Tạo ReviewMergeService + WebviewMessageHandler           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  User actions: [Generate Review] [Generate Description] [Both]     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                 REVIEW STAGED CHANGES                               │
│  reviewStagedChangesCommand.ts                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 1. gitService.hasStagedFiles()                               │  │
│  │ 2. loadReviewPreferences()                                   │  │
│  │ 3. ModelProvider.getAvailableModels()                        │  │
│  │ 4. Tạo WebviewPanel + generateWebviewContent()              │  │
│  │ 5. Tạo ReviewStagedChangesService + WebviewMessageHandler   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  User action: [Generate Review]                                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Service Layer: Chuẩn bị trước khi gọi Agent

```
ReviewMergeService.generateReview() / ReviewStagedChangesService.generateReview()
│
├─ 1. withAbortController()          ← Tạo AbortController cho cancel
│
├─ 2. prepareAdapter()               ← (ReviewWorkflowServiceBase)
│     ├─ persistReviewPreferences()  ← Lưu provider/model/lang/strategy
│     ├─ persistCustomModelCapabilities()
│     ├─ resolveProviderApiKey()     ← Lấy hoặc hỏi API key
│     ├─ resolveCustomProviderBaseUrl()
│     └─ createInitializedAdapter()  ← Tạo ILLMAdapter (Claude/OpenAI/Gemini/Ollama/Custom)
│
├─ 3. Lấy diff
│     ├─ [Branch] getBranchDiffPreview(base, compare)
│     │     ├─ gitService.getBranchDiffFiles()  → UnifiedDiffFile[]
│     │     └─ gitService.renderBranchDiffFiles() → string
│     └─ [Staged] getStagedDiffPreview()
│           ├─ gitService.hasStagedFiles()
│           ├─ gitService.getStagedDiffFiles()  → UnifiedDiffFile[]
│           └─ gitService.renderStagedDiffFiles() → string
│
├─ 4. Lấy custom prompts từ repo
│     ├─ gitService.getCustomReviewMergeSystemPrompt()
│     ├─ gitService.getCustomReviewMergeAgentPrompt()
│     └─ gitService.getCustomReviewMergeRules()
│
├─ 5. Build system message
│     ├─ [Branch] SYSTEM_PROMPT_GENERATE_REVIEW_MERGE(lang, custom, rules, agentInstr)
│     └─ [Staged] buildStagedReviewSystemPrompt(lang, custom, rules)
│
├─ 6. Build base prompt (diff + task context)
│
├─ 7. buildReviewReferenceContext()  ← Reference Context Provider
│     ├─ shouldAutoExpandReferenceContext()
│     │     ├─ mode='off'          → skip
│     │     ├─ mode='always'       → expand
│     │     ├─ mode='auto':
│     │     │   ├─ strategy=hierarchical → expand
│     │     │   ├─ changedFiles >= 3     → expand
│     │     │   ├─ promptTokens > 70% budget → expand
│     │     │   └─ otherwise             → skip
│     │     └─ return { triggered, triggerReason, effectiveStrategy }
│     │
│     ├─ buildLegacyReferenceContext()
│     │     ├─ Tìm related files qua DocumentLinkProvider (max 4 files)
│     │     └─ extractRelevantLines() → import/export/class/function signatures
│     │
│     └─ buildExpandedSymbolContext() (nếu triggered)
│           ├─ extractCandidateSymbolsFromDiff() → max 24 symbols, 8/file
│           │     └─ Lọc identifiers từ changed lines, bỏ stop words
│           ├─ resolveSymbolDefinitions() → VS Code LSP
│           │     └─ Tìm definition location cho mỗi symbol
│           └─ renderDefinitionSection() → code snippets (max 40 lines/section)
│                 └─ Token budget: min(4500, contextWindow * 25%)
│
├─ 8. ══════════════════════════════════════════════════════════
│     ║  KHỞI TẠO 3 AGENTS (xem Section 3 bên dưới)          ║
│     ══════════════════════════════════════════════════════════
│
└─ 9. contextOrchestrator.generateMultiAgentFinalText()
      ├─ multiAgentExecutor.executeAgents()  ← PARALLEL (xem Section 4)
      ├─ buildSynthesisPrompt(agentReports)  ← Merge 3 reports
      └─ generateFinalText() → Synthesizer tạo final markdown
```

---

## 3. Ba Agent chuyên biệt (giống nhau cho cả Branch và Staged)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENT DEFINITIONS                                   │
│                                                                             │
│  Mỗi agent là một AgentPrompt {                                            │
│    role: string,                                                            │
│    systemMessage: string,      ← base system + role-specific instructions   │
│    prompt: string,             ← referenceContext + basePrompt (diff+task)  │
│    tools: FunctionCall[],      ← VS Code tools agent được phép dùng        │
│    maxIterations: 3,           ← max tool-call loops                        │
│    selfAudit: true             ← reflection pass sau khi xong               │
│  }                                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  AGENT 1: "Code Reviewer"                                          │    │
│  │                                                                     │    │
│  │  Nhiệm vụ:                                                         │    │
│  │  - Kiểm tra correctness, maintainability, security, performance    │    │
│  │  - Tìm testing gaps                                                │    │
│  │  - Ưu tiên concrete issues + actionable fixes                      │    │
│  │                                                                     │    │
│  │  Tools được cấp:                                                    │    │
│  │  ┌──────────────────┬──────────────────────────────────────────┐   │    │
│  │  │ find_references   │ Tìm tất cả references tới 1 symbol      │   │    │
│  │  │ get_diagnostics   │ Lấy errors/warnings từ VS Code          │   │    │
│  │  │ read_file         │ Đọc nội dung file                       │   │    │
│  │  │ get_symbol_def    │ Tìm definition của symbol qua LSP       │   │    │
│  │  │ search_code       │ Text search toàn workspace              │   │    │
│  │  └──────────────────┴──────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  AGENT 2: "Flow Diagram"                                           │    │
│  │                                                                     │    │
│  │  Nhiệm vụ:                                                         │    │
│  │  - Tái tạo control flow / data flow bị ảnh hưởng bởi change       │    │
│  │  - Vẽ PlantUML diagrams (activity, sequence, class, IE)           │    │
│  │  - Mỗi diagram đặt tên rõ ràng theo flow cụ thể                   │    │
│  │                                                                     │    │
│  │  Tools được cấp:                                                    │    │
│  │  ┌──────────────────┬──────────────────────────────────────────┐   │    │
│  │  │ find_references   │ Trace symbol usage                       │   │    │
│  │  │ get_related_files │ Tìm files liên quan qua imports/deps    │   │    │
│  │  │ read_file         │ Đọc file để hiểu logic                  │   │    │
│  │  │ get_symbol_def    │ Hiểu implementation chi tiết             │   │    │
│  │  └──────────────────┴──────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  AGENT 3: "Observer"                                                │    │
│  │                                                                     │    │
│  │  Nhiệm vụ:                                                         │    │
│  │  - Nhìn xa hơn diff → hidden risks, missing edge cases            │    │
│  │  - Phát hiện integration regressions                               │    │
│  │  - Output: execution todo list (max 4 items)                       │    │
│  │                                                                     │    │
│  │  Tools được cấp:                                                    │    │
│  │  ┌──────────────────┬──────────────────────────────────────────┐   │    │
│  │  │ get_diagnostics   │ Kiểm tra project-wide impact            │   │    │
│  │  │ get_related_files │ Tìm integration points                  │   │    │
│  │  │ read_file         │ Verify assumptions                      │   │    │
│  │  └──────────────────┴──────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. MultiAgentExecutor: Parallel Execution + Tool Loop + Self-Audit

```
MultiAgentExecutor.executeAgents(agents[3], adapter, signal, request)
│
│  concurrency = config.concurrency (default: 2)
│  → Chạy min(2, 3) = 2 workers song song, agent thứ 3 chờ slot trống
│
├─ Worker Pool (Promise.all)
│  ┌──────────────────────────────────────────────────────────────────┐
│  │  runNext() loop:                                                 │
│  │    nextIndex++ (atomic-like via single-threaded JS)              │
│  │    → runAgent(agents[currentIndex])                              │
│  │    → Nếu 1 agent throw → fatalError, tất cả workers dừng       │
│  └──────────────────────────────────────────────────────────────────┘
│
└─ Mỗi agent chạy qua runAgent():

   runAgent(agent, adapter, signal, request)
   │
   │  currentPrompt = agent.prompt   ← referenceContext + diff + task
   │  iteration = 0
   │  maxIterations = 3
   │
   │  ┌─────────── TOOL CALL LOOP (max 3 iterations) ──────────────┐
   │  │                                                              │
   │  │  Iteration N:                                                │
   │  │  │                                                           │
   │  │  ├─ buildGenerateOptions()                                   │
   │  │  │   ├─ systemMessage = agent.systemMessage                  │
   │  │  │   ├─ maxTokens = adapter.getMaxOutputTokens()             │
   │  │  │   ├─ tools = agent.tools.map(t => t.functionCalling)      │
   │  │  │   └─ [GPT-5 only] reasoning: { effort: "low" }           │
   │  │  │                                                           │
   │  │  ├─ calibration.safeTruncatePrompt()                         │
   │  │  │   ├─ Tính inputBudget = contextWindow - safetyMargin      │
   │  │  │   │   ├─ >128k → margin 8192                              │
   │  │  │   │   ├─ >32k  → margin 4096                              │
   │  │  │   │   └─ ≤32k  → margin 2048                              │
   │  │  │   ├─ Nếu total tokens ≤ budget → giữ nguyên               │
   │  │  │   └─ Nếu vượt → cắt đầu prompt, giữ TAIL (tool results   │
   │  │  │       gần nhất quan trọng hơn)                             │
   │  │  │                                                           │
   │  │  ├─ calibration.generateTextWithAutoRetry()                  │
   │  │  │   ├─ adapter.generateText(prompt, options)                │
   │  │  │   └─ Nếu context-length error:                            │
   │  │  │       ├─ parseContextLimitFromError() → real limit         │
   │  │  │       ├─ setCalibratedContextWindow() → cache + persist    │
   │  │  │       └─ Retry với truncated prompt                        │
   │  │  │                                                           │
   │  │  ├─ throwIfCancelled(signal)                                 │
   │  │  │                                                           │
   │  │  └─ Kiểm tra response:                                      │
   │  │     │                                                        │
   │  │     ├─ CÓ toolCalls && agent có tools?                       │
   │  │     │   │                                                    │
   │  │     │   ├─ functionCallExecute()                             │
   │  │     │   │   ├─ Với mỗi toolCall:                             │
   │  │     │   │   │   ├─ extractToolCallData() → {name, args}     │
   │  │     │   │   │   ├─ findFunctionCallById(agent.tools, name)  │
   │  │     │   │   │   └─ functionCall.execute(args, {llmAdapter}) │
   │  │     │   │   │       ↓                                       │
   │  │     │   │   │   ┌─────────────────────────────────────┐     │
   │  │     │   │   │   │ VS Code API calls:                  │     │
   │  │     │   │   │   │ • find_references                   │     │
   │  │     │   │   │   │   → executeReferenceProvider        │     │
   │  │     │   │   │   │ • get_diagnostics                   │     │
   │  │     │   │   │   │   → languages.getDiagnostics()      │     │
   │  │     │   │   │   │ • read_file                         │     │
   │  │     │   │   │   │   → workspace.openTextDocument()    │     │
   │  │     │   │   │   │ • get_symbol_definition             │     │
   │  │     │   │   │   │   → resolveSymbolDefinitions (LSP)  │     │
   │  │     │   │   │   │ • get_related_files                 │     │
   │  │     │   │   │   │   → DocumentLinks + text search     │     │
   │  │     │   │   │   │ • search_code                       │     │
   │  │     │   │   │   │   → workspace.findFiles + grep      │     │
   │  │     │   │   │   └─────────────────────────────────────┘     │
   │  │     │   │   └─ return [{tool, result: {description}}]       │
   │  │     │   │                                                    │
   │  │     │   ├─ Nối tool results vào currentPrompt:               │
   │  │     │   │   currentPrompt += "\nTool results:\n" + results   │
   │  │     │   │   + "\nPlease analyze and continue. Call more      │
   │  │     │   │     tools if needed, or provide final analysis."   │
   │  │     │   │                                                    │
   │  │     │   └─ iteration++ → QUAY LẠI đầu loop                  │
   │  │     │                                                        │
   │  │     └─ KHÔNG có toolCalls?                                   │
   │  │         └─ BREAK khỏi loop → đi tới Self-Audit              │
   │  │                                                              │
   │  └────────────────────────────────────────────────────────────┘
   │
   │  ┌─────────── SELF-AUDIT PASS (nếu agent.selfAudit=true) ────┐
   │  │                                                              │
   │  │  Mục đích: Agent tự review lại output của chính mình         │
   │  │                                                              │
   │  │  auditPrompt = """                                           │
   │  │    Here is your previous analysis:                           │
   │  │    {lastResponse.text}                                       │
   │  │    ---                                                       │
   │  │    Self-audit the analysis above. Check for:                 │
   │  │    - Missed critical issues or bugs                          │
   │  │    - Integration risks or side effects                       │
   │  │    - Incomplete or incorrect conclusions                     │
   │  │    - Missing edge cases                                      │
   │  │                                                              │
   │  │    If complete and accurate → output unchanged               │
   │  │    If gaps found → provide revised version                   │
   │  │  """                                                         │
   │  │                                                              │
   │  │  ⚠️ KHÔNG gửi lại diff gốc (agent.prompt)                   │
   │  │     → Tiết kiệm tokens, tránh exceed context limit          │
   │  │     → Model đã "nhớ" diff từ iteration trước                 │
   │  │                                                              │
   │  │  options: KHÔNG có tools (chỉ text generation)               │
   │  │  → calibration.safeTruncatePrompt()                          │
   │  │  → calibration.generateTextWithAutoRetry()                   │
   │  │  → lastResponse = auditResponse                              │
   │  │                                                              │
   │  └──────────────────────────────────────────────────────────────┘
   │
   └─ return "### Agent: {role}\n\n{lastResponse.text}"
```

---

## 5. Synthesis: Merge 3 Agent Reports → Final Output

```
generateMultiAgentFinalText()
│
├─ executeAgents() → agentReports: string[3]
│   ├─ "### Agent: Code Reviewer\n\n{review analysis}"
│   ├─ "### Agent: Flow Diagram\n\n{PlantUML diagrams + flow analysis}"
│   └─ "### Agent: Observer\n\n{hidden risks + todo list}"
│
├─ buildSynthesisPrompt(agentReports):
│   """
│   You are the Synthesizer. Here are the review reports
│   from your specialized agents:
│
│   {report 1}
│   {report 2}
│   {report 3}
│
│   Please synthesize these inputs into a final, highly structured
│   markdown report following the exact format requested.
│   Do NOT output the raw agent reports.
│   Merge them gracefully according to the output contract.
│   """
│
└─ generateFinalText(adapter, systemMessage, synthesisPrompt)
    ├─ safeTruncatePrompt()
    ├─ generateTextWithAutoRetry()
    └─ return finalReview.trim()
```

---

## 6. Fallback: Hierarchical Strategy (khi diff quá lớn cho multi-agent)

Khi `contextOrchestrator.generate()` được gọi (thay vì `generateMultiAgentFinalText`),
hệ thống dùng hierarchical chunking strategy:

```
contextOrchestrator.generate(request)
│
├─ resolveStrategy(strategy, contextWindow, model, system, prompt)
│   ├─ strategy != 'auto' → dùng strategy đó
│   └─ strategy == 'auto':
│       ├─ estimatedPrompt ≤ directInputBudget → 'direct'
│       └─ estimatedPrompt > directInputBudget → 'hierarchical'
│
├─ [DIRECT MODE]
│   └─ generateFinalText(system, prompt) → done
│
└─ [HIERARCHICAL MODE]
    │
    ├─ DiffChunkBuilder.buildChunks(files, workerPayloadBudget)
    │   ├─ splitFileIntoEntries() → tách file lớn thành hunks/segments
    │   └─ Pack entries vào chunks sao cho mỗi chunk ≤ budget
    │
    ├─ ChunkAnalysisReducer.processChunksInParallel()
    │   ├─ Chạy song song (concurrency workers)
    │   ├─ Mỗi chunk → Worker LLM call → JSON summary:
    │   │   { files, intent, risks, breakingChanges, testImpact, notableSymbols }
    │   └─ return ChunkAnalysis[]
    │
    ├─ ChunkAnalysisReducer.reduceAnalysesUntilFit()
    │   ├─ Loop: nếu tổng tokens > finalInputBudget
    │   │   ├─ groupAnalysesForReduction() → nhóm analyses
    │   │   ├─ Reducer LLM call → merge JSON summaries
    │   │   └─ Lặp lại cho đến khi fit budget
    │   └─ return reduced ChunkAnalysis[]
    │
    ├─ buildCoordinatorPromptInput()
    │   ├─ renderChangedFiles() (token-budgeted)
    │   └─ renderAnalyses() → markdown summaries
    │
    └─ generateFinalText(system, coordinatorPrompt) → final output
```

---

## 7. Sequence Diagram: Toàn bộ flow từ User Click → Final Result

```
User          Webview         MessageHandler    Service           Orchestrator      MultiAgentExec    LLM API        VS Code Tools
 │               │                │                │                  │                  │               │               │
 │──[click]─────>│                │                │                  │                  │               │               │
 │               │──postMessage──>│                │                  │                  │               │               │
 │               │                │──validate()───>│                  │                  │               │               │
 │               │                │                │                  │                  │               │               │
 │               │                │                ├─prepareAdapter() │                  │               │               │
 │               │                │                │  (API key, init) │                  │               │               │
 │               │                │                │                  │                  │               │               │
 │               │                │                ├─getDiff()        │                  │               │               │
 │               │                │                │  (branch/staged) │                  │               │               │
 │               │                │                │                  │                  │               │               │
 │               │                │                ├─buildRefContext() │                  │               │               │
 │               │                │                │  (symbols+LSP)   │                  │               │               │
 │               │                │                │                  │                  │               │               │
 │               │                │                ├─define 3 agents  │                  │               │               │
 │               │                │                │                  │                  │               │               │
 │               │                │                ├────────────────>│                  │               │               │
 │               │                │                │ generateMulti    │                  │               │               │
 │               │                │                │ AgentFinalText() │                  │               │               │
 │               │                │                │                  ├─executeAgents()─>│               │               │
 │               │                │                │                  │                  │               │               │
 │               │                │                │                  │    ┌─────────────────────────────────────────────┐
 │               │                │                │                  │    │  PARALLEL: 2 workers, 3 agents              │
 │               │                │                │                  │    │                                             │
 │               │                │                │                  │    │  Agent 1 (Code Reviewer):                   │
 │               │                │                │                  │    │  ├─ LLM call #1 ──────────────>│            │
 │               │                │                │                  │    │  │<─ response (with toolCalls) │            │
 │               │                │                │                  │    │  ├─ execute tools ─────────────────────────>│
 │               │                │                │                  │    │  │<─ tool results ─────────────────────────│
 │               │                │                │                  │    │  ├─ LLM call #2 (with tool context)──>│    │
 │               │                │                │                  │    │  │<─ response (no toolCalls)          │    │
 │               │                │                │                  │    │  ├─ Self-Audit LLM call ─────────────>│    │
 │               │                │                │                  │    │  │<─ audited response                 │    │
 │               │                │                │                  │    │  └─ return "### Agent: Code Reviewer" │    │
 │               │                │                │                  │    │                                             │
 │               │                │                │                  │    │  Agent 2 (Flow Diagram): [song song]        │
 │               │                │                │                  │    │  ├─ LLM + tools + self-audit               │
 │               │                │                │                  │    │  └─ return "### Agent: Flow Diagram"        │
 │               │                │                │                  │    │                                             │
 │               │                │                │                  │    │  Agent 3 (Observer): [chờ slot trống]       │
 │               │                │                │                  │    │  ├─ LLM + tools + self-audit               │
 │               │                │                │                  │    │  └─ return "### Agent: Observer"            │
 │               │                │                │                  │    └─────────────────────────────────────────────┘
 │               │                │                │                  │                  │               │               │
 │               │                │                │                  │<─ agentReports[3]│               │               │
 │               │                │                │                  │                  │               │               │
 │               │                │                │                  ├─ buildSynthesisPrompt()          │               │
 │               │                │                │                  ├─ generateFinalText() ───────────>│               │
 │               │                │                │                  │<─ synthesized markdown ──────────│               │
 │               │                │                │                  │                  │               │               │
 │               │                │                │<─────────────────│                  │               │               │
 │               │                │                │  final review    │                  │               │               │
 │               │                │                │                  │                  │               │               │
 │               │                │                ├─normalizeGeneratedPaths()           │               │               │
 │               │                │                │                  │                  │               │               │
 │               │                │<───────────────│                  │                  │               │               │
 │               │                │  ReviewResult  │                  │                  │               │               │
 │               │                │                │                  │                  │               │               │
 │               │<──postResult───│                │                  │                  │               │               │
 │               │  {review, diff}│                │                  │                  │               │               │
 │               │                │                │                  │                  │               │               │
 │<──render──────│                │                │                  │                  │               │               │
 │  markdown+UML │                │                │                  │                  │               │               │
```

---

## 8. Tổng số LLM calls cho 1 review (worst case)

| Phase | Calls | Ghi chú |
|-------|-------|---------|
| Agent 1: Code Reviewer | 1 initial + 2 tool loops + 1 self-audit = **4** | maxIterations=3, mỗi iteration có thể gọi tools |
| Agent 2: Flow Diagram | 1 initial + 2 tool loops + 1 self-audit = **4** | tương tự |
| Agent 3: Observer | 1 initial + 2 tool loops + 1 self-audit = **4** | tương tự |
| Synthesizer | **1** | merge 3 reports |
| **Tổng worst case** | **13 LLM calls** | + N tool executions (VS Code API, không tốn LLM) |
| **Tổng best case** | **7 LLM calls** | 3 agents × (1 gen + 1 audit) + 1 synthesis |

---

## 9. Điểm khác biệt giữa Branch Review và Staged Review

| Aspect | Review Merge (Branch) | Review Staged Changes |
|--------|----------------------|----------------------|
| Input | `getBranchDiffFiles(base, compare)` | `getStagedDiffFiles()` |
| Validation | base ≠ compare branch | has staged files |
| Actions | Review + Description + Both | Review only |
| Description generation | `generateDescription()` riêng | Không có |
| System prompt source | `SYSTEM_PROMPT_GENERATE_REVIEW_MERGE()` | `buildStagedReviewSystemPrompt()` |
| Agent definitions | Giống nhau (3 agents, cùng tools, cùng roles) | Giống nhau |
| Multi-agent pipeline | `generateMultiAgentFinalText()` | `generateMultiAgentFinalText()` |
| PlantUML repair | Có (cả review + description) | Có (chỉ review) |
| Webview tabs | Review + MR Description | Review only |
