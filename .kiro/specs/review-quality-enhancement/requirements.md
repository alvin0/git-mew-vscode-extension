# Requirements Document — Review Quality Enhancement

## Introduction

Tài liệu này mô tả các yêu cầu nâng cấp chất lượng cho hệ thống multi-agent code review của Git Mew VS Code extension. Hệ thống hiện tại sử dụng 4 agent (Code Reviewer, Flow Diagram, Observer, Detail Change) chạy theo 2 phase với SharedContextStore để chia sẻ context trong 1 phiên review.

Các cải tiến được thiết kế dựa trên nghiên cứu và xu hướng mới nhất trong lĩnh vực AI code review:

- **Multi-agent specialization**: Nghiên cứu từ [arxiv.org](https://arxiv.org/html/2511.16708) cho thấy sử dụng nhiều agent chuyên biệt cải thiện accuracy lên 39.7 percentage points so với single agent (từ 32.8% lên 72.4%), với diminishing returns +14.9pp, +13.5pp, +11.2pp cho agent thứ 2, 3, 4. Content was rephrased for compliance with licensing restrictions.
- **AI SAST multi-agent architecture**: [Endor Labs](https://endorlabs.com/learn/introducing-ai-sast-that-thinks-like-a-security-engineer) sử dụng kiến trúc Detection → Triage → Remediation agents, giảm false positives tới 95%. Content was rephrased for compliance with licensing restrictions.
- **Verification layer over comment volume**: [PropelCode](https://www.propelcode.ai/blog/ai-code-review-verification-layer-resolution-rate) và [Cursor's Bugbot](https://www.qodo.ai/blog/single-agent-vs-multi-agent-code-review/) đều chuyển từ tối ưu số lượng comments sang tối ưu resolution rate — tỷ lệ findings được resolve trước merge. Content was rephrased for compliance with licensing restrictions.
- **Draft-Critique-Revise-Freeze pattern**: [Self-Reflection and Critique](https://arunbaby.com/ai-agents/0039-self-reflection-and-critique/) mô tả kiến trúc structured self-audit với verdict/issues/fixes fields, hiệu quả hơn freeform reflection. Content was rephrased for compliance with licensing restrictions.
- **Chain-of-Verification (CoVe)**: [Blockchain.news](https://blockchain.news/ainews/chain-of-verification-cove-standard-boosts-llm-prompt-accuracy-by-40-for-technical-writing-and-code-reviews) báo cáo CoVe tăng accuracy 40% so với single-pass prompts cho code reviews. Content was rephrased for compliance with licensing restrictions.
- **Cross-session memory**: [arxiv.org](https://arxiv.org/html/2504.19413) và [Towards Data Science](https://towardsdatascience.com/ai-agent-with-multi-session-memory) mô tả kiến trúc Primary/Secondary/Tertiary memory cho AI agents, cho phép retain knowledge across sessions. Content was rephrased for compliance with licensing restrictions.
- **SAST + LLM combination**: [InfoWorld](https://www.infoworld.com/article/4093079/how-pairing-sast-with-ai-dramatically-reduces-false-positives-in-code-security.html) báo cáo kết hợp SAST rules với LLM reasoning giảm false positives 91%. Content was rephrased for compliance with licensing restrictions.

## Glossary

- **Observer_Agent**: Agent Phase 2 chuyên phát hiện hidden risks, missing edge cases, và integration regressions từ kết quả Phase 1
- **Security_Agent**: Agent Phase 1 mới chuyên phân tích bảo mật theo mô hình Detection-Triage-Remediation, tìm dangerous patterns, trace tainted data, kiểm tra auth flows
- **Self_Audit_Pass**: Bước reflection cuối mỗi agent theo pattern Draft→Critique→Revise→Freeze, model tự review lại output với structured verdict
- **SharedContextStore**: Blackboard pattern lưu trữ tool results, agent findings, dependency graph, risk hypotheses trong 1 phiên review
- **Review_Memory_Service**: Service mới persist dữ liệu xuyên các phiên review qua ExtensionContext.workspaceState, theo kiến trúc Primary/Secondary/Tertiary memory
- **Synthesizer**: Bước cuối cùng merge tất cả agent reports thành final markdown review
- **Structured_Skeleton**: Markdown template được pre-assembled từ structured data trước khi Synthesizer polish
- **AgentPromptBuilder**: Class xây dựng prompt cho từng agent với budget allocation và tool assignment
- **MultiAgentExecutor**: Class điều phối thực thi agent theo phase, tool loops, và self-audit
- **DependencyGraphIndex**: Pre-analysis component xây dựng dependency graph từ VS Code index
- **Risk_Hypothesis_Generator**: Component tạo risk hypotheses giữa Phase 1 và Phase 2 từ kết quả Code Reviewer, Flow Diagram, và Security Analyst
- **False_Positive_Suppression**: Cơ chế ghi nhớ các findings bị user dismiss để không lặp lại trong review sau, lấy cảm hứng từ Endor Labs triage agent pattern
- **Pattern_Memory**: Bộ nhớ lưu trữ recurring patterns (coding conventions, common issues) của project qua nhiều phiên review
- **Codebase_Knowledge_Cache**: Cache incremental cho dependency graph, tránh rebuild toàn bộ mỗi lần review
- **Resolution_Rate**: Metric đo tỷ lệ findings được user resolve/accept trước merge, thay vì đếm số lượng comments
- **Confidence_Score**: Điểm tin cậy (0.0-1.0) gắn với mỗi finding, dựa trên evidence strength và cross-agent agreement
- **Chain_of_Verification**: Pattern yêu cầu agent tự generate verification questions cho mỗi finding, sau đó tự trả lời để validate
- **Taint_Analysis**: Kỹ thuật trace data flow từ untrusted input sources tới sensitive sinks để phát hiện injection vulnerabilities
- **CWE_Classification**: Phân loại vulnerabilities theo Common Weakness Enumeration standard (ví dụ: CWE-79 XSS, CWE-89 SQL Injection)
- **OWASP_Top_10**: Danh sách 10 rủi ro bảo mật web phổ biến nhất, dùng làm framework phân loại cho Security Agent

## Requirements

### Requirement 1: Bổ sung find_references và get_symbol_definition tools cho Observer Agent

**User Story:** Là một developer, tôi muốn Observer Agent có khả năng trace references và definitions của symbols, để Observer có thể phát hiện integration impact chính xác hơn thay vì chỉ dựa vào inference từ diff summary.

#### Acceptance Criteria

1. THE Observer_Agent SHALL có tool `find_references` trong danh sách tools được cấp khi AgentPromptBuilder.buildObserverPrompt() xây dựng prompt
2. THE Observer_Agent SHALL có tool `get_symbol_definition` trong danh sách tools để có thể hiểu implementation chi tiết của symbols bị ảnh hưởng
3. WHEN Observer_Agent gọi `find_references` với một symbol name, THE tool execution pipeline SHALL trả về danh sách tất cả file locations tham chiếu tới symbol đó trong workspace
4. WHEN Observer_Agent nhận kết quả từ `find_references`, THE Observer_Agent SHALL sử dụng thông tin references để đánh giá integration risks trong output JSON (risks[], integrationConcerns[])
5. THE Observer_Agent SHALL giữ nguyên tất cả tools hiện có (get_diagnostics, get_related_files, read_file, queryContext) bên cạnh tools mới
6. THE Observer_Agent system prompt SHALL hướng dẫn ưu tiên sử dụng `find_references` để verify integration concerns trước khi report chúng, giảm false positive risks

### Requirement 2: Nâng cấp Self-Audit Pass theo Draft-Critique-Revise-Freeze pattern

**User Story:** Là một developer, tôi muốn self-audit pass có đầy đủ diff context và sử dụng structured critique format, để model không phải "nhớ" diff từ conversation trước, giảm recall degradation, và tạo ra audit output có thể đo lường được.

**Bối cảnh nghiên cứu:** Pattern Draft→Critique→Revise→Freeze được mô tả tại [arunbaby.com](https://arunbaby.com/ai-agents/0039-self-reflection-and-critique/) cho thấy structured critique (verdict + issues + fixes) hiệu quả hơn freeform "looks good" reflection. Chain-of-Verification tăng accuracy 40% cho code reviews. Content was rephrased for compliance with licensing restrictions.

#### Acceptance Criteria

1. WHEN MultiAgentExecutor.runSelfAudit() xây dựng audit prompt cho bất kỳ agent nào, THE Self_Audit_Pass SHALL bao gồm diff summary (từ AgentPromptBuilder.buildDiffSummary()) trong audit prompt cùng với previousAnalysis
2. WHEN MultiAgentExecutor.runObserverSelfAudit() xây dựng audit prompt cho Observer, THE Self_Audit_Pass SHALL bao gồm diff summary trong audit prompt cùng với previousAnalysis và checklist
3. THE Self_Audit_Pass SHALL truncate diff summary theo token budget còn lại sau khi tính previousAnalysis và checklist, sử dụng calibration.safeTruncatePrompt()
4. IF diff summary vượt quá 30% token budget của audit prompt, THEN THE Self_Audit_Pass SHALL chỉ giữ phần changed files summary (file paths + line counts) thay vì full diff summary
5. THE Self_Audit_Pass SHALL yêu cầu agent output structured critique JSON thay vì freeform text, gồm: verdict (PASS/NEEDS_REVISION), issues[] (mỗi item có severity, location, description), additions[] (new findings phát hiện trong audit), removals[] (findings cần loại bỏ vì incorrect)
6. WHEN Self_Audit_Pass nhận verdict "NEEDS_REVISION", THE MultiAgentExecutor SHALL merge additions vào và loại bỏ removals khỏi agent output trước khi trả về final report
7. WHEN Self_Audit_Pass nhận verdict "PASS", THE MultiAgentExecutor SHALL giữ nguyên agent output không thay đổi
8. THE Self_Audit_Pass cho Code Reviewer và Security Agent SHALL bao gồm Chain-of-Verification step: với mỗi finding có severity "critical" hoặc "major", agent SHALL tự generate 1-2 verification questions và tự trả lời dựa trên diff context để validate finding
9. IF một finding không pass Chain-of-Verification (agent tự trả lời verification questions cho thấy finding không đúng), THEN THE Self_Audit_Pass SHALL đưa finding đó vào removals[] với reason "failed_verification"
10. THE Self_Audit_Pass SHALL log structured audit results (verdict, số issues, số additions, số removals) vào LLM log cho debugging và monitoring

### Requirement 3: Security Agent chuyên biệt theo mô hình Detection-Triage

**User Story:** Là một developer, tôi muốn có một agent chuyên phân tích bảo mật tách biệt khỏi Code Reviewer, sử dụng kiến trúc detection-triage tương tự Endor Labs AI SAST, để security review có chiều sâu hơn với mindset và tools phù hợp cho việc tìm vulnerabilities.

**Bối cảnh nghiên cứu:** Endor Labs AI SAST sử dụng multi-agent architecture với Detection agents (tìm flaws), Triage agents (lọc false positives), và Remediation agents (đề xuất fixes), giảm false positives tới 95% ([endorlabs.com](https://endorlabs.com/learn/introducing-ai-sast-that-thinks-like-a-security-engineer)). Nghiên cứu từ [InfoWorld](https://www.infoworld.com/article/4093079/how-pairing-sast-with-ai-dramatically-reduces-false-positives-in-code-security.html) cho thấy kết hợp SAST rules với LLM reasoning giảm false positives 91%. Nghiên cứu từ [CodeAnt.ai](https://www.codeant.ai/blogs/why-rule-based-sast-is-not-enough) phân tích 7,703 AI-generated files phát hiện hơn 4,200 CWE instances. Content was rephrased for compliance with licensing restrictions.

#### Acceptance Criteria

1. THE AgentPromptBuilder SHALL cung cấp method `buildSecurityAgentPrompt()` trả về AgentPrompt với role "Security Analyst", phase 1, và outputSchema "security-analyst"
2. THE Security_Agent SHALL có bộ tools chuyên biệt gồm: search_code (grep dangerous patterns), find_references (trace tainted data flow), read_file (đọc implementation), get_symbol_definition (hiểu function signatures), get_diagnostics (lấy existing warnings/errors)
3. THE Security_Agent SHALL output JSON theo SecurityAnalystOutput schema gồm:
   - vulnerabilities[] — mỗi item có: file, location, cweId (CWE classification), type (injection/auth_bypass/secrets_exposure/unsafe_deserialization/path_traversal/xss/ssrf/other), severity (critical/high/medium/low), confidence (0.0-1.0), description, taintSource (nếu applicable), taintSink (nếu applicable), remediation
   - authFlowConcerns[] — mỗi item có: description, affectedEndpoints[], severity
   - inputValidationGaps[] — mỗi item có: file, location, inputSource, missingValidation, severity
   - dataExposureRisks[] — mỗi item có: file, location, dataType, exposureVector, severity
4. THE orchestratorTypes SHALL định nghĩa interface SecurityAnalystOutput và thêm vào StructuredAgentReport union type với role "Security Analyst"
5. WHEN phased execution chạy Phase 1, THE MultiAgentExecutor SHALL thực thi Security_Agent song song cùng Code Reviewer, Flow Diagram, và Detail Change
6. WHEN Phase 1 hoàn thành, THE SharedContextStore SHALL lưu Security_Agent findings với type "security" để Observer và Synthesizer truy cập
7. THE Security_Agent system prompt SHALL hướng dẫn phân tích theo OWASP Top 10 categories và CWE classification, tập trung vào:
   - Injection vulnerabilities (CWE-79 XSS, CWE-89 SQL Injection, CWE-78 OS Command Injection, CWE-918 SSRF)
   - Authentication/authorization bypass (CWE-287, CWE-862, CWE-863)
   - Secrets exposure (CWE-798 hardcoded credentials, CWE-532 log injection)
   - Unsafe deserialization (CWE-502)
   - Path traversal (CWE-22)
   - Input validation gaps (CWE-20)
8. THE Security_Agent system prompt SHALL hướng dẫn thực hiện taint analysis: trace data flow từ untrusted input sources (request params, user input, external APIs) tới sensitive sinks (database queries, file operations, command execution, response rendering)
9. THE Security_Agent SHALL gán confidence score (0.0-1.0) cho mỗi vulnerability dựa trên: evidence strength (có trace được taint flow = cao, chỉ pattern match = thấp), context completeness (đọc được full implementation = cao, chỉ thấy diff = thấp)
10. THE Security_Agent self-audit SHALL thực hiện triage step: với mỗi vulnerability có confidence < 0.6, agent SHALL sử dụng tools để gather thêm evidence hoặc downgrade/remove finding
11. THE Synthesizer (buildSynthesizerPrompt) SHALL tích hợp Security_Agent findings vào section "Improvement Suggestions" với category header "### Security" và vào section "Potential Hidden Risks"
12. THE Synthesizer SHALL chỉ include security findings có confidence >= 0.5 trong final report, findings có confidence < 0.5 SHALL được log nhưng không hiển thị
13. THE Security_Agent SHALL có selfAudit enabled và maxIterations là 3, giống các agent Phase 1 khác
14. THE ContextBudgetManager SHALL phân bổ budget cho Security_Agent tương đương với Code Reviewer agent
15. THE Risk_Hypothesis_Generator SHALL sử dụng Security_Agent findings (bên cạnh Code Reviewer và Flow Diagram) để generate risk hypotheses cho Observer Phase 2, đặc biệt cho hypotheses liên quan tới security impact across files


### Requirement 4: Review Memory Service xuyên phiên theo kiến trúc Tiered Memory

**User Story:** Là một developer, tôi muốn hệ thống review nhớ được patterns, false positives, và knowledge từ các phiên review trước, để mỗi review sau càng chính xác và ít noise hơn.

**Bối cảnh nghiên cứu:** Kiến trúc tiered memory (Primary/Secondary/Tertiary) được mô tả tại [Towards Data Science](https://towardsdatascience.com/ai-agent-with-multi-session-memory) cho phép AI agents retain knowledge across sessions. [arxiv.org](https://arxiv.org/html/2504.19413) mô tả persistent memory layer cho LLM agents với context-aware behavior across multi-session interactions. [arxiv.org](https://arxiv.org/html/2512.12686v1) định nghĩa "agentic memory" là khả năng retain và act upon information across conversations. Content was rephrased for compliance with licensing restrictions.

#### Acceptance Criteria

1. THE Review_Memory_Service SHALL persist dữ liệu qua ExtensionContext.workspaceState với key prefix "gitmew.reviewMemory."
2. THE Review_Memory_Service SHALL cung cấp 4 subsystems theo tiered memory architecture:
   - **Primary Memory** (trong phiên): SharedContextStore hiện tại — tool results, agent findings, dependency graph
   - **Secondary Memory** (ngắn hạn, xuyên phiên): Pattern_Memory + False_Positive_Suppression + Review History — persist qua workspaceState
   - **Tertiary Memory** (dài hạn): Codebase_Knowledge_Cache — incremental dependency graph, project-level conventions
3. WHEN một review hoàn thành, THE Pattern_Memory SHALL trích xuất và lưu recurring patterns từ structured agent outputs, bao gồm:
   - Từ CodeReviewerOutput.issues[]: nhóm issues theo category + file pattern, tăng frequency count nếu pattern đã tồn tại
   - Từ SecurityAnalystOutput.vulnerabilities[]: nhóm theo CWE type + file pattern
   - Từ ObserverOutput.risks[]: nhóm theo affectedArea pattern
4. THE Pattern_Memory SHALL lưu tối đa 50 patterns, mỗi pattern gồm: pattern description, category (correctness/security/performance/maintainability/testing), frequency count, first seen timestamp, last seen timestamp, affected file patterns (glob), average severity, và source agents (danh sách agents đã report pattern này)
5. THE Pattern_Memory SHALL sử dụng decay function: patterns không xuất hiện trong 30 ngày SHALL giảm frequency count 50%, patterns có frequency count < 1 sau decay SHALL bị xóa
6. WHEN Pattern_Memory có patterns liên quan tới changed files (match glob pattern), THE AgentPromptBuilder SHALL inject tối đa 10 relevant patterns (sorted by frequency * recency) vào system prompt của Code Reviewer, Security Agent, và Observer
7. THE injected patterns SHALL được format dưới dạng: "## Project Patterns from Previous Reviews\n- [category] pattern_description (seen N times, last: date)"
8. WHEN user dismiss một finding trong review UI (click dismiss/ignore button), THE False_Positive_Suppression SHALL lưu finding signature gồm:
   - file_pattern: glob pattern từ file path (ví dụ: "src/commands/**/*.ts")
   - issue_category: category từ finding (correctness/security/performance/etc.)
   - description_hash: SHA-256 hash của normalized description (lowercase, remove whitespace)
   - dismiss_reason: optional text từ user
   - dismissed_at: timestamp
9. THE False_Positive_Suppression SHALL lưu tối đa 200 suppressed findings, sử dụng LRU eviction khi vượt quá
10. WHEN Synthesizer xây dựng final report, THE Synthesizer SHALL kiểm tra mỗi finding against suppression list:
    - Match file_pattern (glob match)
    - Match issue_category (exact match)
    - Match description similarity (word overlap ratio >= 0.7 HOẶC description_hash exact match)
    - Nếu cả 3 match, finding SHALL được loại bỏ khỏi final report và log "suppressed: {reason}"
11. WHEN một review hoàn thành, THE Codebase_Knowledge_Cache SHALL cập nhật incremental dependency graph:
    - Chỉ re-scan files có modification timestamp mới hơn cache timestamp
    - Merge new file dependencies vào cached graph qua SharedContextStore.updateDependencyGraph()
    - Remove entries cho files đã bị xóa
12. THE Codebase_Knowledge_Cache SHALL invalidate toàn bộ cache khi:
    - User chạy "clear memory" command
    - Package.json hoặc tsconfig.json thay đổi (dependency structure có thể thay đổi)
    - Cache age > 7 ngày
13. THE Review_Memory_Service SHALL lưu tối đa 20 review summaries gần nhất trong Review History, mỗi summary gồm:
    - timestamp, baseBranch, compareBranch
    - changed files list
    - quality verdict (từ CodeReviewerOutput.qualityVerdict)
    - issue count by severity (critical/major/minor/suggestion)
    - security vulnerability count by type
    - top 5 findings (highest severity first)
    - resolution_rate: tỷ lệ findings được user resolve (nếu có data)
14. WHEN bắt đầu review mới, THE AgentPromptBuilder SHALL inject review history context:
    - Cho Observer Agent: tối đa 3 recent reviews liên quan tới changed files, bao gồm previous findings và risks
    - Cho Code Reviewer: tối đa 2 recent reviews cho same files, highlight recurring issues
    - Cho Security Agent: tối đa 2 recent reviews với security findings cho related files
15. THE Review_Memory_Service SHALL cung cấp method `clear()` để user reset toàn bộ memory khi cần, accessible qua VS Code command palette "Git Mew: Clear Review Memory"
16. IF workspaceState không khả dụng (ví dụ: remote workspace), THEN THE Review_Memory_Service SHALL fallback sang in-memory storage và log warning
17. THE Review_Memory_Service SHALL cung cấp method `getStats()` trả về: total patterns, total suppressed findings, cache hit rate, total reviews stored, average resolution rate
18. WHEN Review_Memory_Service được khởi tạo, THE service SHALL validate stored data integrity và auto-repair hoặc clear corrupted entries

### Requirement 5: Structured Skeleton và Verification Layer cho Synthesizer

**User Story:** Là một developer, tôi muốn Synthesizer nhận một markdown skeleton đã pre-assembled từ structured data và có verification layer, để giảm risk mất findings khi merge, đảm bảo output nhất quán, và tối ưu resolution rate thay vì comment volume.

**Bối cảnh nghiên cứu:** [PropelCode](https://www.propelcode.ai/blog/ai-code-review-verification-layer-resolution-rate) mô tả verification layer gồm provenance, risk routing, runtime validation, và metrics grounded in merged outcomes. [Cursor's Bugbot](https://www.qodo.ai/blog/single-agent-vs-multi-agent-code-review/) cải thiện resolution rate bằng cách giảm noise, sử dụng majority voting, và dựa vào historical context. [Cubic.dev](https://www.cubic.dev/blog/the-ai-code-review-stack-a-6-layer-strategy-for-quality-confidence) mô tả 6-layer validation stack cho AI code review. Content was rephrased for compliance with licensing restrictions.

#### Acceptance Criteria

1. WHEN AgentPromptBuilder.buildSynthesizerPrompt() xây dựng prompt, THE AgentPromptBuilder SHALL tạo một pre-assembled markdown skeleton chứa tất cả sections theo REVIEW_OUTPUT_CONTRACT trước khi gửi cho Synthesizer
2. THE Structured_Skeleton SHALL bao gồm section "Changed File Paths" được pre-filled từ changedFiles data (file paths + status labels)
3. THE Structured_Skeleton SHALL bao gồm section "Summary of Changes" với placeholder instruction cho Synthesizer viết summary dựa trên tất cả agent findings (max 100 words)
4. THE Structured_Skeleton SHALL bao gồm section "Detail Change" được pre-filled từ Detail Change agent raw report
5. THE Structured_Skeleton SHALL bao gồm section "Flow Diagram" được pre-filled với PlantUML blocks từ FlowDiagramOutput.diagrams[], mỗi diagram có heading "### Diagram: {name}" và description
6. THE Structured_Skeleton SHALL bao gồm section "Code Quality Assessment" được pre-filled với qualityVerdict từ CodeReviewerOutput, kèm instruction cho Synthesizer viết 2-3 câu justification
7. THE Structured_Skeleton SHALL bao gồm section "Improvement Suggestions" được pre-filled với deduplicated issues dưới dạng card layout:
   - Issues từ Code Reviewer: sorted by severity (critical → suggestion)
   - Issues từ Security Agent: grouped under "### Security" header, sorted by confidence * severity
   - Mỗi card gồm: File & Location, Issue, Why it matters, Actionable fix, Confidence score
8. THE Structured_Skeleton SHALL bao gồm section "Observer TODO List" được pre-filled với todoItems từ ObserverOutput, mỗi item có prefix [Sequential] hoặc [Parallel]
9. THE Structured_Skeleton SHALL bao gồm section "Potential Hidden Risks" được pre-filled với:
   - Risks từ ObserverOutput (sorted by severity)
   - Hypothesis verdicts (confirmed/refuted/inconclusive) từ Observer
   - Security risks có confidence >= 0.5 từ Security Agent
10. WHEN một section trong skeleton không có data, THE Structured_Skeleton SHALL pre-fill section đó với text "None" theo REVIEW_OUTPUT_CONTRACT
11. THE Synthesizer prompt SHALL hướng dẫn model:
    - Chỉ polish, bổ sung narrative, và cải thiện wording trên skeleton có sẵn
    - KHÔNG được xóa bất kỳ finding nào từ skeleton
    - CÓ THỂ thêm Before/After code snippets cho top 3 critical/major issues
    - CÓ THỂ thêm Guided Change Snippets khi fix rõ ràng
    - PHẢI giữ nguyên confidence scores và CWE classifications từ Security Agent
12. THE Synthesizer SHALL thực hiện cross-agent agreement check: findings được report bởi >= 2 agents (ví dụ: Code Reviewer + Security Agent cùng report 1 issue) SHALL được đánh dấu "[Cross-validated]" và tăng priority trong output
13. THE Synthesizer SHALL gán provenance tag cho mỗi finding: "[CR]" cho Code Reviewer, "[SA]" cho Security Analyst, "[OB]" cho Observer, "[XV]" cho cross-validated, để user biết finding đến từ agent nào
14. THE Synthesizer output SHALL bao gồm metadata footer (ẩn trong HTML comment) gồm: total findings count, findings by severity, findings by source agent, cross-validated count, suppressed count, review duration

### Requirement 6: Confidence Scoring và Resolution Rate Tracking

**User Story:** Là một developer, tôi muốn mỗi finding có confidence score và hệ thống track resolution rate, để tôi có thể ưu tiên findings quan trọng nhất và hệ thống tự cải thiện qua thời gian.

**Bối cảnh nghiên cứu:** [Qodo 2.0](https://www.qodo.ai/blog/introducing-qodo-2-0-agentic-code-review/) đạt F1 score 60.1% bằng cách tối ưu precision-recall thay vì comment volume. [Cursor's Bugbot](https://www.qodo.ai/blog/single-agent-vs-multi-agent-code-review/) cải thiện resolution rate bằng majority voting và historical context. Content was rephrased for compliance with licensing restrictions.

#### Acceptance Criteria

1. THE CodeReviewerOutput.issues[] SHALL bao gồm field `confidence` (0.0-1.0) cho mỗi issue, dựa trên:
   - 0.9-1.0: Agent đọc được full implementation và verify được issue qua tools
   - 0.7-0.89: Agent có strong evidence từ diff + reference context
   - 0.5-0.69: Agent infer từ diff patterns nhưng chưa verify qua tools
   - 0.0-0.49: Agent suspect nhưng thiếu evidence (sẽ bị filter bởi Synthesizer)
2. THE SecurityAnalystOutput.vulnerabilities[] SHALL bao gồm field `confidence` (0.0-1.0) với criteria tương tự, bổ sung:
   - +0.2 nếu trace được complete taint flow (source → sink)
   - +0.1 nếu có CWE classification match
   - -0.2 nếu chỉ dựa trên pattern matching mà không verify context
3. THE ObserverOutput.risks[] SHALL bao gồm field `confidence` (0.0-1.0), dựa trên:
   - Evidence từ Phase 1 findings (cross-agent agreement tăng confidence)
   - Evidence từ tool calls (find_references, read_file verify được risk)
   - Hypothesis verdict (confirmed = +0.3, inconclusive = 0, refuted = -0.5)
4. THE Synthesizer SHALL sort findings trong mỗi section theo: severity DESC, confidence DESC
5. THE Synthesizer SHALL hiển thị confidence score cho mỗi finding dưới dạng: "🔴 Critical (95%)" hoặc "🟡 Minor (62%)"
6. WHEN user resolve/dismiss một finding trong review UI, THE Review_Memory_Service SHALL record:
   - finding_id: unique identifier
   - action: "resolved" | "dismissed" | "acknowledged"
   - timestamp
7. THE Review_Memory_Service SHALL tính resolution_rate cho mỗi review: (resolved + acknowledged) / total_findings
8. THE Review_Memory_Service SHALL tính resolution_rate theo agent: cho mỗi agent, tỷ lệ findings từ agent đó được resolve
9. WHEN resolution_rate của một agent consistently < 30% qua 5 reviews liên tiếp, THE Review_Memory_Service SHALL log warning và suggest user review agent configuration
10. THE Review_Memory_Service SHALL sử dụng historical resolution data để adjust confidence scores: nếu findings từ một category/file_pattern thường bị dismiss (dismiss_rate > 70%), THE system SHALL giảm confidence score 0.15 cho findings tương tự trong reviews sau
11. THE AgentPromptBuilder SHALL inject resolution rate statistics vào Synthesizer prompt: "Historical resolution rate: {rate}%. Findings from {agent} are resolved {agent_rate}% of the time. Prioritize high-confidence findings."

### Requirement 7: Nâng cấp Risk Hypothesis Generator với Security Context

**User Story:** Là một developer, tôi muốn Risk Hypothesis Generator sử dụng findings từ Security Agent bên cạnh Code Reviewer và Flow Diagram, để Observer có thể investigate security-related risks chính xác hơn.

#### Acceptance Criteria

1. THE Risk_Hypothesis_Generator.generate() SHALL nhận thêm SecurityAnalystOutput làm input parameter bên cạnh CodeReviewerOutput và FlowDiagramOutput
2. THE Risk_Hypothesis_Generator SHALL generate security-specific hypotheses từ SecurityAnalystOutput:
   - Với mỗi vulnerability có taintSource: "Tainted data from {source} flows to {sink} in {file}. Are there other sinks not covered by the diff?"
   - Với mỗi authFlowConcern: "Auth flow concern in {endpoints}. Are there bypass paths through other endpoints?"
   - Với mỗi inputValidationGap: "Input validation missing at {location}. Are there other entry points with same missing validation?"
3. THE Risk_Hypothesis_Generator SHALL cross-reference security findings với dependency graph: nếu một file có vulnerability và có >= 3 consumers (importedBy), generate hypothesis về cascading security impact
4. THE Risk_Hypothesis_Generator SHALL tăng MAX_HYPOTHESES từ 8 lên 10 để accommodate security hypotheses
5. THE Risk_Hypothesis_Generator.buildSummaries() SHALL bao gồm security findings summary bên cạnh Code Review Issues và Affected Flows
6. THE generated hypotheses SHALL bao gồm field `category`: "integration" | "security" | "correctness" | "performance" để Observer có thể prioritize investigation


### Requirement 8: Deep-Dive Multi-Agent Synthesis — Chia nhỏ agent cho Improvement Suggestions, Observer TODO, và Hidden Risks

**User Story:** Là một developer, tôi muốn các phần Improvement Suggestions, Observer TODO List, và Potential Hidden Risks được phân tích sâu bởi các agent chuyên biệt riêng biệt thay vì để 1 Synthesizer agent gánh hết, để tránh giới hạn max output tokens và đảm bảo mỗi phần được đào sâu đầy đủ.

**Bối cảnh:** Hiện tại Synthesizer nhận tất cả agent reports rồi tự viết toàn bộ final report trong 1 LLM call. Với diff lớn và nhiều findings, Synthesizer bị giới hạn bởi max output tokens → các phần cuối report (TODO List, Hidden Risks) thường bị cắt ngắn hoặc thiếu chi tiết. Giải pháp: chia Synthesis thành nhiều agent chuyên biệt, mỗi agent focus vào 1-2 sections, sau đó merge kết quả.

#### Acceptance Criteria

1. THE Synthesis phase SHALL được chia thành Phase 3 với nhiều Synthesis Agents chạy song song, thay vì 1 Synthesizer agent duy nhất
2. THE Phase 3 SHALL bao gồm các Synthesis Agents sau, mỗi agent chịu trách nhiệm 1-2 sections:
   - **Summary & Detail Agent**: Viết "Summary of Changes" (max 100 words) + "Detail Change" section từ Detail Change agent raw report + all agent findings
   - **Improvement Suggestions Agent**: Viết "Improvement Suggestions" section từ Code Reviewer issues + Security Agent findings, với full card layout (File & Location, Issue, Why it matters, Actionable fix, Before/After snippets, Guided Change Snippets)
   - **Risk & TODO Agent**: Viết "Observer TODO List" + "Potential Hidden Risks" sections từ Observer findings + hypothesis verdicts + security risks
   - **Diagram & Assessment Agent**: Viết "Flow Diagram" section (polish PlantUML) + "Code Quality Assessment" section
3. EACH Synthesis Agent SHALL nhận:
   - Structured data từ SharedContextStore (agent findings, hypotheses)
   - Diff summary cho context
   - REVIEW_OUTPUT_CONTRACT cho section format requirements
   - Suppressed findings list để filter
   - Resolution rate statistics
4. THE Improvement Suggestions Agent SHALL KHÔNG có giới hạn số lượng suggestions — agent SHALL viết chi tiết cho TẤT CẢ findings từ Code Reviewer và Security Agent, bao gồm Before/After code snippets cho mỗi finding khi có thể
5. THE Risk & TODO Agent SHALL KHÔNG giới hạn ở 4 TODO items — agent SHALL viết chi tiết cho TẤT CẢ risks và TODO items từ Observer, bao gồm:
   - Mỗi TODO item có: action description, rationale, expected outcome, priority
   - Mỗi Hidden Risk có: risk description, affected areas, likelihood, impact, mitigation suggestion
6. THE Improvement Suggestions Agent SHALL có tools: read_file, search_code, get_symbol_definition để có thể đọc code và viết accurate Before/After snippets
7. THE Risk & TODO Agent SHALL có tools: find_references, get_related_files, read_file để có thể verify risks và trace integration impact
8. AFTER tất cả Synthesis Agents hoàn thành, THE MultiAgentExecutor SHALL merge outputs thành 1 final markdown report theo đúng thứ tự sections trong REVIEW_OUTPUT_CONTRACT
9. THE merge step SHALL là deterministic string concatenation (không cần thêm LLM call), chỉ thêm:
   - "Changed File Paths" section (pre-built từ changedFiles data)
   - Metadata footer (HTML comment với stats)
   - Provenance tags và cross-validation markers
10. EACH Synthesis Agent SHALL có maxIterations là 2 và selfAudit disabled (vì input đã qua self-audit từ Phase 1/2)
11. THE ContextBudgetManager SHALL phân bổ budget riêng cho mỗi Synthesis Agent, với Improvement Suggestions Agent nhận budget lớn nhất (40% synthesis budget) vì cần viết nhiều nhất
12. THE Synthesis Agents SHALL chạy song song (concurrency = 4) để giảm latency tổng thể
13. IF một Synthesis Agent fail, THE merge step SHALL sử dụng raw data từ structured skeleton cho section tương ứng thay vì để trống
14. THE Observer TODO List output từ Risk & TODO Agent SHALL bao gồm cả items từ Observer Agent lẫn items mới mà Risk & TODO Agent phát hiện khi đào sâu vào risks
15. THE Improvement Suggestions Agent SHALL group suggestions theo category headers: "### Correctness", "### Security", "### Performance", "### Maintainability", "### Testing" — mỗi category không giới hạn số items
