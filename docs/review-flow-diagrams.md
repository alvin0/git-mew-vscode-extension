# Git Mew - Review Flow Diagrams (Chi tiết)

## 1. Tổng quan kiến trúc - Tất cả Review Types

```mermaid
graph TB
    subgraph "Entry Points (VS Code Commands)"
        CMD1["git-mew.review-merge"]
        CMD2["git-mew.review-staged-changes"]
        CMD3["git-mew.review-merged-branch"]
        CMD4["git-mew.review-selected-commits"]
        CMD5["Review Panel (Sidebar)"]
    end

    subgraph "Command Layer"
        RC1["reviewMergeCommand.ts"]
        RC2["reviewStagedChangesCommand.ts"]
        RC3["reviewMergedBranchCommand.ts"]
        RC4["reviewSelectedCommitsCommand.ts"]
        RC5["reviewPanelProvider.ts"]
    end

    subgraph "Webview Layer"
        WV1["reviewMerge/webviewContentGenerator.ts"]
        WV2["reviewStagedChanges/webviewContentGenerator.ts"]
        WV3["reviewMergedBranch/webviewContentGenerator.ts"]
        WV4["reviewSelectedCommits/webviewContentGenerator.ts"]
    end

    subgraph "Message Handler Layer"
        MH1["reviewMerge/webviewMessageHandler.ts"]
        MH2["reviewStagedChanges/webviewMessageHandler.ts"]
        MH3["reviewMergedBranch/webviewMessageHandler.ts"]
        MH4["reviewSelectedCommits/webviewMessageHandler.ts"]
    end

    subgraph "Service Layer"
        SV1["ReviewMergeService"]
        SV2["ReviewStagedChangesService"]
        SV3["ReviewMergedBranchService"]
        SV4["ReviewSelectedCommitsService"]
        BASE["ReviewWorkflowServiceBase"]
    end

    subgraph "Shared Infrastructure"
        ADAPT["adapter.ts"]
        PREF["preferences.ts"]
        PANEL["panelMessaging.ts"]
        ERR["errorReport.ts"]
        VALID["validation.ts"]
    end

    CMD1 --> RC1
    CMD2 --> RC2
    CMD3 --> RC3
    CMD4 --> RC4
    CMD5 --> RC5

    RC1 --> WV1 & MH1
    RC2 --> WV2 & MH2
    RC3 --> WV3 & MH3
    RC4 --> WV4 & MH4
    RC5 -->|"executeCommand"| CMD1 & CMD2 & CMD3

    MH1 --> SV1
    MH2 --> SV2
    MH3 --> SV3
    MH4 --> SV4

    SV1 --> BASE
    SV2 --> BASE
    SV3 --> BASE
    SV4 --> BASE

    BASE --> ADAPT & PREF
    MH1 & MH2 & MH3 & MH4 --> PANEL & ERR & VALID
```

---

## 2. Command Registration Flow (Chi tiết)

```mermaid
sequenceDiagram
    participant Ext as extension.ts
    participant Idx as commands/index.ts
    participant Git as GitService
    participant LLM as LLMService
    participant Mem as ReviewMemoryService

    Note over Ext: Extension Activation
    Ext->>Ext: initSentry() + initPostHog()
    Ext->>Git: new GitService()
    Ext->>LLM: new LLMService(context)
    Ext->>Idx: registerAllCommands(context, gitService, llmService)
    Ext->>Mem: new ReviewMemoryService(context.workspaceState)

    Note over Idx: Register 4 Review Commands
    Idx->>Idx: registerReviewMergeCommand()
    Idx->>Idx: registerReviewStagedChangesCommand()
    Idx->>Idx: registerReviewMergedBranchCommand()
    Idx->>Idx: registerReviewSelectedCommitsCommand()
    Idx->>Idx: registerReviewPanelCommand()
```

---

## 3. Review Merge - Flow Chi tiết

