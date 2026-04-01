# Kế hoạch Triển khai: Review Merged Branch Agent Plan

## Tổng quan

Triển khai tính năng "Review Merged Branch" cho git-mew VS Code extension. Tính năng cho phép người dùng review lại nhánh đã merge vào nhánh chính bằng cách trích xuất diff từ merge commit và chạy pipeline multi-agent review. Thứ tự triển khai: Git methods → Service → Webview → Command registration → Tests.

## Tasks

- [x] 1. Thêm các Git methods mới vào GitService
  - [x] 1.1 Implement `execGitCommand()` — chạy git CLI trực tiếp qua `child_process.execFile`
    - File: `src/services/utils/gitService.ts`
    - Thêm import: `import { execFile } from 'child_process';`
    - Implement private method:
      ```typescript
      private async execGitCommand(args: string[]): Promise<string> {
          const repository = this.getRepository();
          const cwd = repository.rootUri.fsPath;
          return new Promise((resolve, reject) => {
              execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                  if (error) { reject(new Error(`git ${args[0]} failed: ${stderr || error.message}`)); }
                  else { resolve(stdout); }
              });
          });
      }
      ```
    - Đặt method sau `getCustomDescriptionMergeSystemPrompt()` (cuối file)
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Implement `parseBranchNameFromMergeMessage()` — trích xuất tên nhánh từ merge commit message
    - File: `src/services/utils/gitService.ts`
    - Implement private method ngay sau `execGitCommand()`:
      ```typescript
      private parseBranchNameFromMergeMessage(message: string): string {
          // Pattern 1: "Merge branch 'feature/xyz' into main"
          const branchInto = message.match(/Merge branch '(.+?)' into .+/);
          if (branchInto) return branchInto[1];
          // Pattern 2: "Merge branch 'feature/xyz'"
          const branch = message.match(/Merge branch '(.+?)'/);
          if (branch) return branch[1];
          // Pattern 3: "Merge pull request #123 from user/branch"
          const pr = message.match(/Merge pull request #\d+ from (.+)/);
          if (pr) return pr[1];
          // Pattern 4: "Merge remote-tracking branch 'origin/feature'"
          const remote = message.match(/Merge remote-tracking branch '(.+?)'/);
          if (remote) return remote[1];
          // Fallback
          return message;
      }
      ```
    - Lưu ý: Pattern "into" phải check trước pattern standard vì nó cụ thể hơn
    - _Requirements: 1.1, 1.3_

  - [x] 1.3 Implement `getMergedBranches()` — lấy danh sách nhánh đã merge
    - File: `src/services/utils/gitService.ts`
    - Thêm interface `MergedBranchInfo` trước class GitService (export để dùng ở nơi khác):
      ```typescript
      export interface MergedBranchInfo {
          branchName: string;
          mergeCommitSha: string;
          mergeDate: Date;
          mergeAuthor: string;
          mergeMessage: string;
      }
      ```
    - Implement public method ngay sau `parseBranchNameFromMergeMessage()`:
      ```typescript
      public async getMergedBranches(targetBranch: string, limit: number = 50): Promise<MergedBranchInfo[]> {
          const output = await this.execGitCommand([
              'log', '--merges', '--first-parent',
              '--format=%H|%ai|%an|%s',
              targetBranch,
              '-n', String(limit)
          ]);
          if (!output.trim()) return [];
          return output.trim().split('\n')
              .filter(line => line.trim())
              .map(line => {
                  const [sha, date, author, ...messageParts] = line.split('|');
                  const message = messageParts.join('|');
                  return {
                      mergeCommitSha: sha,
                      mergeDate: new Date(date),
                      mergeAuthor: author,
                      mergeMessage: message,
                      branchName: this.parseBranchNameFromMergeMessage(message),
                  };
              });
      }
      ```
    - Git log mặc định sắp xếp theo thời gian giảm dần → không cần sort thêm
    - _Requirements: 1.1, 2.1, 2.2, 2.3_

  - [x] 1.4 Implement `mapGitStatusChar()` và `mapGitStatusLabel()` — map git status characters
    - File: `src/services/utils/gitService.ts`
    - Tham khảo enum `GitStatus` đã có trong file (line 28): `INDEX_RENAMED=3, INDEX_COPIED=4, INDEX_ADDED=1, MODIFIED=5, DELETED=6, INDEX_DELETED=7`
    - Implement 2 private methods:
      ```typescript
      private mapGitStatusChar(statusChar: string): number {
          const map: Record<string, number> = {
              'A': GitStatus.INDEX_ADDED,
              'M': GitStatus.MODIFIED,
              'D': GitStatus.INDEX_DELETED,
              'R': GitStatus.INDEX_RENAMED,
              'C': GitStatus.INDEX_COPIED,
          };
          return map[statusChar] ?? GitStatus.MODIFIED;
      }

      private mapGitStatusLabel(statusChar: string): string {
          const map: Record<string, string> = {
              'A': 'Added', 'M': 'Modified', 'D': 'Deleted',
              'R': 'Renamed', 'C': 'Copied',
          };
          return map[statusChar] ?? 'Modified';
      }
      ```
    - _Requirements: 1.5_

  - [x] 1.5 Implement `getMergedBranchDiff()` — trích xuất diff từ merge commit
    - File: `src/services/utils/gitService.ts`
    - Thêm import `import * as path from 'path';` nếu chưa có
    - Implement public method:
      ```typescript
      public async getMergedBranchDiff(mergeCommitSha: string): Promise<{ changes: UnifiedDiffFile[]; diff: string }> {
          const repository = this.getRepository();
          const workspaceRoot = repository.rootUri.fsPath;
          
          // Bước 1: Lấy danh sách file thay đổi
          const nameStatusOutput = await this.execGitCommand([
              'diff', '--name-status', `${mergeCommitSha}^1..${mergeCommitSha}`
          ]);
          if (!nameStatusOutput.trim()) return { changes: [], diff: '' };
          
          const fileEntries = nameStatusOutput.trim().split('\n')
              .filter(line => line.trim())
              .map(line => {
                  const parts = line.split('\t');
                  const status = parts[0].charAt(0);
                  // Handle rename: R100\told-path\tnew-path
                  const filePath = parts[parts.length - 1];
                  const originalPath = parts.length > 2 ? parts[1] : undefined;
                  return { status, filePath, originalPath };
              });
          
          // Bước 2: Lấy diff cho từng file
          const changes: UnifiedDiffFile[] = [];
          for (const entry of fileEntries) {
              const fullPath = path.join(workspaceRoot, entry.filePath);
              let diff: string;
              let isBinary = false;
              try {
                  const fileDiff = await this.execGitCommand([
                      'diff', `${mergeCommitSha}^1..${mergeCommitSha}`, '--', entry.filePath
                  ]);
                  const sanitized = this.sanitizeDiffContent(fileDiff);
                  isBinary = await this.isBinaryFile(sanitized, fullPath);
                  diff = isBinary ? 'Binary file' : sanitized;
              } catch (error) {
                  diff = `Error getting diff: ${error}`;
              }
              changes.push({
                  filePath: fullPath,
                  relativePath: entry.filePath,
                  diff,
                  status: this.mapGitStatusChar(entry.status),
                  statusLabel: this.mapGitStatusLabel(entry.status),
                  isDeleted: entry.status === 'D',
                  isBinary,
                  originalFilePath: entry.originalPath ? path.join(workspaceRoot, entry.originalPath) : undefined,
              });
          }
          
          // Bước 3: Render diff string (tái sử dụng method hiện có line 599)
          const diff = this.renderBranchDiffFiles(changes);
          return { changes, diff };
      }
      ```
    - Tái sử dụng: `sanitizeDiffContent()` (line 728), `isBinaryFile()` (line 179), `renderBranchDiffFiles()` (line 599)
    - _Requirements: 1.2, 1.5_


