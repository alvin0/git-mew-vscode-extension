# Requirements Document — Adaptive Review Pipeline

## Giới thiệu

Tái thiết kế pipeline review đa agent trong Git Mew VS Code extension. Kiến trúc hiện tại có các vấn đề: phân bổ budget tĩnh không phụ thuộc đặc tính patch, Phase 3 synthesis agents chủ yếu "AI viết lại AI", nhiều lớp safety margin lãng phí context window, Observer agent suy luận gián tiếp trên summary thay vì evidence trực tiếp, và runtime truncation có thể ghi đè budget allocation của planner.

Kiến trúc mục tiêu: **Planner/Context Gatherer → Shared Session Memory bootstrap → Specialist Agents → Hybrid Assembly**. Migration thực hiện qua 3 phase độc lập, mỗi phase có thể ship riêng.

## Glossary

- **Pipeline**: Chuỗi xử lý review đa agent từ khi nhận diff đến khi xuất markdown report cuối cùng.
- **Context_Gatherer**: Module heuristic-first phân loại patch, quét dependency graph, và sinh ExecutionPlan trước khi chạy agent.
- **ExecutionPlan**: Cấu trúc dữ liệu mô tả agent nào cần chạy, budget ratio, focus area, và section writer nào được bật. Xem Schema Contracts bên dưới.
- **Session_Memory**: Phiên bản nâng cấp của SharedContextStore, lưu trữ structured facts với lifecycle (proposed → verified → rejected → suppressed), evidence refs, và linked finding IDs. Session_Memory chỉ tồn tại trong phiên review, không persist vào workspace state. Tool result references lưu bằng ID, không lưu full content. Không có data nào leak sang ReviewMemoryService trừ khi có explicit save logic.
- **Deterministic_Renderer**: Các hàm fallback hiện có trong SynthesisMerger, được promote thành đường render chính cho các section cố định (§1, §4, §5, §7, §8). Deterministic_Renderer là read-only, không mutate Session_Memory.
- **Summary_Writer**: LLM agent chuyên viết section §2 Summary, chỉ được bật khi ExecutionPlan quyết định cho patch medium/large.
- **Improvement_Writer**: LLM agent chuyên viết section §6 Improvements, chỉ được bật khi findings đủ phức tạp.
- **Section_Writer**: Tên chung cho Summary_Writer và Improvement_Writer. Section_Writer là read-only đối với Session_Memory, không thay đổi finding status.
- **Hybrid_Assembly**: Lớp lắp ráp report cuối cùng kết hợp Deterministic_Renderer và Section_Writer. Hybrid_Assembly là read-only đối với findings (post-suppression state), chỉ đọc findings có status verified hoặc proposed. Hybrid_Assembly sở hữu final filtering, sorting, và provenance tagging. Hybrid_Assembly không thực hiện suppression — đó là trách nhiệm của SuppressionFilter.
- **patchIntent**: Phân loại mục đích patch: feature | refactor | bugfix | mixed. Đây là chiều phân loại chính.
- **riskFlags**: Tập hợp các cờ rủi ro orthogonal: securitySensitive, crossModule, highChurn, apiContractChange. Nhiều flags có thể active đồng thời.
- **ReviewMemoryService**: Service persistent lưu pattern, suppressed findings, review history, resolution tracking qua workspace state. ReviewMemoryService chỉ cung cấp suppression rules cho pipeline, không trực tiếp filter findings.
- **Specialist_Agent**: Agent Phase 1 (Code Reviewer, Flow Diagram, Detail Change, Security Analyst) chạy song song.
- **SynthesisMerger**: Module hiện tại chứa cả synthesis agent orchestration và deterministic fallback functions.
- **ContextBudgetManager**: Module phân bổ token budget cho từng agent dựa trên context window.
- **MultiAgentExecutor**: Engine thực thi phased agent pipeline.
- **Finding**: Một phát hiện cụ thể từ agent (issue, vulnerability, risk) với metadata đi kèm. Xem Schema Contracts bên dưới.
- **Evidence_Ref**: Tham chiếu đến source evidence cụ thể (file, line, tool result) hỗ trợ một Finding. Xem Schema Contracts bên dưới.
- **Hypothesis**: Giả thuyết rủi ro được đề xuất bởi agent, cần evidence để xác minh. Có lifecycle riêng (proposed → verified → rejected). Xem Schema Contracts bên dưới.
- **SuppressionFilter**: Bước chuyên biệt trong assembly pipeline, chạy trước Hybrid_Assembly. SuppressionFilter sử dụng suppression rules từ ReviewMemoryService để transition findings verified → suppressed. SuppressionFilter là actor DUY NHẤT được phép thực hiện transition verified → suppressed.