```mermaid
sequenceDiagram
    participant User
    participant Cmd as reviewMergeCommand
    participant WV as Webview Panel
    participant MH as WebviewMessageHandler
    participant Val as validation.ts
    participant Svc as ReviewMergeService
    participant Base as ReviewWorkflowServiceBase
    participant Adapt as adapter.ts
    participant LLM as ILLMAdapter
    participant Git as GitService
    participant Orch as ContextOrchestratorService
    participant Panel as panelMessaging

    User->>Cmd: Trigger "Review Merge"
    Cmd->>Git: getAllBranches()
    Cmd->>Git: getCurrentBranch()
    Cmd->>Cmd: loadReviewPreferences()
    Cmd->>Cmd: ModelProvider.getAvailableModels()
    Cmd->>WV: createWebviewPanel + generateMergeWebviewContent()
    Cmd->>Svc: new ReviewMergeService(gitService, llmService)
    Cmd->>Svc: setReviewMemory(new ReviewMemoryService())
    Cmd->>MH: new WebviewMessageHandler(panel, service)

    Note over User,WV: User chọn branches, provider, model, language
    User->>WV: Click "Review" / "Description" / "Review & Description"
    WV->>MH: postMessage({command: 'reviewMerge'})

    alt command = 'reviewMerge'
        MH->>MH: generateMergeReview(message, false)
    else command = 'generateDescription'
        MH->>MH: generateMergeDescription(message)
    else command = 'reviewAndDescription'
        MH->>MH: generateMergeReview(message, true)
    else command = 'cancel'
        MH->>Svc: cancel()
    else command = 'repairPlantUml'
        MH->>MH: repairPlantUmlContent(message)
    end

    MH->>Val: validateMergeRequestInput(message)
    alt Validation fails
        MH->>Panel: postError(panel, errorPayload)
    end

    MH->>Svc: generateReview(baseBranch, compareBranch, provider, model, ...)
    Svc->>Base: withAbortController(async task)
    Svc->>Base: prepareAdapter(provider, model, ...)
    Base->>Adapt: resolveProviderApiKey()
    Base->>Adapt: resolveCustomProviderBaseUrl()
    Base->>Adapt: createInitializedAdapter()
    Adapt->>LLM: createAdapter(provider) + initialize(config)

    Svc->>Git: getDiffBetweenBranches(base, compare)
    Svc->>Git: getUnifiedDiffFiles(base, compare)
    Svc->>Svc: Build system prompt + reference context
    Svc->>Orch: Multi-Agent Pipeline (xem diagram #6)

    alt Success
        MH->>Panel: postResult(panel, {review, rawDiff})
    else includeDescription = true
        MH->>Svc: generateDescription(...)
        MH->>Panel: postResult(panel, {review, description, rawDiff})
    else Error
        MH->>Panel: postError(panel, errorPayload)
    end
```

### 3.1 Review Merge - Message Commands

```mermaid
graph LR
    subgraph "WebviewMessageHandler Commands"
        A["reviewMerge"] -->|"generateMergeReview(msg, false)"| R["Code Review Only"]
        B["generateDescription"] -->|"generateMergeDescription(msg)"| D["MR Description Only"]
        C["reviewAndDescription"] -->|"generateMergeReview(msg, true)"| RD["Review + Description"]
        E["viewRawDiff"] -->|"openDiffDocument()"| DIFF["Show Raw Diff"]
        F["cancel"] -->|"service.cancel()"| CANCEL["Abort Generation"]
        G["repairPlantUml"] -->|"repairPlantUmlContent()"| REPAIR["Fix PlantUML"]
    end
```

---

## 4. Review Staged Changes - Flow Chi tiết

```mermaid
sequenceDiagram
    participant User
    participant Cmd as reviewStagedChangesCommand
    participant WV as Webview Panel
    participant MH as WebviewMessageHandler
    participant Val as validation.ts
    participant Svc as ReviewStagedChangesService
    participant Base as ReviewWorkflowServiceBase
    participant Git as GitService
    participant Orch as ContextOrchestratorService
    participant Panel as panelMessaging

    User->>Cmd: Trigger "Review Staged Changes"
    Cmd->>Git: hasStagedFiles()
    alt No staged files
        Cmd->>User: showWarningMessage("No staged files")
        Note over Cmd: Return early
    end

    Cmd->>Cmd: loadReviewPreferences()
    Cmd->>Cmd: ModelProvider.getAvailableModels()
    Cmd->>WV: createWebviewPanel + generateWebviewContent()
    Cmd->>Svc: new ReviewStagedChangesService(gitService, llmService)
    Cmd->>Svc: setReviewMemory(new ReviewMemoryService())
    Cmd->>MH: new WebviewMessageHandler(panel, service)

    Note over User,WV: User chọn provider, model, language
    User->>WV: Click "Review Staged Changes"
    WV->>MH: postMessage({command: 'reviewStagedChanges'})

    MH->>Val: validateStagedReviewInput(message)
    MH->>Svc: generateReview(provider, model, language, strategy, ...)

    Svc->>Base: withAbortController()
    Svc->>Base: prepareAdapter(provider, model, ...)
    Svc->>Git: getStagedDiff()
    Svc->>Git: getStagedUnifiedDiffFiles()
    Svc->>Svc: Build system prompt + reference context
    Svc->>Orch: Multi-Agent Pipeline (xem diagram #6)

    alt Success
        MH->>Panel: postResult(panel, {review, rawDiff})
    else Cancelled
        Note over MH: Silent return
    else Error
        MH->>Panel: postError(panel, errorPayload)
    end
```

