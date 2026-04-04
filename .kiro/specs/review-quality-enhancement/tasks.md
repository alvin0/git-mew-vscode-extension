# Implementation Plan: Review Quality Enhancement

## Overview

Triển khai incremental 8 requirements nâng cấp chất lượng multi-agent code review. Mỗi task chỉ rõ: file nào cần sửa, code cần thêm/sửa ở đâu, function signatures, và logic chi tiết để dev có thể implement mà không cần đọc lại design doc.

**Execution flow sau khi hoàn thành:**
```
Pre-Analysis (DependencyGraph + Codebase Knowledge Cache)
  → Phase 1: Code Reviewer + Flow Diagram + Security Agent + Detail Change (song song)
    → Structured Self-Audit (Draft-Critique-Revise-Freeze + CoVe cho CR & SA)
      → Risk Hypothesis Generator (CR + FD + SA → hypotheses)
        → Phase 2: Observer (+ find_references, get_symbol_definition, no TODO limit)
          → Observer Self-Audit
            → Phase 3: 4 Synthesis Agents song song (Summary&Detail, Improvement Suggestions, Risk&TODO, Diagram&Assessment)
              → Deterministic Merge (string concat, no LLM call)
                → Save to Review Memory
```

## Tasks

- [ ] 1. Mở rộng types và interfaces cốt lõi
  - [ ] 1.1 Thêm SecurityAnalystOutput và cập nhật existing interfaces trong `src/services/llm/orchestrator/orchestratorTypes.ts`
    - Mở file `src/services/llm/orchestrator/orchestratorTypes.ts`
    - Thêm interface `SecurityAnalystOutput` ngay sau `ObserverOutput` interface (khoảng line 180):
      ```typescript
      export interface SecurityAnalystOutput {
        vulnerabilities: Array<{
          file: string;
          location: string;
          cweId: string;  // e.g. "CWE-79", "CWE-89"
          type: 'injection' | 'auth_bypass' | 'secrets_exposure' | 'unsafe_deserialization' | 'path_traversal' | 'xss' | 'ssrf' | 'other';
          severity: 'critical' | 'high' | 'medium' | 'low';
          confidence: number;  // 0.0-1.0
          description: string;
          taintSource?: string;  // e.g. "req.body.username"
          taintSink?: string;    // e.g. "db.query()"
          remediation: string;
        }>;
        authFlowConcerns: Array<{
          description: string;
          affectedEndpoints: string[];
          severity: 'critical' | 'high' | 'medium' | 'low';
        }>;
        inputValidationGaps: Array<{
          file: string;
          location: string;
          inputSource: string;
          missingValidation: string;
          severity: 'critical' | 'high' | 'medium' | 'low';
        }>;
        dataExposureRisks: Array<{
          file: string;
          location: string;
          dataType: string;
          exposureVector: string;
          severity: 'critical' | 'high' | 'medium' | 'low';
        }>;
      }
      ```
    - Tìm `CodeReviewerOutput` interface, thêm `confidence: number;` vào mỗi item trong `issues[]` (sau field `suggestion`)
    - Tìm `ObserverOutput` interface:
      - Thêm `confidence: number;` vào mỗi item trong `risks[]`
      - Thêm `likelihood?: string;`, `impact?: string;`, `mitigation?: string;` vào `risks[]`
      - Thêm `rationale?: string;`, `expectedOutcome?: string;`, `priority?: 'high' | 'medium' | 'low';` vào `todoItems[]`
    - Tìm `StructuredAgentReport` type union, thêm: `| { role: 'Security Analyst'; structured: SecurityAnalystOutput; raw: string }`
    - Tìm `RiskHypothesis` interface, thêm field: `category: 'integration' | 'security' | 'correctness' | 'performance';`
    - Tìm `AgentPrompt` type, trong field `outputSchema`, thêm `'security-analyst'` vào union: `'code-reviewer' | 'flow-diagram' | 'observer' | 'security-analyst'`
    - _Requirements: 3.3, 3.4, 6.1, 6.2, 6.3, 7.6_

  - [ ] 1.2 Thêm StructuredAuditResult và SynthesisAgentContext interfaces trong `src/services/llm/orchestrator/orchestratorTypes.ts`
    - Thêm ngay sau SecurityAnalystOutput:
      ```typescript
      export interface StructuredAuditResult {
        verdict: 'PASS' | 'NEEDS_REVISION';
        issues: Array<{
          severity: 'critical' | 'major' | 'minor';
          location: string;
          description: string;
        }>;
        additions: unknown[];  // New findings discovered during audit
        removals: Array<{
          findingIndex: number;
          reason: string;  // e.g. "failed_verification", "insufficient_evidence"
        }>;
        verificationResults?: Array<{  // Only for CR & SA (Chain-of-Verification)
          findingIndex: number;
          questions: string[];
          answers: string[];
          passed: boolean;
        }>;
      }

      export interface SynthesisAgentContext {
        diffSummary: string;
        changedFiles: UnifiedDiffFile[];
        outputContract: string;
        suppressedFindings: SuppressedFinding[];
        resolutionStats: ResolutionStats;
        codeReviewerFindings?: CodeReviewerOutput;
        securityFindings?: SecurityAnalystOutput;
        observerFindings?: ObserverOutput;
        flowDiagramFindings?: FlowDiagramOutput;
        detailChangeReport?: string;
        hypothesisVerdicts?: Array<{ hypothesisIndex: number; verdict: string; evidence: string }>;
        dependencyGraphSummary?: string;
      }
      ```
    - Note: `SuppressedFinding` và `ResolutionStats` sẽ được import từ `reviewMemoryTypes.ts` (task 2.1)
    - _Requirements: 2.5, 8.3_

  - [ ]* 1.3 Write property test cho SecurityAnalystOutput parse round-trip
    - Tạo file `src/services/llm/orchestrator/__tests__/orchestratorTypes.test.ts`
    - Test: serialize SecurityAnalystOutput → JSON → parse lại → so sánh deep equal
    - Dùng `fast-check` với arbitrary SecurityAnalystOutput generator
    - **Property 25** — _Validates: Req 3.3_