## Schema Contracts

### ExecutionPlan Schema

```typescript
interface ExecutionPlan {
  patchIntent: 'feature' | 'refactor' | 'bugfix' | 'mixed';
  riskFlags: {
    securitySensitive: boolean;
    crossModule: boolean;
    highChurn: boolean;
    apiContractChange: boolean;
  };
  enabledAgents: string[];                    // agent roles to run
  disabledAgents: Array<{                     // agent roles skipped + reason
    role: string;
    reason: string;
  }>;
  agentBudgets: Record<string, number>;       // role → ratio of allocatable-agent-pool (CW - safety - system - reference). Sum ≤ 1.0. Chỉ áp cho specialist agents. Section writers có pool riêng từ freed Phase 3 budget (xem Req 5 AC3).
  sectionWriterBudgets?: {                    // optional, chỉ khi section writers enabled
    summary?: number;                         // token budget cho Summary_Writer
    improvements?: number;                    // token budget cho Improvement_Writer
  };
  sectionWriters: {
    summary: boolean;                         // §2 Summary Writer
    improvements: boolean;                    // §6 Improvement Writer
  };
  focusAreas: string[];                       // file paths or module names
  priorityFiles: string[];                    // hotspot files from dependency analysis
  fallbackPolicy: 'static-budget' | 'skip-agent' | 'abort';
}
```

### Finding Schema

```typescript
interface Finding {
  id: string;                                 // unique finding ID
  agentRole: string;                          // which agent created this
  category: 'correctness' | 'security' | 'performance' | 'maintainability' | 'testing' | 'integration';
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  confidence: number;                         // 0..1
  status: 'proposed' | 'verified' | 'rejected' | 'suppressed';
  file: string;                               // affected file path
  lineRange: { start: number; end: number };  // affected line range
  description: string;
  suggestion: string;
  evidenceRefs: Evidence_Ref[];
  linkedFindingIds: string[];                 // related findings across agents
}
```

### Evidence_Ref Schema

```typescript
interface Evidence_Ref {
  file: string;                               // source file path
  lineRange: {
    start: number;                            // inclusive start line
    end: number;                              // exclusive end line
  };
  toolResultId: string | null;                // ID of cached tool result, null if manual
  diffLineRef: boolean;                       // true = line from diff, false = line from source
}
```

### Hypothesis Schema

```typescript
interface Hypothesis {
  id: string;
  sourceAgentRole: string;
  category: 'security' | 'integration' | 'correctness' | 'performance';
  description: string;
  affectedFiles: string[];
  confidence: number;                         // 0..1
  status: 'proposed' | 'verified' | 'rejected';
  evidenceRefs: Evidence_Ref[];
  linkedFindingIds: string[];                 // findings that support/contradict this hypothesis
}
```

### Patch Size Classification

Ngưỡng mặc định để phân loại patch size. Context_Gatherer có thể điều chỉnh dựa trên patch complexity.

| Size | Changed Files | Diff Tokens |
|---|---|---|
| small | < 10 files | < 3,000 tokens |
| medium | 10–30 files | 3,000–15,000 tokens |
| large | > 30 files | > 15,000 tokens |

Phân loại dùng OR logic cho medium/large: patch được coi là medium nếu thỏa điều kiện changed files HOẶC diff tokens của medium. Tương tự cho large. OR logic được chọn có chủ đích để ưu tiên safety — đảm bảo section writers và budget allocation không bị under-provisioned khi một chiều tăng đáng kể.

### Finding Status Lifecycle — Ownership Rules

Mỗi actor trong pipeline chỉ được phép thực hiện các transition cụ thể:

| Actor | Allowed Transitions | Notes |
|---|---|---|
| Specialist_Agent | → proposed (create only) | Chỉ tạo mới finding/hypothesis với status=proposed |
| Self-Audit | proposed → verified, proposed → rejected | Xác nhận hoặc bác bỏ finding/hypothesis |
| Observer/Verifier | proposed → verified, proposed → rejected | Phase 2 verification cho finding và hypothesis |
| SuppressionFilter | verified → suppressed | Actor DUY NHẤT được phép suppress. Sử dụng rules từ ReviewMemoryService (SHA-256 + glob matching) |
| Section_Writer | (read-only) | Không được thay đổi finding/hypothesis status |
| Deterministic_Renderer | (read-only) | Không được thay đổi finding/hypothesis status |
| Hybrid_Assembly | (read-only for findings) | Chỉ đọc post-suppression state (verified + proposed), sở hữu filtering/sorting/tagging |

> **Lưu ý:** ReviewMemoryService chỉ cung cấp suppression rules/history cho SuppressionFilter, không trực tiếp filter findings.


## Requirements

### Requirement 1: Loại bỏ Phase 3 Synthesis Agents

**User Story:** Là developer, tôi muốn pipeline review không còn dùng LLM agents để viết lại findings từ Phase 1/2, để giảm latency, giảm chi phí token, và tránh mất thông tin khi AI repackage AI output.

#### Acceptance Criteria

1. WHEN pipeline review hoàn thành Phase 1 và Phase 2, THE Hybrid_Assembly SHALL render report cuối cùng mà không gọi bất kỳ Phase 3 synthesis agent nào (Summary & Detail, Improvement Suggestions, Risk & TODO, Diagram & Assessment).
2. THE Deterministic_Renderer SHALL render các section §1 Changed Files, §4 Flow Diagram, §5 Code Quality, §7 TODO, §8 Risks trực tiếp từ structured data trong Session_Memory mà không qua LLM call.
3. WHEN structured data cho một section không có sẵn trong Session_Memory, THE Deterministic_Renderer SHALL hiển thị empty-state message phù hợp với ngôn ngữ review đã chọn.
4. THE Pipeline SHALL giữ nguyên format output markdown hiện tại (8 sections + metadata footer) sau khi loại bỏ Phase 3 agents.
5. WHEN Detail Change agent trả về raw markdown report, THE Hybrid_Assembly SHALL sử dụng output đó trực tiếp cho section §3 Detail Change với chỉ light cleanup (trim whitespace, normalize headings). Summary_Writer chỉ sở hữu §2 Summary, không sở hữu §3.
6. WHEN Detail Change agent output bị thiếu hoặc chất lượng thấp (empty hoặc dưới 50 ký tự), THE Hybrid_Assembly SHALL fallback về Deterministic_Renderer cho §3 với thông báo "Detail change not available".
7. THE Pipeline SHALL giảm tổng số LLM calls ít nhất 4 calls so với pipeline hiện tại (loại bỏ 4 synthesis agents).

### Requirement 2: Section Writer có điều kiện

**User Story:** Là developer, tôi muốn chỉ gọi LLM để viết Summary và Improvement sections khi patch đủ phức tạp, để tiết kiệm token cho các patch đơn giản.

#### Acceptance Criteria

1. WHEN ExecutionPlan đánh dấu patch là medium hoặc large (theo Patch Size Classification trong Schema Contracts), THE Hybrid_Assembly SHALL bật Summary_Writer cho §2 Summary.
2. WHEN ExecutionPlan đánh dấu patch là small, THE Deterministic_Renderer SHALL render §2 Summary từ structured data mà không gọi Summary_Writer. §3 Detail Change luôn dùng Detail Change agent raw output (xem Requirement 1 AC5-AC6).
3. WHEN Session_Memory chứa từ 3 findings trở lên HOẶC có ít nhất 1 finding với severity major hoặc critical, THE Hybrid_Assembly SHALL bật Improvement_Writer cho §6 Improvements.
4. WHEN Session_Memory chứa ít hơn 3 findings VÀ không có finding nào severity major hoặc critical, THE Deterministic_Renderer SHALL render Improvements (§6) từ structured data.
5. THE Section_Writer SHALL đọc filtered structured state từ Session_Memory, không đọc serialized markdown prose từ agent khác.
6. WHEN Section_Writer được bật, THE Section_Writer SHALL nhận token budget từ ExecutionPlan thay vì từ static ratio trong ContextBudgetManager.
7. THE Section_Writer SHALL thực hiện tối đa 2 LLM calls cho mỗi review (1 cho Summary_Writer nếu bật, 1 cho Improvement_Writer nếu bật).

### Requirement 3: Context Gatherer heuristic-first