---

## 5. Review Merged Branch - Flow Chi tiết

```mermaid
sequenceDiagram
    participant User
    participant Cmd as reviewMergedBranchCommand
    participant WV as Webview Panel
    participant MH as WebviewMessageHandler
    participant Val as validation.ts
    participant Svc as ReviewMergedBranchService
    participant Git as GitService
    participant Panel as panelMessaging

    User->>Cmd: Trigger "Review Merged Branch"
    Cmd->>Git: getCurrentBranch()
    Cmd->>Git: getMergedBranches(currentBranch, limit=20)
    alt No merged branches
        Cmd->>User: showWarningMessage("No merged branches")
    end

    Cmd->>WV: createWebviewPanel + generateMergedBranchWebviewContent()
    Cmd->>Svc: new ReviewMergedBranchService(gitService, llmService)
    Cmd->>MH: new WebviewMessageHandler(panel, service, targetBranch, limit)

    Note over User,WV: User chọn merged branch, provider, model
    User->>WV: Click "Review"
    WV->>MH: postMessage({command: 'reviewMergedBranch'})

    alt command = 'searchMergedBranches'
        MH->>Svc: searchMergedBranches(targetBranch, query, limit)
        MH->>WV: postMessage({command: 'updateMergedBranchList', branches})
    end

    MH->>Val: validateMergedBranchReviewInput(message)
    MH->>Svc: generateReview(mergeCommitSha, provider, model, ...)

    Svc->>Git: getDiffForMergeCommit(sha)
    Svc->>Git: getUnifiedDiffFilesForMergeCommit(sha)
    Svc->>Svc: Build prompt + reference context
    Svc->>Svc: Multi-Agent Pipeline

    alt Success
        MH->>Panel: postResult(panel, {review, rawDiff}, historyName, model)
    else Error
        MH->>Panel: postError(panel, errorPayload)
    end
```

---

## 6. Review Selected Commits - Flow Chi tiết

```mermaid
sequenceDiagram
    participant Graph as Graph View (Sidebar)
    participant Cmd as reviewSelectedCommitsCommand
    participant WV as Webview Panel
    participant MH as WebviewMessageHandler
    participant Svc as ReviewSelectedCommitsService
    participant Git as GitService
    participant Panel as panelMessaging

    Graph->>Cmd: executeCommand('review-selected-commits', commits[])
    alt No commits selected
        Cmd->>Graph: showWarningMessage("No commits selected")
    end

    Cmd->>WV: createWebviewPanel + generateSelectedCommitsWebviewContent()
    Cmd->>Svc: new ReviewSelectedCommitsService(gitService, llmService)
    Cmd->>MH: new WebviewMessageHandler(panel, service)

    Note over Graph,WV: User chọn provider, model
    WV->>MH: postMessage({command: 'reviewSelectedCommits'})

    MH->>MH: Validate (oldestSha, newestSha, commitCount, provider, model, ...)
    MH->>Svc: generateReview(oldestSha, newestSha, commitCount, ...)

    Svc->>Git: getDiffBetweenCommits(oldestSha, newestSha)
    Svc->>Git: getUnifiedDiffFiles(oldestSha, newestSha)
    Svc->>Svc: Build prompt + reference context
    Svc->>Svc: Multi-Agent Pipeline

    alt Success
        MH->>Panel: postResult(panel, {review, rawDiff}, historyName, model)
    else Error
        MH->>Panel: postError(panel, errorPayload)
    end
```

---

## 7. Multi-Agent Review Pipeline (Core Engine) - Chi tiết nhất

Đây là pipeline chung cho Review Merge và Review Staged Changes (có multi-agent đầy đủ).

