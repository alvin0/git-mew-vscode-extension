# Tài liệu Yêu cầu: Review Merged Branch Agent Plan

## Giới thiệu

Tính năng "Review Merged Branch" cho phép người dùng review lại một nhánh đã được merge vào nhánh chính (main/master). Hiện tại hệ thống đã có chức năng "Review Merge" so sánh hai nhánh trước khi merge. Tính năng mới này mở rộng khả năng review sang trường hợp nhánh đã được merge xong — giúp người dùng hiểu rõ những thay đổi đã được đưa vào nhánh chính, phát hiện vấn đề tiềm ẩn sau merge, và tạo báo cáo review toàn diện cho các nhánh đã hoàn thành.

## Thuật ngữ

- **Review_Merged_Branch_Service**: Service xử lý logic review cho nhánh đã merge, kế thừa từ ReviewWorkflowServiceBase
- **Merge_Commit_Resolver**: Module xác định merge commit và trích xuất diff từ lịch sử git cho nhánh đã merge
- **Post_Merge_Diff_Provider**: Module cung cấp diff của nhánh đã merge bằng cách so sánh merge commit với parent commit trên nhánh chính
- **Multi_Agent_Pipeline**: Pipeline thực thi song song 3 agent chuyên biệt (Code Reviewer, Flow Diagram, Observer) và tổng hợp kết quả
- **Synthesizer**: Agent tổng hợp kết quả từ các agent chuyên biệt thành báo cáo review cuối cùng
- **Webview_Panel**: Giao diện VS Code webview hiển thị kết quả review cho người dùng
- **SharedContextStore**: Kho lưu trữ context dùng chung giữa các agent trong pipeline phased execution
- **DependencyGraphIndex**: Module xây dựng đồ thị phụ thuộc từ VS Code index cho các file thay đổi
- **Merged_Branch**: Nhánh đã được merge vào nhánh chính và có thể đã bị xóa khỏi remote
- **Merge_Point**: Commit merge trên nhánh chính đánh dấu điểm nhánh được merge vào

## Yêu cầu

### Yêu cầu 1: Xác định và trích xuất diff của nhánh đã merge

**User Story:** Là một developer, tôi muốn hệ thống tự động xác định merge commit và trích xuất diff của nhánh đã merge, để tôi có thể review lại những thay đổi đã được đưa vào nhánh chính.

#### Tiêu chí chấp nhận

1. WHEN người dùng chọn một nhánh đã merge từ danh sách, THE Merge_Commit_Resolver SHALL xác định merge commit tương ứng trên nhánh chính bằng cách tìm kiếm trong git log
2. WHEN merge commit được xác định, THE Post_Merge_Diff_Provider SHALL trích xuất diff bằng cách so sánh merge commit với parent commit trước đó trên nhánh chính (first-parent diff)
3. WHEN nhánh đã merge bị xóa khỏi remote nhưng merge commit vẫn tồn tại trong lịch sử, THE Merge_Commit_Resolver SHALL vẫn xác định được merge commit thông qua git log --merges
4. IF merge commit không tìm thấy cho nhánh được chọn, THEN THE Merge_Commit_Resolver SHALL trả về thông báo lỗi mô tả rõ lý do không tìm thấy merge commit
5. THE Post_Merge_Diff_Provider SHALL trả về danh sách UnifiedDiffFile[] và chuỗi diff đã render, tương thích với định dạng đầu vào của Multi_Agent_Pipeline hiện tại

### Yêu cầu 2: Hiển thị danh sách nhánh đã merge để người dùng chọn

**User Story:** Là một developer, tôi muốn thấy danh sách các nhánh đã được merge gần đây, để tôi có thể chọn nhánh cần review.

#### Tiêu chí chấp nhận

1. WHEN người dùng kích hoạt lệnh "Review Merged Branch", THE Webview_Panel SHALL hiển thị danh sách các nhánh đã merge vào nhánh chính, sắp xếp theo thời gian merge giảm dần
2. THE Webview_Panel SHALL hiển thị tối đa 50 nhánh đã merge gần nhất
3. WHEN danh sách nhánh đã merge được hiển thị, THE Webview_Panel SHALL hiển thị kèm theo thông tin: tên nhánh, ngày merge, và tác giả merge commit
4. THE Webview_Panel SHALL cho phép người dùng tìm kiếm nhánh theo tên trong danh sách đã merge
5. IF không có nhánh nào đã merge trong repository, THEN THE Webview_Panel SHALL hiển thị thông báo "Không tìm thấy nhánh đã merge nào trong repository"

### Yêu cầu 3: Thực thi Multi-Agent Pipeline cho review nhánh đã merge

**User Story:** Là một developer, tôi muốn hệ thống sử dụng pipeline multi-agent hiện có để phân tích nhánh đã merge, để tôi nhận được review chất lượng cao với nhiều góc nhìn chuyên biệt.

#### Tiêu chí chấp nhận

1. WHEN người dùng yêu cầu review một nhánh đã merge, THE Review_Merged_Branch_Service SHALL khởi tạo Multi_Agent_Pipeline với 3 agent: Code Reviewer, Flow Diagram, và Observer
2. THE Review_Merged_Branch_Service SHALL tái sử dụng AgentPromptBuilder hiện có để xây dựng prompt cho từng agent với budget allocation phù hợp
3. WHEN Multi_Agent_Pipeline thực thi, THE Review_Merged_Branch_Service SHALL truyền diff từ Post_Merge_Diff_Provider vào pipeline thay vì diff từ so sánh hai nhánh trực tiếp
4. THE Review_Merged_Branch_Service SHALL xây dựng DependencyGraphIndex từ danh sách file thay đổi của nhánh đã merge
5. THE Review_Merged_Branch_Service SHALL sử dụng SharedContextStore để chia sẻ context giữa Phase 1 (Code Reviewer + Flow Diagram song song) và Phase 2 (Observer)
6. WHEN pipeline hoàn thành, THE Synthesizer SHALL tổng hợp kết quả từ 3 agent thành báo cáo review cuối cùng theo định dạng markdown có cấu trúc