**User Story:** Là developer, tôi muốn pipeline tự động phân loại patch và điều chỉnh budget/agent selection dựa trên đặc tính patch, để review chất lượng hơn mà không tăng latency.

#### Acceptance Criteria

1. WHEN pipeline nhận diff và UnifiedDiffFile[], THE Context_Gatherer SHALL phân loại patchIntent (feature, refactor, bugfix, mixed) và xác định riskFlags (securitySensitive, crossModule, highChurn, apiContractChange) bằng heuristic analysis mà không gọi LLM.
2. THE Context_Gatherer SHALL quét dependency graph và xác định hotspot files (files có nhiều importedBy references nhất) với target dưới 500ms under normal local conditions, excluding cold-start initialization, cho patch dưới 50 files.
3. WHEN Context_Gatherer hoàn thành phân tích, THE Context_Gatherer SHALL sinh một ExecutionPlan theo schema đã định nghĩa, bao gồm: patchIntent, riskFlags, enabledAgents, disabledAgents (với reasons), agentBudgets, sectionWriters, focusAreas, priorityFiles, và fallbackPolicy.
4. WHEN riskFlags.securitySensitive là true, THE ExecutionPlan SHALL phân bổ agentBudgets cho Security Analyst cao hơn ít nhất 20% so với default ratio.
5. WHEN patchIntent là refactor, THE ExecutionPlan SHALL phân bổ agentBudgets cho Flow Diagram cao hơn ít nhất 15% so với default ratio.
6. THE Context_Gatherer SHALL seed Session_Memory với patchIntent, riskFlags, hotspot files, và dependency summary trước khi Specialist_Agents bắt đầu chạy.
7. IF Context_Gatherer gặp lỗi trong quá trình phân tích, THEN THE Pipeline SHALL fallback về static budget allocation hiện tại (fallbackPolicy = 'static-budget') và tiếp tục review bình thường.

### Requirement 4: Nâng cấp SharedContextStore thành Session Memory

**User Story:** Là developer, tôi muốn store trong phiên review lưu trữ structured facts với lifecycle rõ ràng, để agents có thể phân biệt hypothesis vs evidence vs verified finding và tránh suy luận trên dữ liệu chưa xác minh.

#### Acceptance Criteria

1. THE Session_Memory SHALL lưu trữ mỗi Finding theo Finding Schema đã định nghĩa, bao gồm status lifecycle: proposed, verified, rejected, hoặc suppressed.
2. WHEN một Specialist_Agent thêm finding mới vào Session_Memory, THE Session_Memory SHALL gán status mặc định là proposed. Chỉ Specialist_Agent được phép tạo finding mới.
3. WHEN self-audit xác nhận một finding, THE Session_Memory SHALL chuyển status của finding đó sang verified. Chỉ Self-Audit và Observer/Verifier được phép thực hiện transition proposed → verified.
4. WHEN self-audit bác bỏ một finding, THE Session_Memory SHALL chuyển status của finding đó sang rejected. Chỉ Self-Audit và Observer/Verifier được phép thực hiện transition proposed → rejected.
5. THE Session_Memory SHALL lưu trữ Evidence_Ref theo schema đã định nghĩa cho mỗi Finding, bao gồm file path, line range (inclusive start, exclusive end), tool result ID, và diffLineRef flag.
6. THE Session_Memory SHALL tách biệt session data (findings, hypotheses, tool cache) khỏi persistent ReviewMemoryService data (patterns, suppressed findings, review history). Session_Memory chỉ tồn tại trong phiên review, không persist vào workspace state. Tool result references lưu bằng ID, không lưu full content.
7. WHEN Deterministic_Renderer hoặc Section_Writer đọc findings từ Session_Memory, THE Session_Memory SHALL chỉ trả về findings có status verified hoặc proposed, không trả về findings có status rejected.
8. THE Session_Memory SHALL hỗ trợ linked finding IDs để liên kết findings liên quan giữa các agents (ví dụ: Code Reviewer issue liên kết với Security Analyst vulnerability cùng file/location).
9. THE Session_Memory SHALL enforce ownership rules theo bảng Finding Status Lifecycle: chỉ actor được phép mới có thể thực hiện transition tương ứng, và reject transition không hợp lệ với error.
10. THE Session_Memory SHALL không cho phép data leak sang ReviewMemoryService trừ khi có explicit save logic được trigger bởi user action hoặc review completion.
11. THE Session_Memory SHALL lưu trữ Hypothesis theo Hypothesis Schema đã định nghĩa và enforce cùng ownership lifecycle rules (Specialist tạo proposed, Self-Audit/Observer verify/reject). Hypothesis và Finding là hai entity tách biệt trong Session_Memory.