```mermaid
graph TB
    subgraph "PREPARATION"
        P1["prepareAdapter()"] --> P2["Get Diff + UnifiedDiffFile[]"]
        P2 --> P3["Read custom prompts/rules từ repo"]
        P3 --> P4["Build system prompt"]
        P4 --> P5["Build reference context<br/>(ReviewReferenceContextProvider)"]
        P5 --> P6["Build DependencyGraphIndex"]
        P6 --> P7["Load Review Memory Context"]
        P7 --> P8["ContextBudgetManager.allocateAgentBudgets()"]
        P8 --> P9["AgentPromptBuilder.build*Prompt()"]
    end

    subgraph "PHASE 1 - Parallel Agents"
        direction LR
        A1["🔍 Code Reviewer"]
        A2["📊 Flow Diagram"]
        A3["📝 Detail Change"]
        A4["🛡️ Security Analyst"]
    end

    subgraph "SELF-AUDIT (Chain-of-Verification)"
        SA1["Code Reviewer Self-Audit"]
        SA2["Security Analyst Self-Audit"]
        SA3["Observer Audit"]
    end

    subgraph "RISK HYPOTHESIS"
        RH["RiskHypothesisGenerator"]
    end

    subgraph "PHASE 2 - Observer"
        OBS["👁️ Observer Agent"]
    end

    subgraph "PHASE 3 - Synthesis Agents (Parallel)"
        direction LR
        S1["Summary & Detail"]
        S2["Improvement Suggestions"]
        S3["Risk & TODO"]
        S4["Diagram & Assessment"]
    end

    subgraph "DETERMINISTIC MERGE"
        MERGE["SynthesisMerger.mergeSynthesisOutputs()"]
    end

    subgraph "POST-PROCESSING"
        MEM["Save Review Memory"]
        HIST["Save to History"]
    end

    P9 --> A1 & A2 & A3 & A4
    A1 --> SA1
    A4 --> SA2
    A1 & A2 & A4 --> SA3
    SA1 & SA2 & SA3 --> RH
    RH --> OBS
    OBS --> S1 & S2 & S3 & S4
    S1 & S2 & S3 & S4 --> MERGE
    MERGE --> MEM --> HIST
```

---

## 8. Phase 1 Agents - Chi tiết từng Agent

### 8.1 Code Reviewer Agent

```mermaid
graph TB
    subgraph "Code Reviewer"
        INPUT["Input:<br/>- Full diff<br/>- System prompt<br/>- Reference context<br/>- Dependency graph<br/>- Review memory patterns"]
        TOOLS["Tools:<br/>find_references<br/>get_diagnostics<br/>read_file<br/>get_symbol_definition<br/>search_code<br/>get_related_files<br/>queryContext"]
        OUTPUT["Output Schema: code-reviewer<br/>- findings[]<br/>  - severity (critical/major/minor)<br/>  - category (correctness/security/perf/maintain/testing)<br/>  - confidence score<br/>  - file + location<br/>  - description + suggestion"]
        AUDIT["Self-Audit:<br/>- Chain-of-Verification<br/>- Mỗi finding critical/major<br/>  có thể bị loại nếu failed verification"]

        INPUT --> TOOLS --> OUTPUT --> AUDIT
    end
```

### 8.2 Flow Diagram Agent

```mermaid
graph TB
    subgraph "Flow Diagram"
        INPUT["Input:<br/>- Filtered structural diff (35% budget)<br/>- Reference context (30% budget)<br/>- Dependency graph"]
        TOOLS["Tools:<br/>find_references<br/>get_related_files<br/>read_file<br/>get_symbol_definition<br/>queryContext"]
        OUTPUT["Output Schema: flow-diagram<br/>- PlantUML diagrams<br/>- Flow descriptions<br/>- Affected component mapping"]

        INPUT --> TOOLS --> OUTPUT
    end
```

### 8.3 Detail Change Agent

```mermaid
graph TB
    subgraph "Detail Change"
        INPUT["Input:<br/>- Full diff<br/>- Reference context<br/>- Dependency graph"]
        TOOLS["Tools:<br/>read_file<br/>search_code<br/>get_related_files<br/>get_symbol_definition<br/>queryContext"]
        OUTPUT["Output:<br/>- Long-form explanation<br/>- Logic change narrative<br/>- KHÔNG chạy self-audit"]

        INPUT --> TOOLS --> OUTPUT
    end
```

### 8.4 Security Analyst Agent

```mermaid
graph TB
    subgraph "Security Analyst"
        INPUT["Input:<br/>- Full diff (100% budget)<br/>- Reference context (50% budget)<br/>- Dependency graph<br/>- Review memory patterns"]
        TOOLS["Tools:<br/>search_code<br/>find_references<br/>read_file<br/>get_symbol_definition<br/>get_diagnostics<br/>queryContext"]
        OUTPUT["Output Schema: security-analyst<br/>- OWASP/CWE analysis<br/>- Taint flow tracing<br/>- Auth flow concerns<br/>- Input validation gaps<br/>- Data exposure risks<br/>- severity + CWE + confidence"]
        AUDIT["Self-Audit:<br/>- Chain-of-Verification<br/>- Critical/major findings verified"]

        INPUT --> TOOLS --> OUTPUT --> AUDIT
    end
```

---

## 9. Self-Audit & Chain-of-Verification