### Yêu cầu 4: Hiển thị kết quả review trên Webview Panel

**User Story:** Là một developer, tôi muốn xem kết quả review nhánh đã merge trong một giao diện rõ ràng, để tôi có thể nhanh chóng hiểu những thay đổi và vấn đề tiềm ẩn.

#### Tiêu chí chấp nhận

1. WHEN review hoàn thành, THE Webview_Panel SHALL hiển thị báo cáo review dưới dạng markdown đã render với syntax highlighting
2. THE Webview_Panel SHALL hiển thị tab "Review" chứa phân tích code, flow diagram (PlantUML), và danh sách rủi ro
3. THE Webview_Panel SHALL hiển thị tab "Diff" chứa diff gốc của nhánh đã merge với syntax highlighting
4. WHEN báo cáo review chứa PlantUML diagram, THE Webview_Panel SHALL render diagram thành hình ảnh trực quan
5. IF PlantUML render thất bại, THEN THE Webview_Panel SHALL gọi repairPlantUmlMarkdown để sửa và render lại diagram
6. WHILE review đang được tạo, THE Webview_Panel SHALL hiển thị progress indicator với thông báo trạng thái từng bước của pipeline

### Yêu cầu 5: Tích hợp với hệ thống LLM adapter hiện có

**User Story:** Là một developer, tôi muốn sử dụng cùng cấu hình LLM provider đã thiết lập cho Review Merge, để tôi không cần cấu hình lại khi review nhánh đã merge.

#### Tiêu chí chấp nhận

1. THE Review_Merged_Branch_Service SHALL sử dụng cùng LLM provider và model đã cấu hình trong settings "git-mew.reviewMerge" (provider, model, language, contextStrategy)
2. THE Review_Merged_Branch_Service SHALL hỗ trợ tất cả 5 LLM provider hiện có: OpenAI, Claude, Gemini, Ollama, và Custom
3. WHEN người dùng thay đổi provider hoặc model trên Webview_Panel, THE Review_Merged_Branch_Service SHALL lưu preference mới thông qua persistReviewPreferences
4. THE Review_Merged_Branch_Service SHALL sử dụng AdapterCalibrationService để tự động phát hiện và điều chỉnh context window khi gặp lỗi context-length
5. IF API key chưa được cấu hình cho provider đã chọn, THEN THE Review_Merged_Branch_Service SHALL hiển thị thông báo yêu cầu cấu hình API key

### Yêu cầu 6: Hỗ trợ hủy và xử lý lỗi

**User Story:** Là một developer, tôi muốn có thể hủy quá trình review đang chạy và nhận thông báo lỗi rõ ràng khi có sự cố, để tôi không bị chặn workflow.

#### Tiêu chí chấp nhận

1. WHILE review đang được tạo, THE Webview_Panel SHALL hiển thị nút "Cancel" cho phép người dùng hủy quá trình
2. WHEN người dùng nhấn "Cancel", THE Review_Merged_Branch_Service SHALL hủy tất cả LLM request đang chạy thông qua AbortController và dừng pipeline ngay lập tức
3. IF một agent trong Multi_Agent_Pipeline gặp lỗi, THEN THE Review_Merged_Branch_Service SHALL ghi log lỗi và tiếp tục với kết quả từ các agent còn lại
4. IF tất cả agent đều thất bại, THEN THE Review_Merged_Branch_Service SHALL trả về thông báo lỗi tổng hợp mô tả nguyên nhân từng agent
5. WHEN lỗi context-length xảy ra, THE AdapterCalibrationService SHALL tự động retry với prompt đã truncate phù hợp

### Yêu cầu 7: Đăng ký lệnh VS Code và tích hợp menu

**User Story:** Là một developer, tôi muốn truy cập tính năng review nhánh đã merge từ Command Palette và SCM menu, để tôi có thể sử dụng tính năng một cách thuận tiện.

#### Tiêu chí chấp nhận

1. THE Extension SHALL đăng ký lệnh "git-mew.review-merged-branch" trong package.json với title "git-mew: Review Merged Branch"
2. THE Extension SHALL hiển thị lệnh "Review Merged Branch" trong SCM title menu khi scmProvider là git
3. WHEN người dùng kích hoạt lệnh, THE Extension SHALL mở Webview_Panel với giao diện chọn nhánh đã merge
4. THE Extension SHALL sử dụng icon "$(history)" cho lệnh trong SCM menu

### Yêu cầu 8: Hỗ trợ custom prompt và rules từ repository

**User Story:** Là một developer, tôi muốn tùy chỉnh hành vi review bằng custom prompt và rules trong repository, để review phù hợp với quy chuẩn của dự án.

#### Tiêu chí chấp nhận

1. THE Review_Merged_Branch_Service SHALL đọc custom system prompt từ file `.gitmew/system-prompt.review-merge.md` trong repository nếu tồn tại
2. THE Review_Merged_Branch_Service SHALL đọc custom agent instructions từ file `.gitmew/agent-rule.review-merge.md` trong repository nếu tồn tại
3. THE Review_Merged_Branch_Service SHALL đọc custom review rules từ file `.gitmew/code-rule.review-merge.md` trong repository nếu tồn tại
4. WHEN custom prompt hoặc rules tồn tại, THE Review_Merged_Branch_Service SHALL inject nội dung vào system message của các agent trước khi thực thi pipeline