### Requirement 5: Adaptive Budget Allocation

**User Story:** Là developer, tôi muốn budget allocation thay đổi dựa trên ExecutionPlan thay vì static ratios, để context window được sử dụng hiệu quả hơn cho từng loại patch.

#### Acceptance Criteria

1. WHEN ExecutionPlan có sẵn, THE ContextBudgetManager SHALL sử dụng agentBudgets từ ExecutionPlan thay vì static ratios trong DEFAULT_BUDGET_CONFIG.
2. THE ContextBudgetManager SHALL loại bỏ budget allocation cho Phase 3 synthesis agents (Summary & Detail 15%, Improvement Suggestions 40%, Risk & TODO 30%, Diagram & Assessment 15%).
3. WHEN Section_Writer được bật bởi ExecutionPlan, THE ContextBudgetManager SHALL phân bổ budget riêng cho Section_Writer từ phần budget đã giải phóng từ Phase 3.
4. THE ContextBudgetManager SHALL hợp nhất planner-level và agent-level budget thành single source of truth. Runtime truncation vẫn giữ lại như last-resort safeguard, nhưng không được ghi đè planner budget allocation.
5. WHEN runtime truncation xảy ra, THE Pipeline SHALL emit telemetry signal về ContextBudgetManager, bao gồm: agent role bị truncate, số tokens bị cắt, và context window thực tế.
6. (Phase 2+, optional) WHERE adaptive reallocation được bật, THE ContextBudgetManager MAY sử dụng truncation signals để điều chỉnh budget cho các agent tiếp theo trong cùng phiên review. Đây là enhancement cho phase 2 trở đi, không phải hard requirement cho phase 1.
7. THE ContextBudgetManager SHALL đảm bảo tổng budget allocation không vượt quá 90% context window (single safety threshold).

### Requirement 6: Migration incremental qua 3 phases

**User Story:** Là developer, tôi muốn migration được thực hiện qua 3 phase độc lập, để mỗi phase có thể ship và test riêng mà không ảnh hưởng đến các phase khác.

#### Acceptance Criteria

1. THE Pipeline SHALL hỗ trợ chạy ở cả chế độ legacy (Phase 3 synthesis agents) và chế độ mới (Hybrid Assembly) thông qua một feature flag hoặc configuration option.
2. WHEN Phase 1 migration hoàn thành, THE Pipeline SHALL có thể ship với Deterministic_Renderer là primary rendering path mà không cần Phase 2 hoặc Phase 3 migration.
3. WHEN Phase 2 migration hoàn thành, THE Pipeline SHALL có thể ship với Context_Gatherer và adaptive budgeting mà không cần Phase 3 migration.
4. WHEN Phase 3 migration hoàn thành, THE Pipeline SHALL có thể coexist với legacy path thông qua adapter layer, cho phép chuyển đổi giữa legacy và new path mà không cần tất cả phases hoàn thành trước đó.
5. THE Pipeline SHALL duy trì backward compatibility với ReviewMemoryService data format hiện tại qua tất cả 3 phases.
6. IF feature flag cho chế độ mới bị tắt, THEN THE Pipeline SHALL chạy pipeline legacy hiện tại mà không có thay đổi hành vi nào.

### Requirement 7: Hybrid Assembly Layer

**User Story:** Là developer, tôi muốn lớp assembly cuối cùng kết hợp deterministic rendering và conditional LLM writing, để report output ổn định và không mất findings khi LLM fail.

#### Acceptance Criteria

