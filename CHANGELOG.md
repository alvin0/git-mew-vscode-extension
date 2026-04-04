# Change Log

## [0.5.5] - 2026-04-05

### Fixed
- **UI Graph**: Fixed UI graph rendering issues and improved visual consistency
- **Merge Conflict Handling**: Improved merge conflict detection and resolution workflow in the sidebar

### Changed
- **UI Updates**: Enhanced UI components for better user experience

## [0.5.4] - 2026-04-04

### Added
- **Review Selected Commits**: Select commits on the graph and click "Review" to generate an AI-powered code review from the combined diff of the selected range. Supports single or multiple contiguous commits, including pushed and root commits.
- **Review History**: Reviews are now auto-saved to `~/.gitmew/.histories/<workspace>/` as Markdown files. A new "Histories" sidebar view lets you preview, open in editor, or delete past reviews.
- **Security Analyst Agent**: A new dedicated agent performs OWASP-aligned taint analysis, CWE-tagged vulnerability detection, and auth-flow inspection during reviews.
- **Review Memory**: Cross-session memory tracks recurring patterns, suppressed findings, and resolution history. Repeated low-value findings are automatically de-prioritized. Clear memory via `Git Mew: Clear Review Memory`.
- **Synthesis Merger**: A new post-pipeline stage deduplicates overlapping findings across agents, merges structured outputs, and produces a cleaner final review.
- **Risk Hypothesis Verification**: Observer agent now uses tool calls (`find_references`, `get_symbol_definition`) to verify integration risks before reporting them, reducing false positives.

### Changed
- **Observer Agent**: Removed the 4-item TODO limit — the agent now produces a comprehensive, unbounded todo list with rationale, expected outcome, and priority per item.
- **Structured Output Enrichment**: Code Reviewer issues and Observer risks now include a `confidence` score. Observer risks also carry `likelihood`, `impact`, and `mitigation` fields.
- **Review Output Contract**: Updated the review prompt contract to incorporate security analysis sections and richer structured metadata.
- **Agent Prompt Builder**: Expanded with Security Analyst prompt construction, synthesis context injection, and suppressed-finding awareness.
- **Budget Manager**: Added helper methods for computing max symbols, max reference files, and reference context budget from the context window.

### Fixed
- **Root Commit Diff**: `getCommitRangeDiff` now handles the initial commit (no parent) by diffing against the empty tree hash instead of crashing on `SHA^`.

## [0.5.3] - 2026-04-03

### Added
- **Sentry Error Tracking**: Integrated `@sentry/node` for automatic error reporting with severity classification (crash / operational / cosmetic) and sensitive-data scrubbing via `beforeSend`.
- **Send Feedback Command**: New `git-mew: Send Feedback` command with a dedicated webview form (category chips, message, optional name/email) that sends user feedback directly to Sentry.
- **Settings Sidebar Entry**: "Send Feedback" item added to the Settings sidebar view for quick access.

### Changed
- **Graph View Default Visibility**: Graph sidebar tab now defaults to `collapsed` to reduce initial visual clutter.
- **Graph Empty-State Messages**: Commit graph shows contextual messages for different states — "Git not available", "No repository found", "No commits yet", "Could not load commits" — instead of a generic "No commits".
- **Graph First-Load Reset**: First `update-graph` message now resets stale dialog/banner state (squash, edit-message, undo banners) before rendering, preventing leftover UI from previous sessions.
- **Graph Error Resilience**: `refreshGraph` now sends an explicit empty-state payload on exceptions instead of silently swallowing errors.
- **Review Error Reporting**: `createReviewErrorPayload` now classifies errors by severity and automatically reports non-validation, non-cancelled errors to Sentry.

### Fixed
- **Null HEAD Guard**: `refreshGraph` no longer crashes when `repo.state.HEAD` is `null` (e.g. freshly initialized repo with no commits).

## [0.5.2] - 2026-04-03

### Added
- **Global Config Management**: New command to manage Git Mew configuration at the user level (~/.gitmew)
- **Configuration File Organization**: Restructured configuration files into organized subdirectories (commit, review, description) for better management
- **Enhanced Sidebar**: Added new sidebar views for Graph, Code Review, Settings, and Global Config

### Changed
- **Template File Structure**: Configuration template files are now organized into subdirectories by function
- **Custom Provider Support**: Improved support for OpenAI-compatible providers

