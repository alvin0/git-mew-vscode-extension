# Requirements Document

## Giới thiệu

Thiết kế lại pipeline multi-agent review để giải quyết 3 vấn đề cốt lõi: (1) lãng phí token do cả 3 agent nhận cùng một prompt đầy đủ, (2) mất context quan trọng khi review codebase lớn do hard-cap reference context và truncation, (3) Observer Agent không nhận được structured input từ các agent khác nên phải tự khám phá lại mọi thứ. Giải pháp tập trung vào: Blackboard-based Shared Context Store cho phép agents chia sẻ và làm giàu context trong quá trình chạy; Pre-Analysis Phase dùng VS Code LSP index để build dependency graph trước khi agents chạy (zero LLM cost); Role-specific prompt với adaptive context retrieval (pull model); Risk Hypothesis generation (Socratic Questioning) để Observer investigate có mục tiêu; và dynamic token budget dựa trên model capabilities thực tế (minimum 80k tokens reference context).

## Thuật ngữ

- **Pipeline**: Toàn bộ quy trình multi-agent review từ khi nhận diff đến khi tạo final report
- **Shared_Context_Store**: Bộ nhớ dùng chung trong một phiên review, lưu trữ kết quả tool call và phát hiện của các agent để tránh trùng lặp
- **Context_Budget_Manager**: Module tính toán và phân bổ token budget cho từng agent dựa trên context window thực tế của model
- **Agent_Prompt_Builder**: Module xây dựng prompt riêng biệt cho từng agent role, chỉ chứa thông tin liên quan
- **Reference_Context_Provider**: Module hiện tại (referenceContextProvider.ts) thu thập symbol definitions và related files từ VS Code LSP
- **MultiAgentExecutor**: Module hiện tại (MultiAgentExecutor.ts) điều phối thực thi song song các agent
- **Synthesizer**: Agent cuối cùng merge reports từ các agent chuyên biệt thành final review
- **Tool_Result_Cache**: Thành phần trong Shared_Context_Store lưu kết quả tool call (read_file, find_references, v.v.) để agent khác tái sử dụng
- **Context_Window**: Số token tối đa model có thể xử lý trong một request (hiện tại 200k cho tất cả model)
- **Token_Budget**: Số token được phân bổ cho một thành phần cụ thể (agent prompt, reference context, v.v.)
- **Self_Audit**: Bước reflection sau khi agent hoàn thành, tự kiểm tra lại output
- **Diff_Chunk**: Một phần của diff được tách ra để xử lý trong hierarchical strategy
- **Dependency_Graph_Index**: Cấu trúc dữ liệu in-memory được build trước khi agents chạy, chứa dependency graph (file → imports, symbol → definitions, symbol → references) của tất cả changed files và neighbors trực tiếp. Được xây dựng bằng VS Code LSP APIs (DocumentSymbolProvider, ReferenceProvider, DocumentLinkProvider) mà không tốn LLM token.
- **Pre-Analysis_Phase**: Giai đoạn chạy trước multi-agent execution, sử dụng VS Code APIs (không LLM) để build Dependency_Graph_Index và xác định critical paths cần review sâu
- **Risk_Hypothesis**: Một câu hỏi/giả thuyết cụ thể về potential risk được sinh ra từ dependency graph + diff + Phase 1 findings, dùng để hướng dẫn Observer investigate có mục tiêu thay vì tìm kiếm mù. Lấy cảm hứng từ Socratic Questioning trong Baz Agentic Reviewer.
- **Blackboard_Pattern**: Mô hình kiến trúc trong đó Shared_Context_Store hoạt động như bộ nhớ chia sẻ mutable — agents không chỉ đọc mà còn ghi thêm discoveries trong quá trình chạy, làm giàu context cho agents sau.
- **Query_Context_Tool**: Tool nội bộ cho phép agent pull thêm context từ Shared_Context_Store theo nhu cầu runtime, thay vì chỉ nhận context tĩnh lúc khởi tạo prompt (push model → pull model).