1. THE Hybrid_Assembly SHALL render report theo thứ tự: §1 Changed Files (deterministic), §2 Summary (conditional — Summary_Writer), §3 Detail Change (Detail Change agent raw output hoặc deterministic fallback), §4 Flow Diagram (deterministic), §5 Code Quality (deterministic), §6 Improvements (conditional — Improvement_Writer), §7 TODO (deterministic), §8 Risks (deterministic).
2. WHEN Section_Writer cho một section fail hoặc timeout, THE Hybrid_Assembly SHALL fallback về Deterministic_Renderer cho section đó mà không làm fail toàn bộ report. Failure bao gồm: timeout, LLM API error, schema parse failure, hoặc output quality dưới ngưỡng.
3. THE Hybrid_Assembly SHALL sở hữu final provenance tagging: gắn tags ([CR], [SA], [OB], [XV]) cho mỗi finding trong report. Session_Memory lưu raw structured findings + statuses. ReviewMemoryService chỉ cung cấp suppression rules. Renderer và Writer không tự filter.
4. THE Hybrid_Assembly SHALL gắn metadata footer (HTML comment) với thống kê findings, severity breakdown, cross-validated count, suppressed count, và review duration.
5. THE SuppressionFilter SHALL chạy trước Hybrid_Assembly, filter suppressed findings bằng suppression rules từ ReviewMemoryService, giữ nguyên logic SHA-256 + glob matching hiện tại. SuppressionFilter là actor DUY NHẤT được phép transition finding status verified → suppressed trong Session_Memory. Hybrid_Assembly chỉ đọc post-suppression state. Lưu ý: ReviewMemoryService chỉ cung cấp suppression rules/history cho SuppressionFilter, không trực tiếp filter findings. SuppressionFilter là bước riêng biệt, không phải một phần của Hybrid_Assembly.
6. WHEN Hybrid_Assembly nhận findings từ Session_Memory, THE Hybrid_Assembly SHALL sắp xếp findings theo severity (critical > major > minor > suggestion) trong mỗi section. Sorting logic thuộc sở hữu của Hybrid_Assembly, không phải Session_Memory.


### Requirement 8: Tương thích với tất cả Review Entry Points

**User Story:** Là developer, tôi muốn kiến trúc mới hoạt động với tất cả review entry points hiện có, để không có flow nào bị broken sau migration.

#### Acceptance Criteria

1. WHEN user trigger Review Merge, THE Pipeline SHALL sử dụng kiến trúc mới (hoặc legacy tùy feature flag) và trả về ReviewResult với cùng interface hiện tại.
2. WHEN user trigger Review Staged Changes, THE Pipeline SHALL sử dụng kiến trúc mới (hoặc legacy tùy feature flag) và trả về ReviewResult với cùng interface hiện tại.
3. WHEN user trigger Review Merged Branch, THE Pipeline SHALL sử dụng kiến trúc mới (hoặc legacy tùy feature flag) và trả về kết quả tương thích.
4. WHEN user trigger Review Selected Commits, THE Pipeline SHALL sử dụng kiến trúc mới (hoặc legacy tùy feature flag) và trả về kết quả tương thích.
5. THE Pipeline SHALL không thay đổi MR Description generation flow (Change Analyzer + Context Investigator), vì flow này độc lập với review pipeline.
6. THE Pipeline SHALL giữ nguyên PlantUML repair flow hiện tại, không bị ảnh hưởng bởi migration.

### Requirement 9: Observability & Telemetry

**User Story:** Là developer, tôi muốn pipeline ghi log đầy đủ các quyết định và metrics quan trọng, để có thể debug, tune, và so sánh hiệu quả giữa legacy và new pipeline.

#### Acceptance Criteria

1. WHEN Context_Gatherer hoàn thành phân loại, THE Pipeline SHALL log patchIntent và riskFlags đã xác định.
2. WHEN Context_Gatherer sinh ExecutionPlan, THE Pipeline SHALL log summarized ExecutionPlan (patchIntent, riskFlags, enabled/disabled agents, section writers enabled) ở mức normal telemetry. WHEN debug mode được bật, THE Pipeline SHALL log full ExecutionPlan bao gồm agentBudgets và focusAreas.
3. WHEN mỗi Specialist_Agent hoàn thành, THE Pipeline SHALL log actual tokens used so với tokens allocated trong ExecutionPlan.
4. WHEN runtime truncation xảy ra, THE Pipeline SHALL log agent role bị truncate, số tokens bị cắt, và context window thực tế.
5. WHEN Section_Writer fallback về Deterministic_Renderer, THE Pipeline SHALL log section bị fallback và lý do (timeout, error, hoặc quality threshold).
6. THE Pipeline SHALL log tổng review latency chia theo phase: Context_Gatherer, Phase 1 agents, Phase 2 Observer, Assembly.
7. WHEN review hoàn thành, THE Pipeline SHALL log output completeness: số sections rendered, số sections dùng Section_Writer vs Deterministic_Renderer, tổng findings count.
8. THE Pipeline SHALL log tổng input tokens consumed cho toàn bộ review session.