- [ ] 2. Tạo Review Memory Service
  - [ ] 2.1 Tạo type definitions trong `src/services/llm/reviewMemoryTypes.ts`
    - Tạo file mới `src/services/llm/reviewMemoryTypes.ts` với nội dung:
      ```typescript
      export interface PatternEntry {
        id: string;                    // UUID
        description: string;           // e.g. "Missing null check in service layer"
        category: 'correctness' | 'security' | 'performance' | 'maintainability' | 'testing';
        frequencyCount: number;        // Tăng mỗi khi pattern xuất hiện lại
        firstSeen: number;             // Unix timestamp ms
        lastSeen: number;              // Unix timestamp ms
        filePatterns: string[];        // Glob patterns, e.g. ["src/services/**/*.ts"]
        averageSeverity: string;       // "critical" | "major" | "minor" | "suggestion"
        sourceAgents: string[];        // ["Code Reviewer", "Security Analyst"]
      }

      export interface SuppressedFinding {
        filePattern: string;           // Glob, e.g. "src/commands/**/*.ts"
        issueCategory: string;         // "correctness" | "security" | etc.
        descriptionHash: string;       // SHA-256 of normalized description
        dismissReason?: string;        // Optional user-provided reason
        dismissedAt: number;           // Unix timestamp ms
      }

      export interface FindingSignature {
        file: string;
        category: string;
        description: string;
      }

      export interface ReviewSummary {
        id: string;                    // UUID
        timestamp: number;
        baseBranch: string;
        compareBranch: string;
        changedFiles: string[];
        qualityVerdict: string;
        issueCounts: Record<string, number>;         // severity → count
        securityVulnCounts: Record<string, number>;  // vuln type → count
        topFindings: Array<{ severity: string; description: string; file: string }>;
        resolutionRate?: number;       // 0.0-1.0
      }

      export type ResolutionAction = 'resolved' | 'dismissed' | 'acknowledged';

      export interface ResolutionRecord {
        findingId: string;
        action: ResolutionAction;
        timestamp: number;
        reviewId: string;
      }

      export interface ResolutionStats {
        overallRate: number;
        byAgent: Record<string, number>;
        historicalDismissRates: Record<string, number>;  // "category:filePattern" → dismiss rate
      }

      export interface MemoryStats {
        totalPatterns: number;
        totalSuppressedFindings: number;
        cacheHitRate: number;
        totalReviewsStored: number;
        averageResolutionRate: number;
      }
      ```
    - _Requirements: 4.2, 4.4, 4.8, 4.13_

  - [ ] 2.2 Implement Pattern Memory trong `src/services/llm/ReviewMemoryService.ts`
    - Tạo file mới `src/services/llm/ReviewMemoryService.ts`
    - Tạo helper class `InMemoryStorage` implement `vscode.Memento` interface (get/update methods) dùng `Map<string, any>` — dùng làm fallback khi workspaceState không khả dụng
    - Tạo class `ReviewMemoryService`:
      - Constructor: `constructor(private readonly storage: vscode.Memento)` — nếu storage là undefined/null, tạo InMemoryStorage + `console.warn('[ReviewMemory] workspaceState unavailable, using in-memory fallback')`
      - Key prefix: `private static readonly KEY_PREFIX = 'gitmew.reviewMemory.'`
      - Private helper: `private key(suffix: string): string { return ReviewMemoryService.KEY_PREFIX + suffix; }`
      - Private helper: `private async read<T>(suffix: string): Promise<T | undefined>` — đọc từ storage, try/catch JSON parse, nếu corrupted → xóa key + log warning + return undefined
      - Private helper: `private async write<T>(suffix: string, data: T): Promise<void>` — ghi vào storage
    - Implement Pattern Memory methods:
      - `async getPatterns(changedFileGlobs: string[]): Promise<PatternEntry[]>` — đọc tất cả patterns, filter theo glob match với changedFileGlobs, sort by `frequencyCount * (1 / daysSinceLastSeen)`, return max 10
      - `async savePatterns(agentOutputs: StructuredAgentReport[]): Promise<void>` — extract patterns từ CodeReviewerOutput.issues[] (group by category + file directory pattern), SecurityAnalystOutput.vulnerabilities[] (group by CWE type + file pattern), ObserverOutput.risks[] (group by affectedArea). Nếu pattern đã tồn tại (match description similarity > 0.7) → tăng frequencyCount + update lastSeen. Nếu mới → tạo PatternEntry mới. Enforce max 50 patterns (xóa lowest frequency nếu vượt)
      - `async decayPatterns(): Promise<void>` — với mỗi pattern có `lastSeen` > 30 ngày trước: `frequencyCount *= 0.5`. Xóa patterns có `frequencyCount < 1`
    - Dùng `minimatch` hoặc `picomatch` library cho glob matching (đã có trong VS Code extension dependencies)
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.16_

  - [ ]* 2.3 Write property tests cho Pattern Memory
    - Tạo file `src/services/llm/__tests__/ReviewMemoryService.test.ts`
    - **Property 10**: Sau N lần savePatterns(), `patterns.length <= 50` luôn đúng
    - **Property 11**: Pattern với lastSeen > 30 ngày → frequencyCount giảm 50% sau decayPatterns(). Pattern với frequencyCount < 1 sau decay → bị xóa
    - **Property 12**: getPatterns() trả về max 10 items, sorted by frequency × recency, mỗi item match ít nhất 1 changedFile glob
    - _Validates: Req 4.4, 4.5, 4.6_

  - [ ] 2.4 Implement False Positive Suppression trong `src/services/llm/ReviewMemoryService.ts`
    - Thêm vào class ReviewMemoryService:
      - `async getSuppressedFindings(): Promise<SuppressedFinding[]>` — đọc từ storage key `suppressed`
      - `async suppressFinding(finding: SuppressedFinding): Promise<void>` — thêm vào list. Nếu list.length > 200 → xóa item có `dismissedAt` cũ nhất (LRU eviction)
      - `async isFindingSuppressed(signature: FindingSignature): Promise<boolean>` — check 3 điều kiện:
        1. `minimatch(signature.file, suppressed.filePattern)` — glob match
        2. `signature.category === suppressed.issueCategory` — exact match
        3. `sha256(normalize(signature.description)) === suppressed.descriptionHash` HOẶC `wordOverlapRatio(signature.description, denormalize(suppressed)) >= 0.7`
        - Cả 3 phải true → return true
      - Helper: `private normalize(desc: string): string` — lowercase, remove extra whitespace, trim
      - Helper: `private sha256(text: string): string` — dùng Node.js `crypto.createHash('sha256')`
      - Helper: `private wordOverlapRatio(a: string, b: string): number` — copy logic từ `AgentPromptBuilder.wordOverlapRatio()` (đã có trong codebase)
    - _Requirements: 4.8, 4.9, 4.10_

  - [ ]* 2.5 Write property tests cho False Positive Suppression
    - **Property 13**: Sau N lần suppressFinding(), `suppressedFindings.length <= 200`. Khi thêm item thứ 201, item có dismissedAt cũ nhất bị xóa
    - **Property 14**: isFindingSuppressed() return true iff cả 3 conditions match (glob + category + description similarity)
    - _Validates: Req 4.9, 4.10_

  - [ ] 2.6 Implement Review History, Resolution Tracking, và Management methods trong `src/services/llm/ReviewMemoryService.ts`
    - Thêm vào class ReviewMemoryService:
      - **Review History:**
        - `async getReviewHistory(limit: number = 20): Promise<ReviewSummary[]>` — đọc từ storage, return sorted by timestamp DESC, max `limit`
        - `async saveReviewSummary(summary: ReviewSummary): Promise<void>` — thêm vào list. Nếu list.length > 20 → xóa oldest
        - `async getRelevantHistory(changedFiles: string[], limit: number): Promise<ReviewSummary[]>` — filter reviews có ít nhất 1 changedFile overlap, return max `limit`, sorted by timestamp DESC
      - **Resolution Tracking:**
        - `async recordResolution(findingId: string, action: ResolutionAction, reviewId: string): Promise<void>` — lưu ResolutionRecord vào storage
        - `async getResolutionRate(): Promise<number>` — tính `(resolved + acknowledged) / total` từ tất cả records
        - `async getAgentResolutionRates(): Promise<Record<string, number>>` — tính rate per agent (cần findingId encode agent name, e.g. "CR:issue-1")
        - `async getHistoricalDismissRates(): Promise<Record<string, number>>` — tính dismiss rate per "category:filePattern" combination. Nếu rate > 0.7 → confidence adjustment -0.15 cho findings tương tự
      - **Management:**
        - `async clear(): Promise<void>` — xóa tất cả keys có prefix `gitmew.reviewMemory.`
        - `async getStats(): Promise<MemoryStats>` — return counts cho patterns, suppressions, reviews, rates
        - `async validateAndRepair(): Promise<void>` — đọc mỗi key, try parse JSON, nếu fail → xóa key + log warning
    - _Requirements: 4.13, 4.15, 4.17, 4.18, 6.6, 6.7, 6.8_

  - [ ]* 2.7 Write property tests cho Review History và Resolution
    - **Property 15**: Review history length <= 20 sau bất kỳ số lần save
    - **Property 23**: Resolution rate = (resolved + acknowledged) / total
    - **Property 24**: Category+filePattern có dismiss_rate > 70% → confidence giảm 0.15 (clamp >= 0)
    - **Property 27**: savePatterns() tạo PatternEntry grouped by (category, file pattern) với correct frequency counts
    - **Property 28**: getStats() trả về đúng counts
    - _Validates: Req 4.13, 6.7, 6.8, 6.10, 4.3, 4.17_