- [x] 2. Checkpoint — Kiểm tra Git methods
  - Chạy `npm run compile` để đảm bảo tất cả methods mới trong GitService compile thành công
  - Kiểm tra không có lỗi TypeScript
  - Hỏi người dùng nếu có thắc mắc trước khi tiếp tục

- [x] 3. Implement ReviewMergedBranchService
  - [x] 3.1 Tạo `src/commands/reviewMergedBranch/reviewMergedBranchService.ts`
    - Tham khảo: `src/commands/reviewMerge/reviewMergeService.ts` (copy flow từ `generateReview()` method, line 54-240)
    - Imports cần thiết:
      ```typescript
      import { LLMProvider } from '../../llm-adapter';
      import { SYSTEM_PROMPT_GENERATE_REVIEW_MERGE } from '../../prompts/systemPromptGenerateReviewMerge';
      import { ContextStrategy, LLMService } from '../../services/llm';
      import { ContextBudgetManager, DEFAULT_BUDGET_CONFIG } from '../../services/llm/orchestrator/ContextBudgetManager';
      import { DependencyGraphIndex, DEFAULT_GRAPH_CONFIG } from '../../services/llm/orchestrator/DependencyGraphIndex';
      import { SharedContextStoreImpl } from '../../services/llm/orchestrator/SharedContextStore';
      import { AgentPromptBuilder } from '../../services/llm/orchestrator/AgentPromptBuilder';
      import { TokenEstimatorService } from '../../services/llm/TokenEstimatorService';
      import { AgentPrompt, AgentPromptBuildContext, CodeReviewerOutput, FlowDiagramOutput, ObserverOutput, StructuredAgentReport } from '../../services/llm/orchestrator/orchestratorTypes';
      import { LlmRequestLogEntry } from '../../services/llm/contextTypes';
      import { GitService } from '../../services/utils/gitService';
      import { ReviewWorkflowServiceBase } from '../reviewShared/reviewWorkflowServiceBase';
      ```
    - Tạo class `ReviewMergedBranchService extends ReviewWorkflowServiceBase`
    - Constructor: `constructor(gitService: GitService, llmService: LLMService) { super(gitService, llmService); }`
    - Implement `generateReview()` — flow 12 bước (copy từ ReviewMergeService.generateReview và thay đổi):
      1. `this.withAbortController(async (abortController) => { ... })`
      2. `this.prepareAdapter(provider, model, language, strategy, apiKey, baseURL, contextWindow, maxOutputTokens)`
      3. `this.gitService.getMergedBranchDiff(mergeCommitSha)` ← thay vì `getBranchDiffPreview(base, compare)`
      4. Load custom prompts: `getCustomReviewMergeSystemPrompt()`, `getCustomReviewMergeAgentPrompt()`, `getCustomReviewMergeRules()`
      5. `SYSTEM_PROMPT_GENERATE_REVIEW_MERGE(language, customSystemPrompt, customRules, customAgentInstructions)`
      6. Init: `new SharedContextStoreImpl()`, `new TokenEstimatorService()`, `new ContextBudgetManager(DEFAULT_BUDGET_CONFIG, tokenEstimator)`, `new AgentPromptBuilder(budgetManager, tokenEstimator)`
      7. `new DependencyGraphIndex(DEFAULT_GRAPH_CONFIG, this.gitService, mergeCommitSha)` ← dùng mergeCommitSha thay vì compareBranch
      8. `budgetManager.allocateAgentBudgets(...)` → `budgetManager.enforceGlobalBudget(...)`
      9. `this.gitService.buildReviewReferenceContext(branchDiff.changes, {...})`
      10. Build `AgentPromptBuildContext` với `compareBranch: mergeCommitSha`
      11. `promptBuilder.buildCodeReviewerPrompt(buildContext, safeBudgets[0])`, `promptBuilder.buildFlowDiagramPrompt(buildContext, safeBudgets[1])`
      12. `this.contextOrchestrator.generateMultiAgentFinalText(adapter, agents, systemMessage, buildSynthesisPrompt, signal, request, phasedConfig)`
    - Implement private methods:
      ```typescript
      private buildMergedBranchReviewPrompt(mergeCommitSha: string, branchName: string, diff: string, taskInfo?: string): string {
          let prompt = `Review the following merged branch changes.\n\nMerge commit: ${mergeCommitSha}\nBranch: ${branchName}\n\n`;
          if (taskInfo) prompt += `Task context: ${taskInfo}\n\n`;
          prompt += `Diff:\n${diff}`;
          return prompt;
      }
      ```
    - Implement `repairPlantUml()` — delegate to `this.repairPlantUmlMarkdown(...)` (inherited from base)
    - Tái sử dụng `handleGenerationError()` pattern từ ReviewMergeService (line 564-576)
    - _Requirements: 1.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 5.1, 5.2, 5.4, 8.1, 8.2, 8.3, 8.4_

  - [x] 3.2 Write property test cho merge commit parsing (Property 1)
    - **Property 1: Merge commit parsing trích xuất đầy đủ thông tin**
    - Tạo file `src/test/reviewMergedBranch/mergeCommitResolver.test.ts`
    - Install fast-check: `npm install --save-dev fast-check`
    - Generator: random SHA (40 hex chars), random ISO date, random author name, random branch name
    - Construct git log line: `${sha}|${date}|${author}|Merge branch '${branchName}'`
    - Parse và verify: `result.mergeCommitSha === sha`, `result.mergeAuthor === author`, `result.branchName === branchName`
    - Chạy 100+ iterations
    - Tag: `// Feature: review-merged-branch-agent-plan, Property 1: Merge commit parsing trích xuất đầy đủ thông tin`
    - **Validates: Requirements 1.1**

  - [x] 3.3 Write property test cho diff parsing (Property 2)
    - **Property 2: Diff parsing tạo UnifiedDiffFile[] hợp lệ**
    - Tạo file `src/test/reviewMergedBranch/postMergeDiffProvider.test.ts`
    - Generator: random file paths, random status chars (A/M/D), random diff hunks
    - Verify: mỗi `UnifiedDiffFile` có `filePath !== ''`, `relativePath !== ''`, `diff !== ''`, `statusLabel !== ''`
    - Verify: diff rendered string không rỗng khi có ít nhất 1 file
    - Tag: `// Feature: review-merged-branch-agent-plan, Property 2: Diff parsing tạo UnifiedDiffFile[] hợp lệ`
    - **Validates: Requirements 1.2, 1.5**