## Yêu cầu

### Yêu cầu 1: Shared Context Store giữa các Agent

**User Story:** Là một developer, tôi muốn các agent chia sẻ kết quả tool call và phát hiện với nhau, để tránh lãng phí token cho các tool call trùng lặp và giúp agent sau có thêm context từ agent trước.

#### Tiêu chí chấp nhận

1. THE Pipeline SHALL duy trì một Shared_Context_Store instance duy nhất cho mỗi phiên review, tồn tại từ khi bắt đầu executeAgents() đến khi hoàn thành synthesis.
2. WHEN một agent thực thi tool call (read_file, find_references, get_symbol_definition, search_code, get_related_files, get_diagnostics), THE Tool_Result_Cache SHALL lưu kết quả với key là tên tool + tham số đầu vào đã chuẩn hóa.
3. WHEN một agent yêu cầu tool call mà kết quả đã tồn tại trong Tool_Result_Cache với cùng key, THE Pipeline SHALL trả về kết quả cached thay vì thực thi lại tool call qua VS Code API.
4. WHEN Agent "Code Reviewer" hoàn thành, THE Shared_Context_Store SHALL lưu trữ danh sách issues, affected symbols, và files đã đọc dưới dạng structured data.
5. WHEN Agent "Flow Diagram" hoàn thành, THE Shared_Context_Store SHALL lưu trữ danh sách flows đã phát hiện và diagram metadata dưới dạng structured data.
6. WHEN Agent "Observer" bắt đầu thực thi, THE Agent_Prompt_Builder SHALL inject structured summaries từ Shared_Context_Store (issues từ Code Reviewer, flows từ Flow Diagram) vào prompt của Observer.
7. IF Shared_Context_Store vượt quá 30% Token_Budget của agent đang nhận, THEN THE Agent_Prompt_Builder SHALL truncate shared context theo thứ tự ưu tiên: tool results trước, structured summaries sau.

### Yêu cầu 2: Role-Specific Prompt Construction

**User Story:** Là một developer, tôi muốn mỗi agent chỉ nhận prompt chứa thông tin liên quan đến vai trò của nó, để giảm token usage và tăng chất lượng output.

#### Tiêu chí chấp nhận

1. THE Agent_Prompt_Builder SHALL xây dựng prompt riêng biệt cho mỗi agent role thay vì sử dụng cùng một prompt cho tất cả agent.
2. WHEN xây dựng prompt cho Agent "Code Reviewer", THE Agent_Prompt_Builder SHALL bao gồm full diff, reference context đầy đủ, và system prompt chỉ chứa review instructions (loại bỏ flow diagram và observer instructions).
3. WHEN xây dựng prompt cho Agent "Flow Diagram", THE Agent_Prompt_Builder SHALL bao gồm diff chỉ chứa structural changes (function signatures, class definitions, import changes), reference context tập trung vào call graphs và dependencies, và loại bỏ review-specific instructions.
4. WHEN xây dựng prompt cho Agent "Observer", THE Agent_Prompt_Builder SHALL bao gồm diff summary thay vì full diff, structured findings từ Code Reviewer và Flow Diagram (qua Shared_Context_Store), và reference context tập trung vào integration points.
5. THE Agent_Prompt_Builder SHALL loại bỏ REVIEW_OUTPUT_CONTRACT khỏi prompt của từng agent riêng lẻ, chỉ giữ lại cho Synthesizer.
6. WHEN xây dựng prompt cho Synthesizer, THE Agent_Prompt_Builder SHALL bao gồm REVIEW_OUTPUT_CONTRACT, structured reports từ tất cả agent, và diff summary ngắn gọn để cross-reference.

### Yêu cầu 3: Dynamic Token Budget dựa trên Model Capabilities

**User Story:** Là một developer, tôi muốn hệ thống tự động phân bổ token budget dựa trên context window thực tế của model đang sử dụng, để tận dụng tối đa khả năng của model thay vì bị giới hạn bởi hard-cap 4500 tokens cố định.