#### Non-Functional Acceptance Criteria

9. THE Pipeline SHALL hoàn thành end-to-end review với latency không tăng quá 15% so với legacy pipeline cho small và medium patches (dưới 30 files thay đổi).
10. THE Deterministic_Renderer SHALL render tất cả deterministic sections trong thời gian dưới 50ms.
11. THE Pipeline SHALL giảm tổng input tokens trung bình ít nhất 20% so với legacy pipeline (nhờ loại bỏ Phase 3 và adaptive budgeting). Benchmark đo trên cùng test fixture/môi trường như legacy baseline.

## Appendix: Module Ownership Summary

| Module | Ownership |
|---|---|
| Context_Gatherer | Patch classification + ExecutionPlan generation |
| Session_Memory | Lifecycle/state validation + structured data storage |
| SuppressionFilter | Suppress transition (verified → suppressed) |
| Hybrid_Assembly | Final ordering, filtering, provenance tagging, render orchestration |
| Deterministic_Renderer | Section render cho deterministic sections (§1, §4, §5, §7, §8) |
| Section_Writer | Optional enrichment cho §2 Summary và §6 Improvements |
| ContextBudgetManager | Budget calculation dựa trên ExecutionPlan, không rendering |
| ReviewMemoryService | Persistent history/rules/patterns only, không filter trực tiếp |
| MultiAgentExecutor | Phased agent execution engine |
| AdapterCalibrationService | Runtime truncation safeguard + telemetry emission |

### Requirement 10: Regression Contracts

**User Story:** Là developer, tôi muốn đảm bảo migration không phá vỡ các contract hiện có, để user experience không bị ảnh hưởng.

#### Acceptance Criteria

1. THE Pipeline SHALL giữ nguyên ReviewResultPayload interface (review, description, rawDiff fields) qua tất cả migration phases.
2. THE ReviewMemoryService SHALL giữ nguyên data format cho PatternEntry, SuppressedFinding, ReviewSummary, và ResolutionRecord qua tất cả migration phases. Auto-save behavior không thay đổi.
3. WHEN review đang chạy, THE Pipeline SHALL gửi progress messages tới webview panel với cùng message contract hiện tại (progress, error, result message types).
4. WHEN user cancel review, THE Pipeline SHALL thực hiện silent-return giống hành vi hiện tại, không throw error hoặc hiển thị error message.
5. THE Pipeline SHALL giữ nguyên ReviewErrorPayload interface cho error reporting qua tất cả migration phases.

### Requirement 11: Testability

**User Story:** Là developer, tôi muốn kiến trúc mới có test coverage đầy đủ cho các component quan trọng, để đảm bảo chất lượng và phát hiện regression sớm.

#### Acceptance Criteria

1. THE Context_Gatherer SHALL có unit tests cho heuristic classification logic, bao gồm: phân loại patchIntent chính xác cho ít nhất 4 loại patch (feature, refactor, bugfix, mixed) và xác định riskFlags chính xác.
2. THE Deterministic_Renderer SHALL có golden tests so sánh output markdown với expected output cho mỗi section (§1, §4, §5, §7, §8), đảm bảo deterministic rendering không thay đổi output khi input giống nhau.
3. THE Session_Memory SHALL có contract tests kiểm tra finding status transitions: chỉ transition hợp lệ được chấp nhận (theo bảng ownership), transition không hợp lệ bị reject với error.
4. THE Pipeline SHALL có integration tests cho cả 4 entry points (Review Merge, Review Staged Changes, Review Merged Branch, Review Selected Commits) chạy dưới cả legacy flag và new flag.
5. THE Section_Writer SHALL có failure-path tests kiểm tra fallback behavior: khi Section_Writer fail hoặc timeout, Hybrid_Assembly fallback về Deterministic_Renderer và report vẫn hoàn chỉnh.
6. THE Hybrid_Assembly SHALL có tests kiểm tra provenance tagging, severity sorting, và suppression filtering hoạt động đúng với các tổ hợp findings khác nhau.
7. THE Pipeline SHALL có tests kiểm tra rằng toggling feature flag giữa legacy mode và new mode với cùng input không phá vỡ ReviewResult contract, history auto-save behavior, hoặc error handling behavior.