```mermaid
sequenceDiagram
    participant Agent as Phase 1 Agent
    participant Exec as MultiAgentExecutor
    participant LLM as ILLMAdapter
    participant Store as SharedContextStore

    Agent->>Exec: Raw structured output
    Exec->>Exec: parseStructuredOutput(rawText)

    alt Agent = Code Reviewer OR Security Analyst
        Exec->>Exec: runStructuredSelfAudit()
        Note over Exec: Build diff context cho self-audit
        alt Diff summary quá lớn
            Exec->>Exec: Fallback → changed-files summary
        end

        Exec->>LLM: generateText(audit prompt)
        LLM-->>Exec: JSON {verdict, issues, additions, removals, verificationResults}
        Exec->>Exec: parseStructuredAuditResult()
        Exec->>Exec: applyStructuredAudit()
        Note over Exec: Loại findings failed verification
    end

    alt Observer Audit
        Exec->>Exec: buildObserverChecklist()
        Note over Exec: Checklist từ Code Reviewer + Flow Diagram + Security Analyst
        Exec->>LLM: generateText(observer audit prompt)
        Note over Exec: Focus: hidden risk / integration concern completeness
    end

    Exec->>Store: addAgentFindings(role, findings)
```

---

## 10. Risk Hypothesis Generation

```mermaid
graph TB
    subgraph "RiskHypothesisGenerator"
        INPUT["Input từ SharedContextStore:<br/>- Code Reviewer findings<br/>- Flow Diagram findings<br/>- Security Analyst findings<br/>- Dependency graph"]

        HEURISTIC["Heuristic Hypotheses:<br/>- Integration risks<br/>- Correctness risks<br/>- Security risks<br/>- Performance risks"]

        LLM_GEN["LLM-based Hypotheses:<br/>- Taint source → sink suspicion<br/>- Auth flow concerns<br/>- Cascading impact tới consumers"]

        DEDUP["Deduplication:<br/>- wordOverlapRatio()<br/>- Loại bỏ trùng lặp"]

        OUTPUT["Output: RiskHypothesis[]<br/>- category (integration/correctness/security/performance)<br/>- question<br/>- evidence<br/>- affectedFiles"]

        INPUT --> HEURISTIC & LLM_GEN
        HEURISTIC & LLM_GEN --> DEDUP --> OUTPUT
    end
```

---

## 11. Phase 2 - Observer Agent

```mermaid
sequenceDiagram
    participant Exec as MultiAgentExecutor
    participant Builder as AgentPromptBuilder
    participant Store as SharedContextStore
    participant OBS as Observer Agent
    participant LLM as ILLMAdapter

    Exec->>Builder: buildObserverPrompt()
    Note over Builder: Input includes:<br/>- diff summary<br/>- shared findings<br/>- risk hypotheses<br/>- dependency graph summary<br/>- review memory context

    Builder->>Store: serializeForAgent('Observer', tokenBudget)
    Store-->>Builder: Serialized findings + hypotheses + graph

    Builder-->>Exec: Observer prompt + tools

    Exec->>OBS: runAgent(observerPrompt)
    Note over OBS: Tools: find_references, get_symbol_definition
    Note over OBS: Verify integration concerns bằng tool calls
    Note over OBS: Tạo TODO list (không giới hạn)
    Note over OBS: Thêm confidence, likelihood, impact, mitigation

    OBS->>LLM: generateText(prompt, {tools})
    LLM-->>OBS: Observer output

    Exec->>Exec: runObserverSelfAudit()
    Exec->>Store: addAgentFindings('Observer', findings)
```

---

## 12. Phase 3 - Synthesis Agents (Parallel)

```mermaid
graph TB
    subgraph "Synthesis Input (SynthesisAgentContext)"
        CTX["- structuredReports[] từ Phase 1<br/>- observerReport từ Phase 2<br/>- changedFiles[]<br/>- diffSummary<br/>- language<br/>- review memory context"]
    end

    subgraph "4 Synthesis Agents chạy song song"
        S1["Summary & Detail Agent<br/>Budget: 15%<br/>Output: §2 Summary + §3 Detail Change"]
        S2["Improvement Suggestions Agent<br/>Budget: 40%<br/>Output: §6 Improvement Suggestions<br/>Source: CR findings + SA findings (confidence >= 0.5)"]
        S3["Risk & TODO Agent<br/>Budget: 30%<br/>Output: §7 Observer TODO + §8 Hidden Risks"]
        S4["Diagram & Assessment Agent<br/>Budget: 15%<br/>Output: §4 Flow Diagram + §5 Code Quality Assessment"]
    end

    CTX --> S1 & S2 & S3 & S4
```

---

## 13. Deterministic Merge (SynthesisMerger)