#### Tiêu chí chấp nhận

1. THE Context_Budget_Manager SHALL tính toán token budget cho reference context dựa trên context window thực tế của model (lấy từ adapter.getContextWindow()), thay vì hard-cap 4500 tokens hiện tại.
2. THE Context_Budget_Manager SHALL đảm bảo reference context budget tối thiểu là 80,000 tokens, bất kể model nào được sử dụng. Nếu context window của model nhỏ hơn mức cho phép phân bổ 80k, THE Context_Budget_Manager SHALL log warning và sử dụng tối đa token khả dụng sau khi trừ system prompt và diff.
3. THE Context_Budget_Manager SHALL tính reference context budget tối đa theo công thức: floor(adapter.getContextWindow() * configurable_ratio), trong đó configurable_ratio mặc định là 0.40 (40% context window) và có thể được override qua ContextOrchestratorConfig.
4. THE Context_Budget_Manager SHALL tăng MAX_SYMBOLS_TOTAL từ 24 lên giá trị tính theo công thức: min(floor(contextWindow / 2500), 120) để resolve đủ symbol trên model lớn (200k context → 80 symbols).
5. THE Context_Budget_Manager SHALL tăng MAX_EXPANDED_REFERENCE_FILES từ 8 lên giá trị tính theo công thức: min(floor(contextWindow / 5000), 40) để bao gồm đủ reference files (200k context → 40 files).
6. THE Context_Budget_Manager SHALL phân bổ token budget riêng cho mỗi agent role: Code Reviewer nhận 40% tổng agent budget, Flow Diagram nhận 35%, Observer nhận 25%.
7. IF tổng token usage ước tính của tất cả agent prompts vượt quá 85% context window, THEN THE Context_Budget_Manager SHALL giảm reference context proportionally cho đến khi tổng nằm trong ngưỡng an toàn.
8. THE Context_Budget_Manager SHALL đọc context window và max output tokens từ adapter (adapter.getContextWindow(), adapter.getMaxOutputTokens()) tại thời điểm review bắt đầu, KHÔNG sử dụng giá trị hard-coded.

### Yêu cầu 4: Structured Agent Output Format

**User Story:** Là một developer, tôi muốn mỗi agent output kết quả dưới dạng structured data (không chỉ raw text), để Synthesizer có thể merge chính xác và resolve conflicts giữa các agent.

#### Tiêu chí chấp nhận

1. THE Agent "Code Reviewer" SHALL output kết quả theo JSON schema bao gồm: issues[] (mỗi issue có file, location, severity, category, description, suggestion), affected_symbols[], và quality_verdict.
2. THE Agent "Flow Diagram" SHALL output kết quả theo JSON schema bao gồm: diagrams[] (mỗi diagram có name, type, plantuml_code, description), và affected_flows[].
3. THE Agent "Observer" SHALL output kết quả theo JSON schema bao gồm: risks[] (mỗi risk có description, severity, affected_area), todo_items[] (mỗi item có action, parallelizable boolean), và integration_concerns[].
4. WHEN Synthesizer nhận structured reports từ các agent, THE Synthesizer SHALL sử dụng structured data để: deduplicate issues trùng lặp giữa Code Reviewer và Observer, map risks tới specific issues, và embed PlantUML diagrams vào đúng vị trí trong report.
5. IF một agent output không parse được thành JSON hợp lệ, THEN THE Pipeline SHALL fallback sang sử dụng raw text output của agent đó và log warning.
6. THE Pipeline SHALL serialize structured agent output thành JSON trước khi lưu vào Shared_Context_Store, và deserialize khi inject vào prompt của agent khác.

### Yêu cầu 5: Execution Order tối ưu cho Agent Pipeline

**User Story:** Là một developer, tôi muốn pipeline thực thi agent theo thứ tự tối ưu (Code Reviewer và Flow Diagram song song trước, Observer sau), để Observer có thể tận dụng kết quả từ hai agent kia mà không tăng tổng thời gian chờ.

#### Tiêu chí chấp nhận