- [x] 4. Implement Webview components
  - [x] 4.1 Tạo `src/commands/reviewMergedBranch/validation.ts`
    - Tham khảo: `src/commands/reviewMerge/validation.ts` (cùng pattern nhưng validate mergeCommitSha thay vì baseBranch/compareBranch)
    - Import `ReviewMergedBranchMessage` từ `./webviewMessageHandler`
    - Implement:
      ```typescript
      export function validateMergedBranchReviewInput(message: ReviewMergedBranchMessage): string | undefined {
          const { mergeCommitSha, provider, model, language, contextStrategy } = message;
          if (!mergeCommitSha || !provider || !model || !language || !contextStrategy) {
              return 'Please select all fields.';
          }
          return undefined;
      }
      ```
    - _Requirements: 6.4_

  - [x] 4.2 Tạo `src/commands/reviewMergedBranch/webviewContentGenerator.ts`
    - Tham khảo: `src/commands/reviewMerge/webviewContentGenerator.ts` (copy structure, thay đổi control panel)
    - Imports từ shared:
      ```typescript
      import { buildReviewShell, buildPanelSection } from '../reviewShared/webview/layout';
      import { buildSharedStyles } from '../reviewShared/webview/styles';
      import { buildModelOptionsHtml } from '../reviewShared/webview/options';
      import { buildSharedClientActions, buildTabbedResultMessageHandler, buildPlantUmlRepairMessageHandler } from '../reviewShared/webview/scriptFragments';
      import { MergedBranchInfo } from '../../services/utils/gitService';
      import { LLMProvider } from '../../llm-adapter';
      import { ReviewCustomModelSettings, ReviewCustomProviderConfig } from '../reviewShared/types';
      ```
    - Implement `generateMergedBranchWebviewContent()`:
      - Control panel: thay 2 dropdown branch → danh sách nhánh đã merge
      - Render mỗi nhánh như một row có thể click: `<div class="branch-item" data-sha="${info.mergeCommitSha}">`
      - Hiển thị: `branchName`, `mergeDate.toLocaleDateString()`, `mergeAuthor`
      - Search input: `<input type="text" id="branchSearch" placeholder="Tìm kiếm nhánh...">`
      - Client-side JS filter: lọc `.branch-item` theo `branchName` khi user gõ
      - Chỉ có nút "Generate Review" (không có "Generate Description", "Generate Both")
      - Empty state: `buildEmptyState({ title: 'Không có nhánh đã merge', description: '...' })`
      - Tái sử dụng `buildReviewShell()` cho layout tổng thể
      - Tái sử dụng `buildPanelSection()` cho từng section
      - Tái sử dụng `buildSharedStyles()` cho CSS
      - Tái sử dụng `buildModelOptionsHtml()` cho model selection dropdown
      - Tái sử dụng `buildTabbedResultMessageHandler()` cho tab Review/Diff switching
      - Tái sử dụng `buildPlantUmlRepairMessageHandler()` cho PlantUML auto-repair
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 4.6_

  - [x] 4.3 Tạo `src/commands/reviewMergedBranch/webviewMessageHandler.ts`
    - Tham khảo: `src/commands/reviewMerge/webviewMessageHandler.ts` (copy structure, simplify — chỉ có review, không có description)
    - Định nghĩa interface:
      ```typescript
      export interface ReviewMergedBranchMessage {
          command: 'reviewMergedBranch' | 'viewRawDiff' | 'cancel' | 'repairPlantUml';
          mergeCommitSha?: string;
          branchName?: string;
          provider?: LLMProvider;
          model?: string;
          apiKey?: string;
          baseURL?: string;
          taskInfo?: string;
          language?: string;
          contextStrategy?: ContextStrategy;
          contextWindow?: number;
          maxOutputTokens?: number;
          content?: string;
          errorMessage?: string;
          target?: 'review';
          attempt?: number;
      }
      ```
    - Implement class `WebviewMessageHandler`:
      - Constructor: `constructor(private panel: vscode.WebviewPanel, private service: ReviewMergedBranchService)`
      - `handleMessage(message)`: switch trên `message.command`
        - `'reviewMergedBranch'`: validate → `postProgress(panel, 'Generating review...')` → `service.generateReview(...)` → `postResult(panel, result)` hoặc `postError(panel, createReviewErrorPayload(error))`
        - `'cancel'`: `service.cancel()`
        - `'viewRawDiff'`: `openDiffDocument(panel, message)`
        - `'repairPlantUml'`: `service.repairPlantUml(...)` → `postPlantUmlRepairResult(panel, result)`
    - Imports từ shared:
      ```typescript
      import { postResult, postError, postProgress, postLog, postLlmLog, postPlantUmlRepairResult, openDiffDocument } from '../reviewShared/panelMessaging';
      import { createReviewErrorPayload } from '../reviewShared/errorReport';
      ```
    - _Requirements: 4.1, 4.4, 4.5, 4.6, 6.1, 6.2, 6.3, 6.4_

  - [x] 4.4 Tạo `src/commands/reviewMergedBranch/index.ts`
    - Tham khảo: `src/commands/reviewMerge/index.ts`
    - Content:
      ```typescript
      export { ReviewMergedBranchService } from './reviewMergedBranchService';
      export { generateMergedBranchWebviewContent } from './webviewContentGenerator';
      export { ReviewMergedBranchMessage, WebviewMessageHandler } from './webviewMessageHandler';
      ```
    - _Requirements: 7.1_