```mermaid
graph TB
    subgraph "SynthesisMerger.mergeSynthesisOutputs()"
        INPUT["Input:<br/>- 4 synthesis agent outputs<br/>- structuredReports[]<br/>- changedFiles[]<br/>- suppressedFindings[]<br/>- language"]

        STEP1["1. Build §1 Changed File Paths"]
        STEP2["2. Extract section text từ synthesis agents"]
        STEP3["3. Fallback → raw structured data nếu agent fail"]
        STEP4["4. Filter suppressed findings<br/>(SHA-256 + glob matching)"]
        STEP5["5. Add provenance tags:<br/>[CR] Code Reviewer<br/>[SA] Security Analyst<br/>[OB] Observer<br/>[XV] Cross-Validated"]
        STEP6["6. Compute metadata stats"]
        STEP7["7. Gắn metadata footer (HTML comment)"]

        OUTPUT["Final Markdown Review"]

        INPUT --> STEP1 --> STEP2 --> STEP3 --> STEP4 --> STEP5 --> STEP6 --> STEP7 --> OUTPUT
    end
```

---

## 14. SharedContextStore (Blackboard Pattern)

```mermaid
graph TB
    subgraph "SharedContextStoreImpl"
        CACHE["Tool Result Cache<br/>(Map: toolName+args → result)"]
        FINDINGS["Agent Findings<br/>(Map: agentRole → AgentFinding[])"]
        GRAPH["Dependency Graph<br/>(DependencyGraphData)"]
        HYPO["Risk Hypotheses<br/>(RiskHypothesis[])"]
    end

    subgraph "Producers"
        P1["Code Reviewer"] -->|"addAgentFindings()"| FINDINGS
        P2["Flow Diagram"] -->|"addAgentFindings()"| FINDINGS
        P3["Security Analyst"] -->|"addAgentFindings()"| FINDINGS
        P4["Observer"] -->|"addAgentFindings()"| FINDINGS
        P5["DependencyGraphIndex"] -->|"setDependencyGraph()"| GRAPH
        P6["RiskHypothesisGenerator"] -->|"setRiskHypotheses()"| HYPO
        P7["Tool Calls"] -->|"setToolResult()"| CACHE
    end

    subgraph "Consumers"
        C1["Observer Agent"] -->|"serializeForAgent()"| FINDINGS & GRAPH & HYPO
        C2["Synthesis Agents"] -->|"getAgentFindings()"| FINDINGS
        C3["All Agents"] -->|"getToolResult()"| CACHE
    end
```

---

## 15. ContextBudgetManager - Token Allocation

```mermaid
graph TB
    subgraph "Budget Allocation Flow"
        CW["Context Window (e.g. 128K, 200K)"]

        CW --> SAFETY["Safety Margin:<br/>128K+ → 8192<br/>32K-128K → 4096<br/><32K → 2048"]
        SAFETY --> TOTAL["totalInputBudget = CW - safetyMargin"]
        TOTAL --> REF["Reference Budget = CW × 0.40<br/>(min 80K tokens)"]
        TOTAL --> REMAIN["remainingAfterReference"]
    end

    subgraph "Phase 1 Agent Budgets"
        REMAIN --> CR["Code Reviewer: 30%<br/>Diff: 100% | Ref: 50%"]
        REMAIN --> FD["Flow Diagram: 20%<br/>Diff: 35% | Ref: 30%"]
        REMAIN --> OB["Observer: 20%<br/>Diff: 15% | Ref: 20%"]
        REMAIN --> SA["Security Analyst: 30%<br/>Diff: 100% | Ref: 50%"]
    end

    subgraph "Phase 3 Synthesis Budgets"
        SYN["Synthesis Total"] --> SD["Summary & Detail: 15%"]
        SYN --> IS["Improvement Suggestions: 40%"]
        SYN --> RT["Risk & TODO: 30%"]
        SYN --> DA["Diagram & Assessment: 15%"]
    end

    subgraph "Safety Check"
        ALL["All allocations"] --> CHECK{"totalEstimated > CW × 0.85?"}
        CHECK -->|Yes| SCALE["Proportional scale-down<br/>(overageRatio = safetyLimit / total)"]
        CHECK -->|No| PASS["Pass through"]
    end
```

---

## 16. Review Memory Service

```mermaid
graph TB
    subgraph "ReviewMemoryService"
        PAT["Pattern Memory<br/>- Recurring issues across reviews<br/>- Category + severity + filePattern<br/>- Decay after 24h"]
        SUP["Suppressed Findings<br/>- False-positive SHA-256 signatures<br/>- Glob-based file matching"]
        HIST["Review History<br/>- Per-file review summaries<br/>- Limited to 20 entries"]
        RES["Resolution Tracking<br/>- Per-agent resolution rates<br/>- Historical dismiss rates"]
    end

    subgraph "Impact on Pipeline"
        PAT -->|"Inject vào agent prompts"| PROMPT["AgentPromptBuilder"]
        SUP -->|"Filter trong SynthesisMerger"| MERGE["SynthesisMerger"]
        HIST -->|"Relevant history cho changed files"| PROMPT
        RES -->|"Resolution stats cho agents"| PROMPT
    end

    subgraph "Persistence"
        STORE["ExtensionContext.workspaceState"]
        PAT & SUP & HIST & RES --> STORE
    end

    subgraph "Commands"
        CLR["gitmew.clearReviewMemory"] -->|"clear()"| PAT & SUP & HIST & RES
    end
```