- [ ] 3. Checkpoint — Ensure all tests pass
  - Chạy `npm test` hoặc test runner. Nếu có lỗi, fix trước khi tiếp tục.

- [ ] 4. Nâng cấp ContextBudgetManager
  - [ ] 4.1 Thêm Security Analyst budget trong `src/services/llm/orchestrator/ContextBudgetManager.ts`
    - Tìm `DEFAULT_BUDGET_CONFIG` object (hoặc `agentBudgetRatios` nếu có)
    - Thêm entry `'Security Analyst': 0.30` — cùng ratio với Code Reviewer
    - Điều chỉnh ratios hiện tại: Code Reviewer → 0.30 (giảm từ ~0.40), Flow Diagram → 0.20, Observer → 0.20
    - Tìm method `allocateAgentBudgets()` — đảm bảo nó iterate qua tất cả agent roles trong config (bao gồm 'Security Analyst' mới)
    - Nếu `allocateAgentBudgets()` hardcode agent names → refactor để đọc từ config
    - _Requirements: 3.14_

  - [ ] 4.2 Thêm Synthesis Agent budget allocation trong `src/services/llm/orchestrator/ContextBudgetManager.ts`
    - Thêm constant:
      ```typescript
      export const SYNTHESIS_BUDGET_RATIOS: Record<string, number> = {
        'Summary & Detail': 0.15,
        'Improvement Suggestions': 0.40,  // Largest — needs Before/After snippets
        'Risk & TODO': 0.30,              // Second — needs deep risk analysis
        'Diagram & Assessment': 0.15,
      };
      ```
    - Thêm method:
      ```typescript
      allocateSynthesisBudgets(
        contextWindow: number,
        maxOutputTokens: number,
        systemTokens: number,
      ): AgentBudgetAllocation[]
      ```
    - Logic: tính available budget = contextWindow - systemTokens - safety margin, rồi phân bổ theo SYNTHESIS_BUDGET_RATIOS. Mỗi agent nhận `AgentBudgetAllocation` với `totalBudget`, `diffBudget` (0 cho synthesis agents — họ nhận structured data, không nhận raw diff), `referenceBudget` (0), `sharedContextBudget` (phần lớn budget vì input là structured findings)
    - _Requirements: 8.11_

  - [ ]* 4.3 Write property tests cho budget allocation
    - **Property 7**: Security Analyst ratio ≈ Code Reviewer ratio (±5%)
    - **Property 32**: Improvement Suggestions ratio ≈ 40% (±5%) của synthesis budget
    - _Validates: Req 3.14, 8.11_