- [x] 5. Checkpoint — Kiểm tra Service và Webview components
  - Chạy `npm run compile` để đảm bảo tất cả files mới compile thành công
  - Kiểm tra không có circular imports
  - Hỏi người dùng nếu có thắc mắc trước khi tiếp tục

- [x] 6. Đăng ký Command và tích hợp menu
  - [x] 6.1 Tạo `src/commands/reviewMergedBranchCommand.ts`
    - Tham khảo: `src/commands/reviewMergeCommand.ts` (copy structure, thay đổi logic)
    - Imports:
      ```typescript
      import * as vscode from 'vscode';
      import { LLMService } from '../services/llm';
      import { GitService } from '../services/utils/gitService';
      import { generateMergedBranchWebviewContent } from './reviewMergedBranch/webviewContentGenerator';
      import { ModelProvider } from './reviewMerge/modelProvider';
      import { ReviewMergedBranchService } from './reviewMergedBranch/reviewMergedBranchService';
      import { WebviewMessageHandler } from './reviewMergedBranch/webviewMessageHandler';
      import { loadReviewPreferences } from './reviewShared/preferences';
      ```
    - Implement:
      ```typescript
      export function registerReviewMergedBranchCommand(
          context: vscode.ExtensionContext,
          gitService: GitService,
          llmService: LLMService
      ): vscode.Disposable {
          return vscode.commands.registerCommand('git-mew.review-merged-branch', async () => {
              try {
                  const currentBranch = await gitService.getCurrentBranch();
                  if (!currentBranch) {
                      vscode.window.showWarningMessage('Could not determine current branch.');
                      return;
                  }
                  const mergedBranches = await gitService.getMergedBranches(currentBranch, 50);
                  if (mergedBranches.length === 0) {
                      vscode.window.showWarningMessage('Không tìm thấy nhánh đã merge nào trong repository.');
                      return;
                  }
                  const { currentProvider, currentModel, savedLanguage } = loadReviewPreferences(llmService);
                  const { providers, availableModels, customModelSettings, customProviderConfig } = await ModelProvider.getAvailableModels(llmService);
                  const panel = vscode.window.createWebviewPanel(
                      'reviewMergedBranch', 'Review Merged Branch',
                      vscode.ViewColumn.One,
                      { enableScripts: true, retainContextWhenHidden: true }
                  );
                  panel.webview.html = generateMergedBranchWebviewContent(
                      mergedBranches, providers, availableModels,
                      currentProvider, currentModel, savedLanguage,
                      customModelSettings, customProviderConfig
                  );
                  const service = new ReviewMergedBranchService(gitService, llmService);
                  const messageHandler = new WebviewMessageHandler(panel, service);
                  panel.webview.onDidReceiveMessage(
                      async message => { await messageHandler.handleMessage(message); },
                      undefined, context.subscriptions
                  );
              } catch (error) {
                  vscode.window.showErrorMessage(`Error reviewing merged branch: ${error}`);
              }
          });
      }
      ```
    - _Requirements: 2.1, 2.5, 5.1, 5.3, 7.3_

  - [x] 6.2 Cập nhật `src/commands/index.ts` — đăng ký command mới
    - Thêm import: `import { registerReviewMergedBranchCommand } from './reviewMergedBranchCommand';`
    - Thêm vào mảng `commands` trong `registerAllCommands()`:
      ```typescript
      registerReviewMergedBranchCommand(context, gitService, llmService),
      ```
    - Đặt sau `registerReviewStagedChangesCommand(...)` để giữ thứ tự logic
    - _Requirements: 7.1_

  - [x] 6.3 Cập nhật `package.json` — thêm command và menu entry
    - Trong `contributes.commands` array, thêm sau entry `git-mew.review-staged-changes`:
      ```json
      {
          "command": "git-mew.review-merged-branch",
          "title": "git-mew: Review Merged Branch",
          "icon": "$(history)"
      }
      ```
    - Trong `contributes.menus.scm/title` array, thêm sau entry `git-mew.review-staged-changes`:
      ```json
      {
          "command": "git-mew.review-merged-branch",
          "when": "scmProvider == git",
          "group": "navigation"
      }
      ```
    - _Requirements: 7.1, 7.2, 7.4_

