# Deep Dive: Multi-Agent Review Architecture

## Tổng quan

Cả **Review Merge (Branch)** và **Review Staged Changes** hiện dùng cùng một
pipeline review nhiều phase:

1. Pre-analysis
2. Phase 1 agents chạy song song
3. Structured self-audit
4. Risk hypothesis generation
5. Phase 2 Observer
6. Phase 3 synthesis agents chạy song song
7. Deterministic merge
8. Save review memory

Điểm khác biệt chính:
- **Review Merge** nhận đầu vào từ branch diff.
- **Review Staged Changes** nhận đầu vào từ staged diff.
- **Review Merge** còn có flow riêng cho MR description, tách biệt với code review.

---

## 1. Entry Point → Service

### Review Merge
- `src/commands/reviewMergeCommand.ts`
- Tạo `ReviewMergeService`
- Inject `ReviewMemoryService`
- Webview gửi request generate review / description

### Review Staged Changes
- `src/commands/reviewStagedChangesCommand.ts`
- Tạo `ReviewStagedChangesService`
- Inject `ReviewMemoryService`
- Webview gửi request generate review

---

## 2. Service Preparation

Hai service:
- `src/commands/reviewMerge/reviewMergeService.ts`
- `src/commands/reviewStagedChanges/reviewStagedChangesService.ts`

đều thực hiện các bước chung trước khi chạy agent:

1. `prepareAdapter()`
2. Lấy diff và `UnifiedDiffFile[]`
3. Đọc custom prompts/rules từ repo
4. Build system prompt
5. Build reference context
6. Build dependency graph qua `DependencyGraphIndex`
7. Load review memory context:
   - relevant patterns
   - suppressed findings
   - relevant history
   - resolution stats
8. Tính budget qua `ContextBudgetManager`
9. Build agent prompts

---

## 3. Phase 1 Agents

Phase 1 hiện có **4 agent chạy song song**:

### 1. Code Reviewer
- File: `src/services/llm/orchestrator/AgentPromptBuilder.ts`
- Output schema: `code-reviewer`
- Mục tiêu:
  - correctness
  - security
  - performance
  - maintainability
  - testing
- Có confidence score trên từng issue

### 2. Flow Diagram
- Output schema: `flow-diagram`
- Mục tiêu:
  - tái tạo flow bị ảnh hưởng
  - sinh PlantUML diagrams

### 3. Detail Change
- Không phải agent tìm lỗi
- Mục tiêu:
  - giải thích logic thay đổi theo dạng long-form
- Không chạy self-audit

### 4. Security Analyst
- Output schema: `security-analyst`
- Mục tiêu:
  - phân tích OWASP/CWE
  - trace taint flow
  - auth flow concerns
  - input validation gaps
  - data exposure risks

### Tooling đáng chú ý
- `Code Reviewer`: `find_references`, `get_diagnostics`, `read_file`, `get_symbol_definition`, `search_code`, `get_related_files`, `queryContext`
- `Flow Diagram`: `find_references`, `get_related_files`, `read_file`, `get_symbol_definition`, `queryContext`
- `Detail Change`: `read_file`, `search_code`, `get_related_files`, `get_symbol_definition`, `queryContext`
- `Security Analyst`: `search_code`, `find_references`, `read_file`, `get_symbol_definition`, `get_diagnostics`, `queryContext`

---

## 4. Structured Self-Audit

`MultiAgentExecutor` hiện dùng structured self-audit thay cho reflection cũ.

### Cách hoạt động
- Có diff context riêng cho self-audit
- Nếu diff summary quá lớn, executor rút về changed-files summary
- Audit yêu cầu JSON có:
  - `verdict`
  - `issues`
  - `additions`
  - `removals`
  - `verificationResults`

### Chain-of-Verification
Áp dụng cho:
- `Code Reviewer`
- `Security Analyst`

Mỗi finding critical/major có thể bị loại nếu failed verification.

### Observer Audit
- Nhận checklist từ findings của Code Reviewer, Flow Diagram, và Security Analyst
- Tập trung vào hidden risk / integration concern completeness

---

## 5. SharedContextStore

`src/services/llm/orchestrator/SharedContextStore.ts`

Store này là blackboard trong một phiên review. Nó giữ:
- cached tool results
- structured findings của agent
- dependency graph
- risk hypotheses

Findings hiện có thể được serialize cho:
- issue
- flow
- risk
- security

Security findings được serialize riêng dưới format:
- severity
- file/location
- CWE
- description
- confidence

---

## 6. Risk Hypothesis Generation