- [ ] 5. Xây dựng Agent prompts mới trong AgentPromptBuilder
  - [ ] 5.1 Thêm `buildSecurityAgentPrompt()` trong `src/services/llm/orchestrator/AgentPromptBuilder.ts`
    - Thêm constant `SECURITY_AGENT_INSTRUCTIONS` (khoảng 50 lines) ngay sau `DETAIL_CHANGE_INSTRUCTIONS`:
      ```typescript
      const SECURITY_AGENT_INSTRUCTIONS = `## Security Analyst Agent
      You are a specialized Security Analyst using Detection-Triage methodology.

      ### Detection Phase
      Analyze the diff for security vulnerabilities following OWASP Top 10:
      - **Injection** (CWE-79 XSS, CWE-89 SQLi, CWE-78 OS Command, CWE-918 SSRF)
      - **Auth bypass** (CWE-287, CWE-862, CWE-863)
      - **Secrets exposure** (CWE-798 hardcoded credentials, CWE-532 log injection)
      - **Unsafe deserialization** (CWE-502)
      - **Path traversal** (CWE-22)
      - **Input validation gaps** (CWE-20)

      ### Taint Analysis
      Trace data flow from untrusted sources to sensitive sinks:
      - Sources: request params, user input, external APIs, environment variables, file reads
      - Sinks: DB queries, file operations, command execution, response rendering, logging

      ### Confidence Scoring
      Assign confidence (0.0-1.0) per finding:
      - Base: 0.5 (pattern match only)
      - +0.2 if complete taint flow traced (source → sink via tool calls)
      - +0.1 if CWE classification matches known vulnerability pattern
      - +0.1 if verified via read_file or get_symbol_definition
      - -0.2 if only pattern matching without context verification

      Output JSON matching SecurityAnalystOutput schema.
      Return ONLY valid JSON. Do not wrap in markdown fences.`;
      ```
    - Thêm method `buildSecurityAgentPrompt(ctx: AgentPromptBuildContext, budget: AgentBudgetAllocation): AgentPrompt` — follow exact same pattern as `buildCodeReviewerPrompt()`:
      - System message: `this.buildReviewAgentSystemMessage(ctx, SECURITY_AGENT_INSTRUCTIONS)`
      - Prompt parts: full diff (truncated to diffBudget) + reference context + dependency graph ('full') + shared context
      - Tools: `combineTools([searchCodeTool, findReferencesTool, readFileTool, getSymbolDefinitionTool, getDiagnosticsTool, queryContextTool], ctx.additionalTools)`
      - Return: `{ role: 'Security Analyst', systemMessage, prompt, tools, phase: 1, outputSchema: 'security-analyst', selfAudit: true, maxIterations: 3, sharedStore: ctx.sharedContextStore, compareBranch: ctx.compareBranch, gitService: ctx.gitService }`
    - _Requirements: 3.1, 3.2, 3.7, 3.8, 3.9, 3.13_

  - [ ] 5.2 Mở rộng Observer Agent tools trong `src/services/llm/orchestrator/AgentPromptBuilder.ts`
    - Tìm method `buildObserverPrompt()` (khoảng line 350)
    - Tìm `const tools = combineTools([` block trong method
    - Thêm `findReferencesTool,` và `getSymbolDefinitionTool,` vào đầu array (trước getDiagnosticsTool)
    - Tìm `OBSERVER_INSTRUCTIONS` constant (khoảng line 95)
    - Xóa dòng `Produce a short execution todo list with **no more than 4 items**.` → thay bằng `Produce a comprehensive execution todo list. There is NO limit on the number of items — be thorough.`
    - Thêm vào cuối OBSERVER_INSTRUCTIONS (trước dòng `Output your findings`):
      ```
      ### Tool Usage Priority
      1. Use \`find_references\` to verify integration concerns before reporting them.
      2. Use \`get_symbol_definition\` to understand implementation details of affected symbols.
      3. Only report integration risks that you have verified via tool calls.

      ### Output Completeness
      - Each TODO item should include: action, rationale, expected outcome, priority.
      - Each risk should include: description, affected areas, likelihood, impact, mitigation.
      ```
    - Cập nhật ObserverOutput JSON schema trong OBSERVER_INSTRUCTIONS để match new fields:
      ```
      {
        "risks": [{ "description", "severity", "affectedArea", "confidence", "likelihood", "impact", "mitigation" }],
        "todoItems": [{ "action", "parallelizable", "rationale", "expectedOutcome", "priority" }],
        "integrationConcerns": []
      }
      ```
    - _Requirements: 1.1, 1.2, 1.5, 1.6_

  - [ ] 5.3 Inject Review Memory context vào agent prompts trong `src/services/llm/orchestrator/AgentPromptBuilder.ts`
    - Thêm optional fields vào `AgentPromptBuildContext` interface (trong orchestratorTypes.ts):
      ```typescript
      relevantPatterns?: PatternEntry[];
      relevantHistory?: ReviewSummary[];
      resolutionStats?: ResolutionStats;
      suppressedFindings?: SuppressedFinding[];
      ```
    - Trong `buildCodeReviewerPrompt()`: sau shared context section, thêm:
      ```typescript
      if (ctx.relevantPatterns?.length) {
        const patternText = ctx.relevantPatterns.slice(0, 10).map(p =>
          `- [${p.category}] ${p.description} (seen ${p.frequencyCount} times, last: ${new Date(p.lastSeen).toLocaleDateString()})`
        ).join('\n');
        parts.push('## Project Patterns from Previous Reviews\n' + patternText);
      }
      if (ctx.relevantHistory?.length) {
        const historyText = ctx.relevantHistory.slice(0, 2).map(h =>
          `- Review ${new Date(h.timestamp).toLocaleDateString()}: ${h.qualityVerdict}, ${Object.entries(h.issueCounts).map(([k,v]) => `${v} ${k}`).join(', ')}`
        ).join('\n');
        parts.push('## Recent Review History for These Files\n' + historyText);
      }
      ```
    - Apply same pattern cho `buildSecurityAgentPrompt()` (max 10 patterns, max 2 security-related history)
    - Trong `buildObserverPrompt()`: inject max 3 relevant reviews (thay vì 2)
    - _Requirements: 4.6, 4.7, 4.14, 6.11_

  - [ ]* 5.4 Write property tests cho agent prompt building
    - **Property 16**: Observer nhận max 3 reviews, CR max 2, SA max 2
    - _Validates: Req 4.14_

- [ ] 6. Nâng cấp Structured Self-Audit trong MultiAgentExecutor
  - [ ] 6.1 Implement `runStructuredSelfAudit()` trong `src/services/llm/orchestrator/MultiAgentExecutor.ts`
    - Thêm private field vào class: `private diffSummary: string = '';` và `private changedFiles: UnifiedDiffFile[] = [];`
    - Thêm setter: `setDiffContext(diffSummary: string, changedFiles: UnifiedDiffFile[]): void`
    - Thêm method `private async runStructuredSelfAudit(agent, adapter, lastResponse, sharedStore, signal?, request?): Promise<any>`:
      - **Step 1 — Build diff context:** Tính token budget cho audit = `adapter.getMaxOutputTokens()`. Nếu `estimateTokens(this.diffSummary) > auditBudget * 0.3` → dùng changed files summary only (file paths + line counts). Else → dùng full diffSummary
      - **Step 2 — Build audit prompt:**
        ```
        Here is your previous analysis:
        {previousAnalysis}
        ---
        ## Diff Context
        {effectiveDiffContext}
        ---
        Self-audit your analysis. Output a JSON object with this schema:
        {
          "verdict": "PASS" | "NEEDS_REVISION",
          "issues": [{ "severity", "location", "description" }],
          "additions": [...new findings...],
          "removals": [{ "findingIndex", "reason" }]
        }
        ```
      - **Step 3 — Chain-of-Verification (chỉ cho CR & SA):** Nếu `agent.role === 'Code Reviewer' || agent.role === 'Security Analyst'`, thêm vào audit prompt:
        ```
        ### Chain-of-Verification
        For each finding with severity "critical" or "major":
        1. Generate 1-2 verification questions about the finding
        2. Answer each question using the diff context
        3. If answers contradict the finding → add to removals with reason "failed_verification"
        Include "verificationResults" in your JSON output.
        ```
      - **Step 4 — Observer checklist (giữ logic hiện tại từ runObserverSelfAudit):** Nếu `agent.role === 'Observer' && sharedStore`, build checklist từ Phase 1 findings (copy logic từ `runObserverSelfAudit`)
      - **Step 5 — Call LLM:** Dùng `calibration.safeTruncatePrompt()` + `calibration.generateTextWithAutoRetry()` (giống runSelfAudit hiện tại)
      - **Step 6 — Parse result:** Try parse JSON từ response. Nếu parse fail → treat as verdict "PASS", log warning
      - **Step 7 — Apply result:** Nếu verdict "NEEDS_REVISION" → merge additions vào agent output, remove findings at removals[].findingIndex. Nếu "PASS" → giữ nguyên
      - **Step 8 — Log:** Log `{ verdict, issueCount, additionCount, removalCount, verificationCount }` vào LLM log
    - Trong method `runAgent()`: thay thế call tới `runSelfAudit()` và `runObserverSelfAudit()` bằng `runStructuredSelfAudit()`
    - Giữ lại `runSelfAudit()` và `runObserverSelfAudit()` methods cũ nhưng mark `@deprecated` — sẽ xóa sau khi verify
    - _Requirements: 2.1-2.10_

  - [ ]* 6.2 Write property tests cho Structured Self-Audit
    - **Property 1**: Audit prompt luôn chứa diff context (diffSummary hoặc changed files summary)
    - **Property 2**: Nếu diffSummary tokens > 30% budget → chỉ có changed files summary
    - **Property 3**: NEEDS_REVISION → output = original + additions - removals
    - **Property 4**: PASS → output unchanged
    - **Property 5**: verificationResults.passed === false → removal với reason "failed_verification"
    - _Validates: Req 2.1-2.4, 2.6, 2.7, 2.9_