1. THE MultiAgentExecutor SHALL thực thi Agent "Code Reviewer" và Agent "Flow Diagram" song song trong phase 1.
2. WHEN cả Agent "Code Reviewer" và Agent "Flow Diagram" đều hoàn thành, THE MultiAgentExecutor SHALL bắt đầu thực thi Agent "Observer" trong phase 2.
3. THE MultiAgentExecutor SHALL inject structured output từ phase 1 agents vào prompt của Agent "Observer" trước khi bắt đầu phase 2.
4. IF Agent "Code Reviewer" hoặc Agent "Flow Diagram" thất bại trong phase 1, THEN THE MultiAgentExecutor SHALL vẫn tiếp tục thực thi Agent "Observer" với bất kỳ kết quả nào có sẵn từ agent đã hoàn thành.
5. WHILE phase 1 đang thực thi, THE Pipeline SHALL báo cáo progress "Executing Code Reviewer and Flow Diagram agents..." cho user.
6. WHILE phase 2 đang thực thi, THE Pipeline SHALL báo cáo progress "Observer analyzing with context from other agents..." cho user.

### Yêu cầu 6: Tối ưu Self-Audit cho Observer Agent

**User Story:** Là một developer, tôi muốn Observer Agent sử dụng self-audit hiệu quả hơn bằng cách tận dụng structured data từ các agent khác, để giảm token usage mà vẫn đảm bảo chất lượng audit.

#### Tiêu chí chấp nhận

1. WHEN Observer Agent thực hiện self-audit, THE Pipeline SHALL cung cấp danh sách issues từ Code Reviewer (từ Shared_Context_Store) làm checklist để Observer verify coverage.
2. WHEN Observer Agent thực hiện self-audit, THE Pipeline SHALL KHÔNG gửi lại full diff hoặc reference context, chỉ gửi previous analysis và structured checklist.
3. THE Observer Agent self-audit prompt SHALL yêu cầu Observer kiểm tra: (a) mỗi issue từ Code Reviewer có được xem xét về hidden risk không, (b) mỗi flow từ Flow Diagram có integration concern không, (c) todo items có actionable và testable không.
4. IF Observer Agent self-audit phát hiện gaps, THEN THE Observer Agent SHALL bổ sung findings mới vào structured output thay vì viết lại toàn bộ.

### Yêu cầu 7: Dependency Graph Indexing trước khi Agent chạy

**User Story:** Là một developer, tôi muốn pipeline tự động build dependency graph từ VS Code index/LSP trước khi các agent bắt đầu, để agents nhận được bối cảnh đầy đủ về mối quan hệ giữa các file/symbol mà không tốn LLM token cho việc khám phá.

#### Tiêu chí chấp nhận

1. THE Pipeline SHALL thực thi Pre-Analysis_Phase trước khi bắt đầu multi-agent execution, sử dụng hoàn toàn VS Code APIs (không gọi LLM).
2. DURING Pre-Analysis_Phase, THE Pipeline SHALL scan tất cả changed files và sử dụng VS Code DocumentLinkProvider (vscode.executeLinkProvider) để build danh sách imports/dependencies cho mỗi file.
3. DURING Pre-Analysis_Phase, THE Pipeline SHALL sử dụng VS Code DocumentSymbolProvider (vscode.executeDocumentSymbolProvider) để extract tất cả exported symbols (functions, classes, interfaces, types, constants) từ mỗi changed file.
4. DURING Pre-Analysis_Phase, THE Pipeline SHALL sử dụng VS Code ReferenceProvider (vscode.executeReferenceProvider) để tìm tất cả files tham chiếu tới các exported symbols đã extract, xây dựng reverse dependency map (symbol → list of consumer files).
5. THE Dependency_Graph_Index SHALL lưu trữ dưới dạng structured data: (a) file_dependencies: Map<filePath, {imports: string[], importedBy: string[]}>, (b) symbol_map: Map<symbolName, {definedIn: filePath, referencedBy: filePath[], type: string}>, (c) critical_paths: danh sách các chuỗi file có nhiều thay đổi liên kết với nhau.
6. THE Pipeline SHALL tính toán critical_paths bằng cách: đếm số changed files trong mỗi dependency chain, chains có >= 3 changed files được đánh dấu critical.
7. WHEN xây dựng prompt cho mỗi agent, THE Agent_Prompt_Builder SHALL inject relevant portions của Dependency_Graph_Index: Code Reviewer nhận full graph, Flow Diagram nhận critical_paths và symbol_map, Observer nhận file_dependencies summary và critical_paths.
8. THE Pre-Analysis_Phase SHALL hoàn thành trong thời gian hợp lý bằng cách giới hạn: tối đa 100 files được scan (ưu tiên changed files trước, rồi direct neighbors), tối đa 200 symbol lookups, và timeout 15 giây cho toàn bộ phase.
9. IF Pre-Analysis_Phase thất bại hoặc timeout, THEN THE Pipeline SHALL fallback về hành vi hiện tại (extractCandidateSymbolsFromDiff + buildLegacyReferenceContext) và log warning.
10. THE Dependency_Graph_Index SHALL được lưu vào Shared_Context_Store để tất cả agents và Synthesizer có thể truy cập mà không cần rebuild.