---

## 17. Reference Context Provider

```mermaid
graph TB
    subgraph "ReviewReferenceContextProvider"
        INPUT["Input: UnifiedDiffFile[]"]

        EXTRACT["extractCandidateSymbolsFromDiff()"]
        DECIDE["shouldAutoExpandReferenceContext()"]

        EXTRACT --> DECIDE

        DECIDE -->|"Auto-expand"| EXPAND["buildExpandedSymbolContext()<br/>- VS Code DocumentSymbol API<br/>- Find definitions<br/>- Find references<br/>- Token budget aware"]

        DECIDE -->|"Legacy"| LEGACY["buildLegacyReferenceContext()<br/>- findRelatedFiles()<br/>- extractRelevantLines()"]

        EXPAND --> OUTPUT["Reference Context String<br/>(within token budget)"]
        LEGACY --> OUTPUT
    end

    subgraph "Token Cap"
        CAP["computeReferenceExpansionTokenCap(contextWindow)"]
        CAP --> EXPAND
    end
```

---

## 18. DependencyGraphIndex

```mermaid
graph TB
    subgraph "DependencyGraphIndex.build(changedFiles)"
        SCAN["scanImports() cho mỗi file"]
        SYM["extractSymbols() cho mỗi file"]
        REF["findSymbolReferences()"]
        CRIT["computeCriticalPaths()"]
        ORDER["orderFilesAlongDeps()"]

        SCAN --> SYM --> REF --> CRIT --> ORDER

        OUTPUT["DependencyGraphData:<br/>- nodes (file → imports, exports, symbols)<br/>- edges (file → file dependencies)<br/>- criticalPaths<br/>- orderedFiles"]
    end

    subgraph "Usage"
        OUTPUT -->|"setDependencyGraph()"| STORE["SharedContextStore"]
        OUTPUT -->|"serializeForPrompt()"| PROMPT["Agent Prompts"]
        OUTPUT -->|"Input for"| RISK["RiskHypothesisGenerator"]
    end
```

---

## 19. MR Description Generation Flow (Review Merge Only)

```mermaid
sequenceDiagram
    participant MH as WebviewMessageHandler
    participant Svc as ReviewMergeService
    participant Orch as ContextOrchestratorService
    participant Exec as MultiAgentExecutor
    participant LLM as ILLMAdapter

    MH->>Svc: generateDescription(baseBranch, compareBranch, ...)

    Note over Svc: Sử dụng DESCRIPTION_BUDGET_CONFIG<br/>(2 agents thay vì 4)

    Svc->>Orch: generateMultiAgentDescription()
    Orch->>Exec: executeDescriptionAgents()

    par Description Agents (Parallel)
        Exec->>LLM: Change Analyzer Agent<br/>(budget: 55%, diff: 100%, ref: 35%)
        Exec->>LLM: Context Investigator Agent<br/>(budget: 45%, diff: 25%, ref: 65%)
    end

    Exec-->>Orch: ChangeAnalyzerOutput + ContextInvestigatorOutput
    Orch->>Orch: buildDescriptionSynthesizerPrompt()
    Orch->>LLM: Synthesize final MR description
    LLM-->>Orch: Final description markdown
    Orch-->>Svc: description string
    Svc-->>MH: DescriptionResult
```

---

## 20. PlantUML Repair Flow

```mermaid
sequenceDiagram
    participant WV as Webview
    participant MH as WebviewMessageHandler
    participant Base as ReviewWorkflowServiceBase
    participant LLM as ILLMAdapter
    participant Panel as panelMessaging

    WV->>MH: postMessage({command: 'repairPlantUml', content, errorMessage, target, attempt})
    MH->>MH: Validate repair input
    MH->>Base: repairPlantUmlMarkdown(provider, model, content, renderError, ...)

    Base->>Base: prepareAdapter()
    Base->>LLM: generateText(repairPrompt, {systemMessage: SYSTEM_PROMPT_REPAIR_PLANTUML})
    LLM-->>Base: Corrected markdown

    Base-->>MH: {success: true, content: correctedMarkdown}
    MH->>Panel: postPlantUmlRepairResult(panel, target, content, attempt)

    Note over Panel: Nếu target = 'review':<br/>Update history file với repaired content
```