- [x] 7. Checkpoint — Kiểm tra tích hợp command
  - Chạy `npm run compile` để đảm bảo compile thành công
  - Verify: `package.json` có command `git-mew.review-merged-branch` trong `contributes.commands`
  - Verify: `package.json` có menu entry trong `contributes.menus.scm/title`
  - Verify: `src/commands/index.ts` import và đăng ký command mới
  - Hỏi người dùng nếu có thắc mắc

- [x] 8. Property-based tests cho danh sách nhánh
  - [x] 8.1 Write property test cho sort order (Property 3)
    - **Property 3: Danh sách nhánh đã merge được sắp xếp theo thời gian giảm dần**
    - Tạo file `src/test/reviewMergedBranch/branchListSorting.test.ts`
    - Install: `npm install --save-dev fast-check` (nếu chưa có)
    - Generator:
      ```typescript
      const mergedBranchInfoArb = fc.record({
          branchName: fc.string({ minLength: 1 }),
          mergeCommitSha: fc.hexaString({ minLength: 40, maxLength: 40 }),
          mergeDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2026-12-31') }),
          mergeAuthor: fc.string({ minLength: 1 }),
          mergeMessage: fc.string({ minLength: 1 }),
      });
      ```
    - Test: sort array by mergeDate descending, verify mọi cặp liên tiếp `list[i].mergeDate >= list[i+1].mergeDate`
    - Tag: `// Feature: review-merged-branch-agent-plan, Property 3`
    - **Validates: Requirements 2.1**

  - [x] 8.2 Write property test cho max items (Property 4)
    - **Property 4: Danh sách nhánh đã merge có tối đa 50 phần tử**
    - Thêm vào file `src/test/reviewMergedBranch/branchListSorting.test.ts`
    - Generator: `fc.array(mergedBranchInfoArb, { minLength: 0, maxLength: 200 })`
    - Test: apply limit function (slice 0..50), verify `result.length <= 50`
    - Tag: `// Feature: review-merged-branch-agent-plan, Property 4`
    - **Validates: Requirements 2.2**

  - [x] 8.3 Write property test cho search filter (Property 5)
    - **Property 5: Tìm kiếm nhánh lọc chính xác theo tên**
    - Tạo file `src/test/reviewMergedBranch/branchSearch.test.ts`
    - Generator: `fc.tuple(fc.array(mergedBranchInfoArb), fc.string())`
    - Test:
      ```typescript
      fc.assert(fc.property(
          fc.array(mergedBranchInfoArb), fc.string(),
          (branches, query) => {
              const filtered = branches.filter(b => b.branchName.toLowerCase().includes(query.toLowerCase()));
              // Soundness: mọi kết quả phải chứa query
              filtered.forEach(b => expect(b.branchName.toLowerCase()).toContain(query.toLowerCase()));
              // Completeness: không bỏ sót nhánh nào
              const expected = branches.filter(b => b.branchName.toLowerCase().includes(query.toLowerCase()));
              expect(filtered.length).toBe(expected.length);
          }
      ));
      ```
    - Tag: `// Feature: review-merged-branch-agent-plan, Property 5`
    - **Validates: Requirements 2.4**