### Improved
- **User Experience**: Sidebar interface enhanced with additional views for better workflow integration
- **Configuration Management**: Easier management of both global and project-level configurations

## [0.5.1] - 2026-04-02

### Added
- **Sync Changes Button**: A prominent sync button appears in the commit area when the branch is behind remote, blocking commit until synced.
- **File Icons**: File list now shows icons from the active VS Code file icon theme (SVG/PNG-based themes like Material Icon Theme).
- **Edit Commit Message**: Select a single commit in the graph to edit its message inline with AI generation support and undo.
- **Sidebar Badge**: Activity Bar icon now shows the total number of changed files (staged + unstaged).

### Changed
- **Commit Input**: Textarea starts as a single row and expands as you type.
- **Folder Chevron**: Updated to `›` arrow style with rotation animation, consistent across all sections.
- **File List Spacing**: Increased padding on file and folder rows for better readability.
- **Graph Toolbar**: Selecting 1 commit shows "Edit Message" only; selecting 2+ shows "Squash" only.
- **Squash & Edit Safety**: Both operations now block if staged changes are present to prevent unintentional file inclusion.

### Fixed
- **Graph Re-render**: Graph no longer re-renders while checkboxes are selected or a dialog is open, preventing state loss on first interaction.
- **Undo Edit Message**: Fixed undo restoring to a new commit instead of the original.

## [0.5.0] - 2026-04-02

Git Mew now lives in the Activity Bar. Stage, commit, review, and push — all from one sidebar.

### Added
- **Sidebar**: New Activity Bar panel with full source control — stage, unstage, commit, push, discard, and view diffs without switching views.
- **Commit Graph**: Visual commit history with branch lines, sync status, and merge detection.
- **Squash Commits**: Select and squash local commits with undo support and AI-generated messages.
- **Review Panel**: New `git-mew: Show Review Panel` command for quick access to all review workflows.
- **File Tree**: Staged and unstaged files shown in folder tree with per-folder actions.
- **Push & Conflict Banners**: See unpushed commits and merge conflicts at a glance.

### Changed
- Lowered minimum VS Code version to `1.75.1` for broader compatibility.
- Extension now waits for the Git API before activating, with error notification on failure.
- Updated extension icon and added sidebar logo variants.

## [0.4.0] - 2026-04-01

This release focuses on a new review workflow for code that has already been merged. The headline feature is **Review Merged Branch**, along with deeper review output, safer branch browsing on large repositories, and several reliability fixes across the merged-branch experience.

### Added
- **Review Merged Branch**: Added a new `git-mew: Review Merged Branch` command to review code that has already been merged into the current branch by selecting a historical merge commit.
- **Merged Branch Review Workspace**: Added a dedicated UI for browsing merged branches, selecting a branch, and generating AI review output directly from the merge commit diff.
- **Commit Message Context Tool**: Merged-branch review agents can now read commit messages from the merged branch range to better understand implementation intent, not just the final patch.
- **Detail Change Section**: Review outputs now include a dedicated `Detail Change` section for longer, more complete explanations of logic flow, code behavior, and implementation details.

### Changed
- **Review + Diff Tabs**: Review Merged Branch now renders separate `Review` and `Diff` tabs so users can inspect AI feedback and the exact merge patch side by side.
- **Top-20 Recent Branches by Default**: The merged-branch list now shows only the 20 most recent results initially and keeps the list scrollable to reduce webview load.
- **Server-Side Branch Search**: Older merged branches are now discovered through search instead of rendering large branch histories in the UI.
- **Newest-First Ordering**: Merged branch discovery and search results are consistently sorted by merge time descending so the latest merged work always appears first.
- **Dedicated Detail Change Agent**: Long-form change explanation is now handled by a separate agent to preserve context quality and reduce pressure on the main review summary.
- **Additive Prompt Customization**: Custom review prompts and rules are now injected additively across review agents, preserving the default review contract while still allowing project-specific guidance.

### Fixed
- **Final Result Rendering**: Fixed merged-branch webview result handling so completed reviews display correctly in the final output panel.
- **PlantUML Repair Flow**: Corrected merged-branch validation so `Fix with AI` works properly for PlantUML repair requests.
- **Search Selection State**: Fixed stale branch-selection behavior during search so users cannot generate a review from an outdated selection.