- [ ] 7. Checkpoint — Ensure all tests pass

- [ ] 8. Nâng cấp Risk Hypothesis Generator
  - [ ] 8.1 Cập nhật `src/services/llm/orchestrator/RiskHypothesisGenerator.ts`
    - Tìm `MAX_HYPOTHESES` constant → đổi từ `8` thành `10`
    - Tìm method `generate()` → thêm parameter: `securityOutput: SecurityAnalystOutput | undefined` (sau `flowDiagramOutput`)
    - Trong `generate()`: sau `const heuristics = this.generateHeuristicHypotheses(...)` → truyền thêm `securityOutput`
    - Tìm method `generateHeuristicHypotheses()` → thêm parameter `securityOutput: SecurityAnalystOutput | undefined`
    - Thêm 3 rules mới vào cuối `generateHeuristicHypotheses()`:
      - **Rule 9 (Taint flow):** Với mỗi vulnerability có `taintSource` trong securityOutput:
        ```typescript
        hypotheses.push({
          question: `Tainted data from "${vuln.taintSource}" flows to "${vuln.taintSink}" in ${vuln.file}. Are there other sinks not covered by the diff?`,
          affectedFiles: [vuln.file, ...this.getConsumersForFile(vuln.file, graph)],
          evidenceNeeded: "Check other files that import from this module for similar sink patterns.",
          severityEstimate: "high",
          source: "heuristic",
          category: "security",
        });
        ```
      - **Rule 10 (Auth flow):** Với mỗi authFlowConcern:
        ```typescript
        hypotheses.push({
          question: `Auth flow concern: "${concern.description}". Are there bypass paths through other endpoints?`,
          affectedFiles: concern.affectedEndpoints,
          evidenceNeeded: "Check auth middleware usage across all endpoints.",
          severityEstimate: "high",
          source: "heuristic",
          category: "security",
        });
        ```
      - **Rule 11 (Cascading security):** Với mỗi vulnerability trong file có >= 3 consumers:
        ```typescript
        const consumers = this.getConsumersForFile(vuln.file, graph);
        if (consumers.length >= 3) {
          hypotheses.push({
            question: `Security vulnerability in ${vuln.file} (${vuln.cweId}). ${consumers.length} consumers may be affected.`,
            affectedFiles: [vuln.file, ...consumers],
            evidenceNeeded: "Verify consumers handle tainted data safely.",
            severityEstimate: "high",
            source: "heuristic",
            category: "security",
          });
        }
        ```
    - Thêm `category` field vào tất cả existing hypotheses (Rules 1-8): default `"integration"` cho Rules 1-2, `"correctness"` cho Rules 3-5, `"integration"` cho Rule 6, `"correctness"` cho Rule 7, `"correctness"` cho Rule 8
    - Tìm method `buildSummaries()` → thêm security findings section:
      ```typescript
      if (securityOutput?.vulnerabilities?.length) {
        parts.push("\nSecurity Findings:");
        for (const vuln of securityOutput.vulnerabilities.slice(0, 10)) {
          parts.push(`- [${vuln.severity}] ${vuln.file}:${vuln.location} — ${vuln.cweId}: ${vuln.description}`);
        }
      }
      ```
    - _Requirements: 7.1-7.6_

  - [ ]* 8.2 Write property tests cho Risk Hypothesis Generator
    - **Property 8**: SecurityAnalystOutput có vulnerability với taintSource → ít nhất 1 hypothesis có category "security"
    - **Property 9**: Vulnerability trong file có >= 3 importedBy → hypothesis về cascading impact
    - **Property 26**: buildSummaries() có "Security Findings" section khi có vulnerabilities
    - _Validates: Req 7.2, 7.3, 7.5, 7.6_

- [ ] 9. Tích hợp Security Agent vào Phase 1 execution
  - [ ] 9.1 Cập nhật `src/services/llm/orchestrator/MultiAgentExecutor.ts` — parse Security Agent output
    - Tìm method `parseStructuredOutput()` (khoảng line 252)
    - Thêm case vào switch statement:
      ```typescript
      case 'security-analyst':
        if (Array.isArray(parsed.vulnerabilities)) {
          return { role: 'Security Analyst', structured: parsed, raw: body };
        }
        break;
      ```
    - Tìm method `executePhasedAgents()` — trong phần "Parse Phase 1 structured outputs":
      - Đảm bảo loop `for (let i = 0; i < phase1.length; i++)` xử lý được Security Agent (nó đã generic, chỉ cần verify)
      - Trong phần store findings: thêm check `phase1[i].role === 'Security Analyst'` → `type: 'security'`
    - Trong phần "Risk Hypothesis Generation": tìm dòng gọi `hypothesisGenerator.generate(crReport, fdReport, graph, adapter, signal)`
      - Thêm `const saReport = structuredReports.find(r => r.role === 'Security Analyst');`
      - Đổi call thành: `hypothesisGenerator.generate(crReport.structured, fdReport.structured, saReport?.structured, graph, adapter, signal)`
    - _Requirements: 3.5, 3.6, 3.10, 3.15_

  - [ ] 9.2 Cập nhật `src/services/llm/orchestrator/SharedContextStore.ts` — serialize security findings
    - Tìm method `serializeForAgent()` (khoảng line 137)
    - Trong method `serializeFindings()` hoặc tương đương: thêm handling cho findings có `type === 'security'`
    - Serialize SecurityAnalystOutput: list vulnerabilities với format `[severity] file:location — CWE-XX: description (confidence: X.X)`
    - Đảm bảo Observer agent nhận được security findings khi gọi `serializeForAgent('Observer', budget)`
    - _Requirements: 3.6, 3.11_