- [x] 9. Property-based tests cho webview và prompt
  - [x] 9.1 Write property test cho HTML rendering (Property 6)
    - **Property 6: Rendered HTML chứa đầy đủ thông tin nhánh**
    - Tạo file `src/test/reviewMergedBranch/webviewContent.test.ts`
    - Generator: `mergedBranchInfoArb` (chỉ dùng branchName không chứa HTML special chars để tránh encoding issues)
      ```typescript
      const safeBranchInfoArb = fc.record({
          branchName: fc.stringOf(fc.char().filter(c => !'<>&"\''.includes(c)), { minLength: 1 }),
          mergeCommitSha: fc.hexaString({ minLength: 40, maxLength: 40 }),
          mergeDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2026-12-31') }),
          mergeAuthor: fc.stringOf(fc.char().filter(c => !'<>&"\''.includes(c)), { minLength: 1 }),
          mergeMessage: fc.string({ minLength: 1 }),
      });
      ```
    - Test: `generateMergedBranchWebviewContent([info])` → verify HTML contains `info.branchName`, date string, `info.mergeAuthor`
    - Tag: `// Feature: review-merged-branch-agent-plan, Property 6`
    - **Validates: Requirements 2.3**

  - [x] 9.2 Write property test cho custom prompt injection (Property 7)
    - **Property 7: Custom prompts được inject vào system message**
    - Tạo file `src/test/reviewMergedBranch/systemPromptBuilder.test.ts`
    - Import: `SYSTEM_PROMPT_GENERATE_REVIEW_MERGE` từ `src/prompts/systemPromptGenerateReviewMerge.ts`
    - Generator: 3 non-empty strings (systemPrompt, rules, agentInstructions)
      ```typescript
      fc.assert(fc.property(
          fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), fc.string({ minLength: 1 }),
          (customSystem, customRules, customAgent) => {
              const result = SYSTEM_PROMPT_GENERATE_REVIEW_MERGE('English', customSystem, customRules, customAgent);
              expect(result).toContain(customSystem);
              expect(result).toContain(customRules);
              expect(result).toContain(customAgent);
          }
      ));
      ```
    - Tag: `// Feature: review-merged-branch-agent-plan, Property 7`
    - **Validates: Requirements 8.4**