### Improved
- **Structured Error Handling**: Merged branch review now benefits from the same structured error-reporting patterns used across the newer review workspaces.
- **Regression Coverage**: Added test coverage for merged-branch parsing, list sorting, search behavior, prompt generation, validation, and webview rendering.

## [0.3.1] - 2026-03-25

### Added
- **Structured Review Error Reports**: Review Staged Changes and Review Merge now render a clear in-panel failure report with operation, provider, model, branch, command, timestamp, and raw error details.
- **Copy Error Report Action**: Added a dedicated action to copy the full error report so users can send reproducible diagnostics to maintainers more easily.

### Changed
- **Review Failure Handling**: Validation errors, generation failures, and PlantUML repair failures now use the same structured error payload instead of a single generic error string.

## [0.3.0] - 2026-03-13

### Added
- **Adaptive Context Window Calibration**: Extension now automatically learns the real context window limits from API error responses (e.g., "exceeds limit of X") and persists them to settings.
- **Persistent Calibration Cache**: Learned token limits are cached per-session and synchronized back to the UI "Context window" field automatically.
- **Enhanced API Error Logging**: Failed API calls now include the full response body in the execution logs for faster debugging.

### Changed
- **Architectural Refactoring**: High-traffic `ContextOrchestratorService` has been split into specialized sub-modules (`DiffChunkBuilder`, `ChunkAnalysisReducer`, `AdapterCalibrationService`, `MultiAgentExecutor`) for better maintainability.
- **Corrected Token Budget Logic**: Fixed the input budget formula to treat input and output budgets independently, preventing unnecessary prompt truncation on large-context models.
- **Dynamic Safety Margins**: Prompt truncation now uses context-aware safety margins (2k to 8k tokens) to ensure stable API requests.
- **Optimized Review Summary Contract**: Reduced the suggested number of files in the review summary from 10-15 to 3-5 to keep the context window focused on the most critical changes.

### Improved
- **Self-Audit Efficiency**: Optimized the agent self-audit pass to only include previous analysis text instead of re-submitting the original diff. This drastically reduces token usage and prevents truncation issues on complex tasks.
- **Gemini API Compatibility**: Implemented automatic stripping of `additionalProperties` from tool schemas to resolve "Invalid JSON payload" errors (also applied to OpenAI adapter for custom proxy compatibility).
- **Token Estimation Accuracy**: Refined estimation to 4 characters per token to better match real-world tokenizer behavior for mixed code/prose content.

## [0.2.1] - 2026-03-11

### Added
- **1-hop Context Expansion for Reviews**: Review Staged Changes and Review Merge can now auto-expand context from symbols found in changed diff lines by resolving related definitions via `vscode.executeDefinitionProvider`.
- **Reference Context Metadata Logging**: Added compact execution-log metadata for reference expansion (`symbols/files/tokens/trigger/truncated`) to make context usage transparent during review runs.
- **Shared Symbol Resolver Utility**: Introduced reusable symbol-match and definition-resolution helpers for review context expansion and tool reuse.

### Changed
- **Reference Context API Contract**: `buildReviewReferenceContext(...)` now accepts expansion options (`strategy/model/contextWindow/mode/systemMessage/directPrompt`) and returns `{ context, metadata }`.
- **Auto Expansion Policy**: In `auto` mode, expansion now triggers when effective strategy is hierarchical, changed file count is at least 3, or base prompt size exceeds 70% of direct input budget.
- **Expansion Budget Guardrail**: Added hard cap for expanded reference context tokens: `min(4500, floor(contextWindow * 0.25))`.

### Improved
- **Review Detail Quality**: Review prompts now include richer supporting snippets from related symbol definitions (non-recursive 1-hop), improving flow/risk analysis without changing orchestrator strategy behavior.
- **Test Coverage**: Added helper-level tests for symbol extraction limits, auto-trigger decisions, and expansion token-cap behavior.

## [0.2.0] - 2026-03-11