- [ ] 10. Xây dựng Phase 3 — Synthesis Agents và Deterministic Merge
  - [ ] 10.1 Thêm 4 Synthesis Agent prompt builders trong `src/services/llm/orchestrator/AgentPromptBuilder.ts`
    - **buildSummaryDetailAgentPrompt(ctx: SynthesisAgentContext, budget: AgentBudgetAllocation): AgentPrompt**
      - System message: Hướng dẫn viết "## 2. Summary of Changes" (max 100 words, high-level paragraph) + "## 3. Detail Change" (long-form logic explanation)
      - Prompt: inject `ctx.detailChangeReport` (raw markdown từ Detail Change agent) + summary of all agent findings (1-2 sentences per agent)
      - Tools: KHÔNG có tools — pure text synthesis
      - Config: `{ role: 'Summary & Detail', phase: 3, selfAudit: false, maxIterations: 2 }`
    - **buildImprovementSuggestionsAgentPrompt(ctx: SynthesisAgentContext, budget: AgentBudgetAllocation): AgentPrompt**
      - System message: Hướng dẫn viết "## 6. Improvement Suggestions" section. QUAN TRỌNG:
        - KHÔNG giới hạn số lượng suggestions
        - Viết chi tiết cho TẤT CẢ findings từ Code Reviewer + Security Agent
        - Group by category: "### Correctness", "### Security", "### Performance", "### Maintainability", "### Testing"
        - Mỗi suggestion dùng card layout: File & Location, Issue, Why it matters, Actionable fix, Confidence score
        - Viết Before/After code snippets cho mỗi finding khi có thể (dùng tools đọc code thực tế)
        - Viết Guided Change Snippets khi fix rõ ràng
        - Giữ nguyên provenance tags [CR], [SA], [XV]
        - Sort by severity DESC, confidence DESC trong mỗi category
      - Prompt: inject ALL CodeReviewerOutput.issues[] + ALL SecurityAnalystOutput findings (confidence >= 0.5) + suppressed findings list + resolution stats
      - Tools: `[readFileTool, searchCodeTool, getSymbolDefinitionTool, queryContextTool]` — để đọc code viết Before/After snippets
      - Config: `{ role: 'Improvement Suggestions', phase: 3, selfAudit: false, maxIterations: 2 }`
    - **buildRiskTodoAgentPrompt(ctx: SynthesisAgentContext, budget: AgentBudgetAllocation): AgentPrompt**
      - System message: Hướng dẫn viết "## 7. Observer TODO List" + "## 8. Potential Hidden Risks". QUAN TRỌNG:
        - KHÔNG giới hạn số TODO items (xóa giới hạn 4 items cũ)
        - Mỗi TODO item: action description, rationale (tại sao cần làm), expected outcome, priority (high/medium/low), prefix [Sequential] hoặc [Parallel]
        - Mỗi Hidden Risk: risk description, affected areas, likelihood (high/medium/low), impact description, mitigation suggestion
        - Include hypothesis verdicts (confirmed/refuted/inconclusive) với evidence
        - Include security risks có confidence >= 0.5
        - Agent CÓ THỂ thêm TODO items và risks mới phát hiện khi đào sâu bằng tools
      - Prompt: inject ALL ObserverOutput.risks[] + ObserverOutput.todoItems[] + hypothesis verdicts + SecurityAnalystOutput risks (confidence >= 0.5) + dependency graph summary
      - Tools: `[findReferencesTool, getRelatedFilesTool, readFileTool, queryContextTool]` — để verify risks và trace integration impact
      - Config: `{ role: 'Risk & TODO', phase: 3, selfAudit: false, maxIterations: 2 }`
    - **buildDiagramAssessmentAgentPrompt(ctx: SynthesisAgentContext, budget: AgentBudgetAllocation): AgentPrompt**
      - System message: Hướng dẫn viết "## 4. Flow Diagram" (polish PlantUML, mỗi diagram có heading + description) + "## 5. Code Quality Assessment" (verdict + 2-3 câu justification)
      - Prompt: inject FlowDiagramOutput.diagrams[] (raw PlantUML) + CodeReviewerOutput.qualityVerdict + summary of issues by severity
      - Tools: KHÔNG có tools — pure text synthesis
      - Config: `{ role: 'Diagram & Assessment', phase: 3, selfAudit: false, maxIterations: 2 }`
    - _Requirements: 8.2-8.7, 8.10, 8.14, 8.15_

  - [ ] 10.2 Thêm `executeSynthesisAgents()` trong `src/services/llm/orchestrator/MultiAgentExecutor.ts`
    - Thêm method:
      ```typescript
      async executeSynthesisAgents(
        agents: AgentPrompt[],
        adapter: ILLMAdapter,
        signal?: AbortSignal,
        request?: ContextGenerationRequest
      ): Promise<Map<string, string>>
      ```
    - Logic:
      - Chạy tất cả agents song song với `concurrency = Math.min(4, agents.length)` (override config.concurrency cho Phase 3)
      - Mỗi agent chạy qua `runAgent()` hiện tại (tool loop + NO self-audit vì selfAudit: false)
      - Collect results vào `Map<string, string>` — key là agent.role, value là output text
      - Nếu agent fail → store error message thay vì throw: `map.set(agent.role, `[ERROR] ${error.message}`)`
      - Return map
    - _Requirements: 8.8, 8.12, 8.13_

  - [ ] 10.3 Implement `mergeSynthesisOutputs()` — deterministic merge function
    - Thêm vào `AgentPromptBuilder.ts` hoặc tạo file mới `src/services/llm/orchestrator/SynthesisMerger.ts`:
      ```typescript
      export function mergeSynthesisOutputs(
        agentOutputs: Map<string, string>,
        changedFiles: UnifiedDiffFile[],
        structuredReports: StructuredAgentReport[],
        suppressedFindings: SuppressedFinding[],
        reviewStartTime: number,
      ): string
      ```
    - Logic (pure function, NO LLM calls):
      1. **Section 1 — Changed File Paths:** Build từ changedFiles: `- \`${file.relativePath}\` — ${file.statusLabel}`
      2. **Section 2-3 — Summary + Detail:** Lấy từ `agentOutputs.get('Summary & Detail')`. Nếu missing/error → fallback: dùng raw detail change report
      3. **Section 4-5 — Diagram + Assessment:** Lấy từ `agentOutputs.get('Diagram & Assessment')`. Nếu missing → fallback: embed raw PlantUML + quality verdict text
      4. **Section 6 — Improvement Suggestions:** Lấy từ `agentOutputs.get('Improvement Suggestions')`. Nếu missing → fallback: render raw issues dưới dạng bullet list từ structured data
      5. **Section 7-8 — TODO + Risks:** Lấy từ `agentOutputs.get('Risk & TODO')`. Nếu missing → fallback: render raw risks + todoItems
      6. **Cross-validation markers:** Scan output cho findings xuất hiện ở cả CR và SA (word overlap > 0.4 + same file) → prepend "[XV] " (cross-validated)
      7. **Provenance tags:** Nếu chưa có tags → add [CR], [SA], [OB] based on finding source
      8. **Metadata footer:** Append HTML comment:
         ```
         <!-- Review Metadata: findings={total}, critical={n}, major={n}, minor={n}, suggestion={n}, by_agent={CR:n, SA:n, OB:n}, cross_validated={n}, suppressed={n}, duration={ms}ms -->
         ```
      9. Return concatenated markdown string
    - _Requirements: 8.8, 8.9, 5.12, 5.13, 5.14, 8.13_

  - [ ]* 10.4 Write property tests cho Synthesis và Merge
    - **Property 6**: Security findings confidence < 0.5 → excluded from output
    - **Property 17**: Merged output chứa tất cả 8 sections
    - **Property 18**: Non-empty data → pre-filled, empty → "None"
    - **Property 19**: Finding ở cả CR + SA (same file, overlap > 0.4) → marked [XV]
    - **Property 20**: Mỗi finding có đúng 1 provenance tag
    - **Property 21**: Findings sorted severity DESC, confidence DESC
    - **Property 22**: Confidence display format: "{emoji} {Severity} ({percentage}%)"
    - **Property 29**: 4 agents combined → tất cả 8 sections có content
    - **Property 30**: ALL CR issues + SA findings (confidence >= 0.5) xuất hiện trong output
    - **Property 31**: Không có limit trên số TODO items và risks
    - **Property 33**: mergeSynthesisOutputs() là pure function, no async, no LLM
    - **Property 34**: Agent fail → fallback raw data, không có section trống
    - _Validates: Req 3.11, 3.12, 5.1-5.14, 6.4, 6.5, 8.2, 8.4, 8.5, 8.8, 8.9, 8.13_