- [x] 10. Unit tests cho validation và edge cases
  - Tạo file `src/test/reviewMergedBranch/validation.test.ts`
  - Test cases:
    - Input thiếu `mergeCommitSha` → trả về `'Please select all fields.'`
    - Input thiếu `provider` → trả về `'Please select all fields.'`
    - Input thiếu `model` → trả về `'Please select all fields.'`
    - Input thiếu `language` → trả về `'Please select all fields.'`
    - Input thiếu `contextStrategy` → trả về `'Please select all fields.'`
    - Input hợp lệ (tất cả fields có giá trị) → trả về `undefined`
  - Test edge cases cho `parseBranchNameFromMergeMessage()`:
    - `"Merge branch 'feature/auth'"` → `"feature/auth"`
    - `"Merge branch 'fix/bug' into main"` → `"fix/bug"`
    - `"Merge pull request #42 from user/feature"` → `"user/feature"`
    - `"Merge remote-tracking branch 'origin/dev'"` → `"origin/dev"`
    - `"Some random commit message"` → `"Some random commit message"` (fallback)
  - _Requirements: 1.4, 2.5, 6.4_

- [x] 11. Checkpoint cuối — Đảm bảo tất cả compile và tests pass
  - Chạy `npm run compile` — không có lỗi TypeScript
  - Chạy `npm test` — tất cả tests pass (nếu có test runner configured)
  - Verify cấu trúc thư mục mới:
    ```
    src/commands/reviewMergedBranch/
    ├── index.ts
    ├── reviewMergedBranchService.ts
    ├── webviewContentGenerator.ts
    ├── webviewMessageHandler.ts
    └── validation.ts
    src/commands/reviewMergedBranchCommand.ts
    ```
  - Verify package.json có command và menu entry mới
  - Hỏi người dùng nếu có thắc mắc

## Ghi chú

- Các task đánh dấu `*` là optional (property tests + unit tests) — có thể bỏ qua để triển khai MVP nhanh hơn
- Mỗi task tham chiếu đến requirements cụ thể để đảm bảo truy vết
- Checkpoints (task 2, 5, 7, 11) đảm bảo kiểm tra tăng dần sau mỗi giai đoạn
- Task 3.1 là task lớn nhất — nên tham khảo `ReviewMergeService.generateReview()` (line 54-240) và copy/modify
- Ngôn ngữ triển khai: TypeScript
- Test framework: mocha (đã có trong devDependencies) + fast-check (cần install)