---

## 21. Panel Messaging & History Auto-Save

```mermaid
graph TB
    subgraph "panelMessaging.ts"
        PROGRESS["postProgress(panel, message)"]
        LOG["postLog(panel, message)"]
        LLMLOG["postLlmLog(panel, entry)"]
        ERROR["postError(panel, errorPayload)"]
        RESULT["postResult(panel, payload, historyName, model)"]
        REPAIR["postPlantUmlRepairResult(panel, target, content, attempt)"]
    end

    subgraph "Auto-Save Flow"
        RESULT -->|"payload.review exists"| SAVE["saveReviewHistory(review, finalName)"]
        SAVE --> CALLBACK["onHistorySavedCallback()"]
        CALLBACK --> REFRESH["HistoriesProvider auto-refresh"]
    end

    subgraph "History Update"
        REPAIR -->|"target = 'review'"| UPDATE["updateHistoryFile(historyPath, content)"]
    end

    subgraph "Race Condition Guard"
        GEN["panelSaveGeneration (WeakMap)"]
        RESULT --> GEN
        GEN -->|"Only latest gen"| SAVE
    end
```

---

## 22. LLM Adapter Layer

```mermaid
graph TB
    subgraph "ILLMAdapter Interface"
        INIT["initialize(config)"]
        GEN["generateText(prompt, options)"]
        READY["isReady()"]
        MODEL["getModel()"]
        PROVIDER["getProvider()"]
        CW["getContextWindow()"]
        MOT["getMaxOutputTokens()"]
        TEST["testConnection()"]
    end

    subgraph "Implementations"
        OAI["OpenAIAdapter"]
        CLA["ClaudeAdapter"]
        GEM["GeminiAdapter"]
        OLL["OllamaAdapter"]
        CUS["CustomAdapter"]
    end

    subgraph "Factory"
        FAC["createAdapter(provider)"]
        FAC --> OAI & CLA & GEM & OLL & CUS
    end

    subgraph "Config"
        CFG["LLMAdapterConfig:<br/>- apiKey<br/>- model<br/>- baseURL<br/>- maxTokens<br/>- temperature<br/>- contextWindow<br/>- maxOutputTokens"]
    end

    CFG --> INIT
    INIT --> GEN
```

---

## 23. Error Handling Flow

```mermaid
graph TB
    subgraph "Error Sources"
        VAL["Validation Error"]
        LLM["LLM API Error"]
        GIT["Git Operation Error"]
        CANCEL["User Cancellation"]
        PARSE["Parse Error (JSON/PlantUML)"]
    end

    subgraph "Error Processing"
        CREATE["createReviewErrorPayload(error, context, options)"]
        PAYLOAD["ReviewErrorPayload:<br/>- title<br/>- summary<br/>- rawError<br/>- operation<br/>- timestamp<br/>- provider/model<br/>- hint"]
    end

    subgraph "Error Display"
        POST["postError(panel, payload)"]
        MSG["vscode.window.showErrorMessage()"]
        SENTRY["captureError() → Sentry"]
    end

    VAL & LLM & GIT & PARSE --> CREATE --> PAYLOAD --> POST
    LLM & GIT --> MSG
    LLM & GIT --> SENTRY
    CANCEL -->|"Silent return"| NONE["No error displayed"]
```

---

## 24. So sánh 4 Review Types

```mermaid
graph TB
    subgraph "Feature Matrix"
        direction LR

        subgraph "Review Merge"
            RM1["✅ Multi-Agent Pipeline (4 agents)"]
            RM2["✅ MR Description Generation"]
            RM3["✅ Review + Description combo"]
            RM4["✅ Review Memory"]
            RM5["✅ PlantUML Repair"]
            RM6["✅ Dependency Graph"]
            RM7["Input: Branch diff"]
        end

        subgraph "Review Staged"
            RS1["✅ Multi-Agent Pipeline (4 agents)"]
            RS2["❌ No Description"]
            RS3["✅ Review Memory"]
            RS4["✅ PlantUML Repair"]
            RS5["✅ Dependency Graph"]
            RS6["Input: Staged diff"]
        end

        subgraph "Review Merged Branch"
            RB1["✅ Multi-Agent Pipeline"]
            RB2["❌ No Description"]
            RB3["✅ PlantUML Repair"]
            RB4["✅ Branch Search"]
            RB5["Input: Merge commit SHA"]
        end

        subgraph "Review Selected Commits"
            RC1["✅ Multi-Agent Pipeline"]
            RC2["❌ No Description"]
            RC3["✅ PlantUML Repair"]
            RC4["Input: Commit range (oldest→newest)"]
            RC5["Trigger: Graph View"]
        end
    end
```