`src/services/llm/orchestrator/RiskHypothesisGenerator.ts`

Sau Phase 1, generator tạo hypotheses từ:
- Code Reviewer findings
- Flow Diagram findings
- Security Analyst findings
- dependency graph

Nhóm hypothesis hiện gồm:
- integration
- correctness
- security
- performance

Security-specific hypotheses có thể đến từ:
- taint source → sink suspicion
- auth flow concerns
- cascading impact tới nhiều consumers

---

## 7. Phase 2 Observer

Observer được build lại sau Phase 1 với:
- diff summary
- shared findings
- risk hypotheses
- dependency graph summary
- review memory context

Observer hiện có thêm tools:
- `find_references`
- `get_symbol_definition`

và được hướng dẫn:
- verify integration concerns bằng tool calls trước khi report
- tạo TODO list không giới hạn số lượng
- thêm `confidence`, `likelihood`, `impact`, `mitigation` cho risk

---

## 8. Phase 3 Synthesis Agents

Thay vì 1 synthesizer LLM call duy nhất, pipeline hiện có **4 synthesis agents chạy song song**:

### 1. Summary & Detail
- Viết:
  - `## 2. Summary of Changes`
  - `## 3. Detail Change`

### 2. Improvement Suggestions
- Viết:
  - `## 6. Improvement Suggestions`
- Nguồn dữ liệu:
  - Code Reviewer findings
  - Security findings với confidence >= 0.5

### 3. Risk & TODO
- Viết:
  - `## 7. Observer TODO List`
  - `## 8. Potential Hidden Risks`

### 4. Diagram & Assessment
- Viết:
  - `## 4. Flow Diagram`
  - `## 5. Code Quality Assessment`

### Execution API
`ContextOrchestratorService` expose 2 method để service layer gọi trực tiếp:
- `executePhasedAgentReports()`
- `executeSynthesisAgentReports()`

Hai method này là bridge xuống `MultiAgentExecutor`.

---

## 9. Deterministic Merge

`src/services/llm/orchestrator/SynthesisMerger.ts`

Sau khi 4 synthesis agents hoàn thành, merge không dùng LLM nữa.

Merger sẽ:
1. Build section `Changed File Paths`
2. Lấy section text từ synthesis agents
3. Fallback về raw structured data nếu agent fail
4. Add provenance tags:
   - `[CR]`
   - `[SA]`
   - `[OB]`
   - `[XV]`
5. Gắn metadata footer dạng HTML comment

Mục tiêu là:
- không làm rơi findings khi synthesis agent lỗi
- ổn định format output

---

## 10. Review Memory Service

`src/services/llm/ReviewMemoryService.ts`

Persist qua `ExtensionContext.workspaceState`.

### Dữ liệu chính
- pattern memory
- false-positive suppression
- review history
- resolution tracking

### Tác động tới prompt
Prompt builders có thể inject:
- patterns từ review trước
- history liên quan tới file đang đổi
- resolution stats

### Command
- `gitmew.clearReviewMemory`

---

## 11. Files Quan Trọng

### Orchestration
- `src/services/llm/ContextOrchestratorService.ts`
- `src/services/llm/orchestrator/MultiAgentExecutor.ts`
- `src/services/llm/orchestrator/AgentPromptBuilder.ts`
- `src/services/llm/orchestrator/SharedContextStore.ts`
- `src/services/llm/orchestrator/RiskHypothesisGenerator.ts`
- `src/services/llm/orchestrator/SynthesisMerger.ts`
- `src/services/llm/orchestrator/ContextBudgetManager.ts`
- `src/services/llm/orchestrator/orchestratorTypes.ts`

### Review Services
- `src/commands/reviewMerge/reviewMergeService.ts`
- `src/commands/reviewStagedChanges/reviewStagedChangesService.ts`

### Memory
- `src/services/llm/ReviewMemoryService.ts`
- `src/services/llm/reviewMemoryTypes.ts`

### Prompt Contracts
- `src/prompts/reviewOutputContract.ts`
- `publish-files/review/system-prompt.md`
- `publish-files/review/agent-rules.md`

---

## 12. Current Reality Check

Đây là kiến trúc hiện tại của Review Merge và Review Staged Changes.

Nó đã thay thế mô tả cũ vốn chỉ phản ánh:
- 3 agents
- 1 synthesizer
- observer todo list giới hạn 4 items

Nếu sau này merged-branch review được nâng cấp theo cùng pipeline, tài liệu này nên được mở rộng thêm cho flow đó.