### Yêu cầu 8: Risk Hypothesis Generation (Socratic Questioning Phase)

**User Story:** Là một developer, tôi muốn pipeline tự động sinh ra các risk hypotheses cụ thể từ dependency graph và diff trước khi Observer investigate, để Observer tập trung prove/disprove từng risk thay vì tìm kiếm mù, giảm token waste và tăng tỷ lệ phát hiện bug thực tế.

*Tham khảo: Baz Agentic Reviewer đạt 7/8 trên real production bugs bằng Socratic Questioning phase — [source](https://www.baz.co/resources/engineering-intuition-at-scale-the-architecture-of-agentic-code-review)*

#### Tiêu chí chấp nhận

1. AFTER Phase 1 (Code Reviewer + Flow Diagram) hoàn thành, THE Pipeline SHALL sinh ra danh sách risk hypotheses dựa trên: (a) issues từ Code Reviewer, (b) critical_paths từ Dependency_Graph_Index, (c) cross-file dependencies có changed files ở cả hai đầu.
2. EACH risk hypothesis SHALL có dạng structured: { question: string, affected_files: string[], evidence_needed: string, severity_estimate: 'high' | 'medium' | 'low' }.
3. THE Pipeline SHALL sinh risk hypotheses bằng cách kết hợp heuristic rules (ví dụ: "API schema thay đổi → kiểm tra tất cả consumers") VÀ một LLM call nhẹ (max 2000 output tokens) nhận structured summaries từ Phase 1.
4. WHEN Observer Agent bắt đầu, THE Agent_Prompt_Builder SHALL inject risk hypotheses vào prompt với instruction: "Investigate each hypothesis. For each, provide verdict (confirmed/refuted/inconclusive) with evidence."
5. THE Observer Agent SHALL output verdict cho mỗi hypothesis thay vì free-form analysis, giúp Synthesizer map risks tới specific code locations.
6. THE Pipeline SHALL giới hạn tối đa 8 risk hypotheses để kiểm soát token budget của Observer.

### Yêu cầu 9: Mutable Blackboard — Agents ghi thêm discoveries trong quá trình chạy

**User Story:** Là một developer, tôi muốn Shared_Context_Store hoạt động như một blackboard mutable mà agents có thể ghi thêm discoveries trong quá trình chạy (không chỉ đọc từ pre-built data), để thông tin mới phát hiện bởi agent trước được agent sau tận dụng ngay.

*Tham khảo: Blackboard MAS architecture giảm token usage đáng kể bằng shared mutable memory — [source](https://arxiv.org/html/2507.01701v1)*

#### Tiêu chí chấp nhận

1. WHEN một agent thực thi tool call và nhận kết quả mới (file content, references, diagnostics), THE Shared_Context_Store SHALL tự động cập nhật Dependency_Graph_Index với thông tin mới (ví dụ: thêm edges vào dependency graph nếu phát hiện import mới).
2. WHEN Code Reviewer phát hiện một symbol quan trọng chưa có trong Dependency_Graph_Index, THE Pipeline SHALL resolve definition và references của symbol đó qua VS Code API và ghi vào Shared_Context_Store.
3. THE Shared_Context_Store SHALL hỗ trợ concurrent read/write an toàn vì Phase 1 agents chạy song song (sử dụng append-only log hoặc lock-free data structure phù hợp với single-threaded Node.js event loop).
4. WHEN Observer Agent bắt đầu Phase 2, THE Agent_Prompt_Builder SHALL đọc phiên bản mới nhất của Shared_Context_Store (bao gồm cả discoveries từ Phase 1 agents), không chỉ pre-built data.

### Yêu cầu 10: Adaptive Context Retrieval — Agent tự request thêm context khi cần

**User Story:** Là một developer, tôi muốn mỗi agent có khả năng request thêm context từ Shared_Context_Store trong quá trình chạy (pull model), thay vì chỉ nhận context tĩnh lúc khởi tạo (push model), để agent có thể đào sâu vào vùng code cần thiết mà không bị giới hạn bởi initial prompt.

*Tham khảo: SWE-Pruner task-aware adaptive pruning — [source](https://arxiv.org/html/2601.16746v1), CodeScout pre-exploration — [source](https://arxiv.org/html/2603.05744v1)*

#### Tiêu chí chấp nhận

1. THE Pipeline SHALL cung cấp một tool mới "query_context" cho agents, cho phép agent query Shared_Context_Store để lấy thêm context theo nhu cầu (ví dụ: "lấy tất cả files import symbol X", "lấy dependency chain của file Y").
2. THE "query_context" tool SHALL trả về kết quả từ Dependency_Graph_Index và Tool_Result_Cache mà không gọi VS Code API lại (zero-cost nếu data đã có trong store).
3. IF "query_context" yêu cầu data chưa có trong store, THE Pipeline SHALL thực thi VS Code API call tương ứng, cache kết quả, rồi trả về cho agent.
4. THE "query_context" tool SHALL có token budget riêng: mỗi lần query trả về tối đa 2000 tokens context, agent có thể gọi tối đa 5 lần query_context per iteration.
5. THE Agent_Prompt_Builder SHALL giảm initial context injection (push) xuống mức tối thiểu (dependency graph summary + diff), và để agent tự pull thêm context khi cần qua query_context.

### Yêu cầu 11: Backward Compatibility với kiến trúc hiện tại

**User Story:** Là một developer, tôi muốn các thay đổi kiến trúc mới tương thích ngược với codebase hiện tại, để không phá vỡ các flow review đang hoạt động.

#### Tiêu chí chấp nhận

1. THE Pipeline SHALL giữ nguyên interface AgentPrompt type trong orchestratorTypes.ts, mở rộng bằng optional fields thay vì breaking changes.
2. THE Pipeline SHALL giữ nguyên signature của generateMultiAgentFinalText() trong ContextOrchestratorService.ts, truyền Shared_Context_Store qua optional parameter hoặc internal state.
3. THE Pipeline SHALL giữ nguyên cấu trúc output cuối cùng (7 sections theo REVIEW_OUTPUT_CONTRACT) không thay đổi.
4. WHEN Shared_Context_Store không được khởi tạo (ví dụ: code path cũ), THE Pipeline SHALL fallback về hành vi hiện tại: mỗi agent nhận cùng prompt, không có shared context.
5. THE Pipeline SHALL giữ nguyên tất cả 6 VS Code tools (find_references, get_diagnostics, read_file, get_symbol_definition, get_related_files, search_code) và interface FunctionCall không thay đổi.
6. THE Pipeline SHALL giữ nguyên hierarchical chunking strategy (DiffChunkBuilder, ChunkAnalysisReducer) cho single-agent và description generation flows.