### Added
- **PlantUML Review Output**: Review Merge and Review Staged Changes can now generate PlantUML flow diagrams, render them directly in the result view, and open diagrams in a larger modal viewer.
- **PlantUML Repair Flow**: Added a "Fix with AI" action that retries invalid PlantUML blocks using a dedicated repair prompt and server error hints when available.
- **Review Agent Customization**: Added publishable `.gitmew/agent-rule.review-merge.md` template to customize review agents such as flow-diagram, observer, and domain-specific checks.
- **Related Reference Context**: Review workflows can now inspect a limited set of related read-only files outside the diff to improve runtime-flow reconstruction and hidden-risk detection.
- **Shared Review Infrastructure**: Introduced shared review modules for adapter setup, preferences, panel messaging, validation, and reusable webview fragments/layout primitives.

### Changed
- **Review Output Contract**: Review prompts now require structured sections for Flow Diagram, Observer TODO List, and Potential Hidden Risks in addition to the existing review summary.
- **Review UI Redesign**: Rebuilt Review Merge and Review Staged Changes into a two-panel dashboard with collapsible setup panel, advanced settings, persistent status card, and explicit execution-log drawer.
- **Markdown Viewer**: Updated the markdown viewer to match the new review workspace styling and support embedded PlantUML rendering.
- **Path Normalization**: Review results now normalize absolute workspace paths into repository-relative paths for cleaner output.

### Improved
- **Maintainability**: Refactored merge-review and staged-review flows around shared services and narrower validation/message-handler responsibilities.
- **Custom Provider UX**: Review screens now support inline custom-provider API key and base URL entry without leaving the panel.
- **Model Defaults**: Updated bundled model metadata and defaults, including newer Claude and OpenAI identifiers used by the extension.

## [0.1.0] - 2026-03-10

### Added
- **Hierarchical Context Pipeline**: Large diffs are now split into chunks and reduced before final commit/review generation to avoid context overflow
- **Live Review Logs**: Review Merge and Review Staged Changes now show execution logs and API responses while the workflow is running
- **Custom Provider Support**: Added a `custom` OpenAI-compatible provider with configurable base URL
- **Custom Model Configuration**: All providers now allow manual model name input, with configurable context window and max output tokens for custom models

### Improved
- **Large Diff Handling**: Commit generation now uses a faster hierarchical profile for big staged changes
- **Token Budgeting**: Context estimation now uses tokenizer-backed counting with safer budgeting behavior
- **Provider Management**: API key management now includes the custom provider and its endpoint configuration

## [0.0.7] - 2025-10-08

### Added
- **Review Staged Changes Command**: New `git-mew: Review Staged Changes` command to review staged files before committing

### Improved
- **Ollama Support**: Fixed API key requirement for Ollama - no longer requires API key configuration


## [0.0.6] - 2025-10-06

### Fixed
- **File Path References**: Updated `publishCommand.ts` to reference the new `publish-files` location

## [0.0.5] - 2025-10-06

### Improved
- Fix bug and improve

## [0.0.4] - 2025-10-05

### Added
- **Publish Command**: New `git-mew: Publish Files` command to easily copy template files to `.gitmew/` folder
- **MR Description Generation**: Generate professional merge request descriptions alongside code reviews
- **Smart Template Selection**: Automatic routing between default, release, and hotfix templates based on branch names and context
- **Description System Prompt**: New customizable template file `system-prompt.description-merge.md`
- **Task Context Support**: Optional task/issue context field in webview for better AI understanding
- **Auto-Reload Prompt**: Extension now prompts users to reload window after updates
- **Enhanced Webview UI**: Added "Generate Description" button alongside "Generate Review"

### Improved
- **Error Handling**: Better API key management with inline prompts during workflow
- **Configuration Management**: Separate settings for review/description independent from commit generation
- **User Experience**: More intuitive webview interface with clearer action buttons
- **Documentation**: Updated README with MR description feature and publish command usage


## [0.0.3] - 2025-10-05

### Fixed
- Fix bug and improve

## [0.0.2] - 2025-10-05

### Added
- Add feature review merge request

### Fixed
- Fix bug and improve

## [0.0.1] - 2025-10-04

### Added
- Initial release of Git Mew
- AI-powered commit message generation from staged Git changes
- Support for multiple LLM providers:
  - OpenAI (GPT-4, GPT-3.5 Turbo)
  - Anthropic Claude (Claude 3 Opus, Sonnet, Haiku)
  - Google Gemini (Gemini Pro)
- Source Control panel integration with sparkle icon button
- Setup wizard for configuring AI provider and model
- Secure API key storage using VS Code's secret storage
- Conventional commit message format support
- Configuration settings for provider and model selection
- File type detection for better context analysis