- [ ] 11. Checkpoint — Ensure all tests pass

- [ ] 12. Cập nhật `src/prompts/reviewOutputContract.ts`
  - Tìm `REVIEW_AGENT_INSTRUCTIONS` constant:
    - Thêm agent thứ 5: Security Analyst Agent description (sau Observer Agent, trước Detail Change Agent)
    - Xóa "no more than 4 items" trong Observer Agent description → thay bằng "Produce a comprehensive todo list with no limit on items"
  - Tìm `REVIEW_OUTPUT_CONTRACT` constant:
    - Section "7. Observer TODO List": xóa "Provide at most 4 items" → thay bằng "Provide all necessary items. Each item must include action, rationale, expected outcome, and priority."
    - Thêm instruction cho confidence display: "Display confidence as: 🔴 Critical (95%) or 🟡 Minor (62%)"
    - Thêm instruction cho provenance tags: "Each finding should have a provenance tag: [CR] Code Reviewer, [SA] Security Analyst, [OB] Observer, [XV] Cross-validated"
    - Section "6. Improvement Suggestions": thêm "### Security" as valid category header
  - _Requirements: 8.5, 5.13, 6.5_

- [ ] 13. Tích hợp toàn bộ vào ReviewMergeService
  - [ ] 13.1 Tích hợp ReviewMemoryService vào `src/commands/reviewMerge/reviewMergeService.ts`
    - Thêm import: `import { ReviewMemoryService } from '../../services/llm/ReviewMemoryService';`
    - Thêm field: `private reviewMemory?: ReviewMemoryService;`
    - Thêm method: `setReviewMemory(memory: ReviewMemoryService): void { this.reviewMemory = memory; }`
    - Trong `generateReview()`, sau `prepareAdapter()` và trước build agent prompts:
      ```typescript
      // Load memory context
      let relevantPatterns: PatternEntry[] = [];
      let suppressedFindings: SuppressedFinding[] = [];
      let relevantHistory: ReviewSummary[] = [];
      let resolutionStats: ResolutionStats | undefined;
      if (this.reviewMemory) {
        const fileGlobs = branchDiff.changes.map(f => f.relativePath);
        relevantPatterns = await this.reviewMemory.getPatterns(fileGlobs);
        suppressedFindings = await this.reviewMemory.getSuppressedFindings();
        relevantHistory = await this.reviewMemory.getRelevantHistory(fileGlobs, 3);
        resolutionStats = { overallRate: await this.reviewMemory.getResolutionRate(), byAgent: await this.reviewMemory.getAgentResolutionRates(), historicalDismissRates: await this.reviewMemory.getHistoricalDismissRates() };
        await this.reviewMemory.decayPatterns();  // Run decay on each review
      }
      ```
    - Inject vào `buildContext: AgentPromptBuildContext`:
      ```typescript
      relevantPatterns,
      relevantHistory,
      resolutionStats,
      suppressedFindings,
      ```
    - Sau review hoàn thành (trước return), save session:
      ```typescript
      if (this.reviewMemory) {
        const allReports = sharedStore.getAgentFindings();
        await this.reviewMemory.savePatterns(structuredReports);
        await this.reviewMemory.saveReviewSummary({ id: crypto.randomUUID(), timestamp: Date.now(), baseBranch, compareBranch, changedFiles: branchDiff.changes.map(f => f.relativePath), qualityVerdict: crOutput?.qualityVerdict ?? 'N/A', issueCounts: {...}, securityVulnCounts: {...}, topFindings: [...], resolutionRate: undefined });
      }
      ```
    - _Requirements: 4.1, 4.3, 4.6, 4.7, 4.13, 4.14_

  - [ ] 13.2 Tích hợp Security Agent vào review pipeline trong `src/commands/reviewMerge/reviewMergeService.ts`
    - Trong `generateReview()`, sau build existing agents (codeReviewerAgent, flowDiagramAgent, detailChangeAgent):
      ```typescript
      const securityAgent = promptBuilder.buildSecurityAgentPrompt(buildContext, safeBudgets[3]);  // index 3 = Security Analyst budget
      const agents: AgentPrompt[] = [codeReviewerAgent, flowDiagramAgent, detailChangeAgent, securityAgent];
      ```
    - Cập nhật `safeBudgets` array: đảm bảo `budgetManager.allocateAgentBudgets()` trả về 4+ budgets (CR, FD, Observer, SA)
    - Trong synthesis callback: thêm extract security findings từ sharedStore:
      ```typescript
      const saFindings = sharedStore.getAgentFindings('Security Analyst');
      if (saFindings.length > 0) {
        structuredReports.push({ role: 'Security Analyst', structured: saFindings[0].data as SecurityAnalystOutput, raw: this.getRawAgentReport(reports, 'Security Analyst') });
      }
      ```
    - _Requirements: 3.1, 3.5, 3.14_

  - [ ] 13.3 Thay thế Synthesizer bằng Phase 3 Synthesis Agents trong `src/commands/reviewMerge/reviewMergeService.ts`
    - Thay thế toàn bộ `generateMultiAgentFinalText()` call và synthesis callback bằng:
      ```typescript
      // Phase 1 + 2 execution (existing)
      const agentReports = await this.contextOrchestrator.generateMultiAgentFinalText(
        adapter, agents, systemMessage,
        (reports) => reports.join('\n\n'),  // Simplified — no longer need synthesis here
        signal, request, phasedConfig
      );

      // Phase 3 — Synthesis Agents
      const synthCtx: SynthesisAgentContext = {
        diffSummary: promptBuilder.buildDiffSummary(branchDiff.changes),
        changedFiles: branchDiff.changes,
        outputContract: REVIEW_OUTPUT_CONTRACT,
        suppressedFindings,
        resolutionStats: resolutionStats ?? { overallRate: 0, byAgent: {}, historicalDismissRates: {} },
        codeReviewerFindings: sharedStore.getAgentFindings('Code Reviewer')[0]?.data as CodeReviewerOutput,
        securityFindings: sharedStore.getAgentFindings('Security Analyst')[0]?.data as SecurityAnalystOutput,
        observerFindings: sharedStore.getAgentFindings('Observer')[0]?.data as ObserverOutput,
        flowDiagramFindings: sharedStore.getAgentFindings('Flow Diagram')[0]?.data as FlowDiagramOutput,
        detailChangeReport: this.getRawAgentReport(agentReports, 'Detail Change'),
        hypothesisVerdicts: (sharedStore.getAgentFindings('Observer')[0]?.data as ObserverOutput)?.hypothesisVerdicts,
        dependencyGraphSummary: dependencyGraph ? DependencyGraphIndex.serializeForPrompt(dependencyGraph, 'summary') : undefined,
      };

      const synthBudgets = budgetManager.allocateSynthesisBudgets(adapterContextWindow, adapterMaxOutputTokens, systemTokens);
      const synthAgents = [
        promptBuilder.buildSummaryDetailAgentPrompt(synthCtx, synthBudgets[0]),
        promptBuilder.buildImprovementSuggestionsAgentPrompt(synthCtx, synthBudgets[1]),
        promptBuilder.buildRiskTodoAgentPrompt(synthCtx, synthBudgets[2]),
        promptBuilder.buildDiagramAssessmentAgentPrompt(synthCtx, synthBudgets[3]),
      ];

      onProgress?.("Running synthesis agents...");
      const synthOutputs = await this.contextOrchestrator.multiAgentExecutor.executeSynthesisAgents(synthAgents, adapter, signal, request);

      const finalReport = mergeSynthesisOutputs(synthOutputs, branchDiff.changes, structuredReports, suppressedFindings, Date.now() - reviewStartTime);
      ```
    - Thêm `const reviewStartTime = Date.now();` ở đầu `generateReview()`
    - _Requirements: 8.1, 8.2, 8.8, 8.9, 4.10_

  - [ ] 13.4 Register "Git Mew: Clear Review Memory" command
    - Trong `src/extension.ts`: thêm command registration:
      ```typescript
      context.subscriptions.push(
        vscode.commands.registerCommand('gitmew.clearReviewMemory', async () => {
          await reviewMemoryService.clear();
          vscode.window.showInformationMessage('Git Mew: Review memory cleared.');
        })
      );
      ```
    - Trong `package.json` → `contributes.commands`: thêm `{ "command": "gitmew.clearReviewMemory", "title": "Git Mew: Clear Review Memory" }`
    - _Requirements: 4.15_

  - [ ]* 13.5 Write integration tests cho full review flow
    - Test Phase 1 với 5 agents chạy đúng thứ tự (CR, FD, DC, SA song song → Observer)
    - Test Phase 3 synthesis agents produce complete report với tất cả 8 sections
    - Test memory persistence: save → load → verify data integrity
    - Test suppression: suppress finding → next review → finding không xuất hiện
    - Test fallback: synthesis agent fail → section vẫn có content từ raw data
    - _Requirements: 3.5, 3.6, 8.8, 4.1, 4.10_

- [ ] 14. Cập nhật ReviewStagedChangesService tương tự ReviewMergeService
  - Apply tất cả thay đổi từ task 13 cho `src/commands/reviewStagedChanges/reviewStagedChangesService.ts`:
    - Tích hợp ReviewMemoryService
    - Thêm Security Agent vào Phase 1
    - Thay thế Synthesizer bằng Phase 3 Synthesis Agents
  - Note: ReviewStagedChanges dùng chung pipeline với ReviewMerge, chỉ khác input (staged diff thay vì branch diff)
  - _Requirements: tất cả — staged review cần cùng chất lượng với branch review_

- [ ] 15. Cập nhật publish-files cho custom prompts
  - Cập nhật `publish-files/review/system-prompt.md`:
    - Thêm Security Analyst Agent description
    - Xóa giới hạn 4 TODO items
    - Thêm confidence score và provenance tag instructions
  - Cập nhật `publish-files/review/agent-rules.md`:
    - Thêm Security Analyst Agent vào suggested agents list
  - Cập nhật `docs/review-flows.md`:
    - Thêm Security Agent vào architecture diagrams
    - Thêm Phase 3 Synthesis Agents description
    - Cập nhật LLM call count table (worst case tăng do thêm agents)
  - _Requirements: documentation consistency_

- [ ] 16. Final checkpoint — Ensure all tests pass
  - Chạy full test suite
  - Manual test: chạy review trên 1 branch thực tế, verify output có đủ sections, confidence scores, provenance tags, và không bị cắt ngắn

## Notes

- Tasks marked `*` là optional property tests — có thể skip cho faster MVP nhưng strongly recommended
- Mỗi task chỉ rõ file cần sửa, vị trí trong file, và code cụ thể cần thêm/sửa
- Checkpoints (task 3, 7, 11, 16) đảm bảo incremental validation
- Phase 3 Multi-Agent Synthesis (task 10) là thay đổi kiến trúc lớn nhất — nên review kỹ trước khi merge
- Task 14 (ReviewStagedChanges) và 15 (publish-files) có thể làm song song
