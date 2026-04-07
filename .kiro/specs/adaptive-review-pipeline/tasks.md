# Implementation Plan: Adaptive Review Pipeline

## Overview

Migration pipeline review đa agent qua 3 phase độc lập. Mỗi phase ship riêng qua feature flag `gitmew.useAdaptivePipeline`. Phase 1 loại bỏ Phase 3 synthesis agents, promote deterministic rendering. Phase 2 thêm Context Gatherer heuristic + adaptive budgeting. Phase 3 nâng cấp Session Memory với Finding lifecycle + conditional Section Writers.

Ngôn ngữ implementation: TypeScript (codebase hiện tại).

## Tasks

### Phase 1: Deterministic Renderer + Hybrid Assembly (Immediate, Highest ROI)

- [x] 1. Test Infrastructure (phải hoàn thành trước khi viết bất kỳ test nào)
  - [x] 1.1 Tạo fixture factories cho findings/hypotheses/execution plans
    - Tạo `src/test/fixtures/adaptivePipelineFixtures.ts`
    - Factory functions: `createMockFinding()`, `createMockHypothesis()`, `createMockExecutionPlan()`, `createMockEvidenceRef()`
    - Mỗi factory nhận partial overrides, trả về object đầy đủ với defaults hợp lý
    - _Requirements: 11.1, 11.2, 11.3, 11.6_

  - [x] 1.2 Tạo diff fixtures cho các loại patch
    - Tạo `src/test/fixtures/diffFixtures.ts`
    - Fixtures: `smallPatchFixture` (<10 files, <3000 tokens), `mediumPatchFixture` (10-30 files), `largePatchFixture` (>30 files), `securityPatchFixture` (auth/crypto files), `refactorPatchFixture` (rename/move heavy)
    - Mỗi fixture gồm `UnifiedDiffFile[]` + `diffText` string
    - _Requirements: 11.1, 11.4_

  - [x] 1.3 Tạo mock LLM adapter helpers
    - Tạo `src/test/helpers/mockLLMAdapter.ts`
    - `createMockAdapter(overrides?)`: trả về mock `ILLMAdapter` với `generateText` trả response cấu hình được
    - `createFailingAdapter(error)`: trả về adapter luôn throw
    - `createTimeoutAdapter(ms)`: trả về adapter timeout sau ms
    - _Requirements: 11.4, 11.5_

  - [x] 1.4 Tạo markdown snapshot helpers
    - Tạo `src/test/helpers/markdownSnapshotHelper.ts`
    - `assertMarkdownSnapshot(actual, snapshotPath)`: so sánh byte-for-byte, tự tạo snapshot nếu chưa có
    - `updateSnapshot(snapshotPath, content)`: cập nhật snapshot file
    - _Requirements: 11.2_

  - [x] 1.5 Tạo telemetry assertion helpers
    - Tạo `src/test/helpers/telemetryTestSink.ts`
    - `TelemetryTestSink` class: capture telemetry events, assert event names/payloads
    - `assertEventEmitted(sink, eventName, payloadMatcher?)`: kiểm tra event đã emit
    - _Requirements: 9.1–9.8_

- [x] 2. Telemetry Infrastructure
  - [x] 2.1 Định nghĩa telemetry event names và payload schemas
    - Tạo `src/services/llm/orchestrator/telemetryTypes.ts`
    - Define `TruncationTelemetry`, `PipelineTelemetry` interfaces (từ design)
    - Define enum `PipelineTelemetryEvent` với các event names: `PIPELINE_START`, `CONTEXT_GATHERER_COMPLETE`, `AGENT_COMPLETE`, `TRUNCATION`, `SECTION_WRITER_FALLBACK`, `ASSEMBLY_COMPLETE`, `PIPELINE_COMPLETE`
    - _Requirements: 9.1–9.8_

  - [x] 2.2 Tạo telemetry wrapper abstraction
    - Tạo `src/services/llm/orchestrator/PipelineTelemetryEmitter.ts`
    - Define `IPipelineTelemetryEmitter` interface với methods: `emitPipelineStart()`, `emitAgentComplete()`, `emitTruncation()`, `emitSectionWriterFallback()`, `emitAssemblyComplete()`, `emitPipelineComplete()`
    - Class `PipelineTelemetryEmitter` implements `IPipelineTelemetryEmitter`, wraps `onLog` callback + PostHog `trackEvent`
    - _Requirements: 9.1–9.8_

  - [x] 2.3 Thêm debug/normal mode routing
    - Trong `PipelineTelemetryEmitter`: method `emitExecutionPlan(plan, debugMode)` — log summary ở normal, full plan ở debug
    - Debug mode đọc từ VS Code config `gitmew.debugTelemetry` (boolean, default false)
    - _Requirements: 9.2_

  - [x] 2.4 Thêm test sink cho telemetry assertions
    - Extend `TelemetryTestSink` (từ 1.5) để implement `IPipelineTelemetryEmitter` interface cho testing
    - TelemetryTestSink captures events theo cùng contract, cho phép assert trong tests
    - _Requirements: 9.1–9.8_

- [x] 3. Feature flag và shared helper
  - [x] 3.1 Thêm feature flag `gitmew.useAdaptivePipeline` vào `package.json`
    - Thêm boolean configuration property với default `false` vào `contributes.configuration.properties`
    - Description: "Enable adaptive review pipeline (removes Phase 3 synthesis agents, uses deterministic rendering)"
    - _Requirements: 6.1, 6.6_

  - [x] 3.2 Định nghĩa shared helper `shouldUseAdaptivePipeline()`
    - Tạo `src/services/llm/orchestrator/adaptivePipelineFlag.ts`
    - Export function `shouldUseAdaptivePipeline(): boolean` — đọc `vscode.workspace.getConfiguration('gitmew').get('useAdaptivePipeline', false)`
    - Export function `isDebugTelemetryEnabled(): boolean` — đọc `gitmew.debugTelemetry`
    - _Requirements: 6.1, 6.6_


- [x] 4. Core domain types (phải hoàn thành trước mọi implementation)
  - [x] 4.1 Định nghĩa ExecutionPlan domain types
    - Tạo `src/services/llm/orchestrator/executionPlanTypes.ts`
    - Define `ExecutionPlan`, `PatchIntent` (`'feature' | 'refactor' | 'bugfix' | 'mixed'`), `RiskFlags` interface
    - _Requirements: 3.3_

  - [x] 4.2 Định nghĩa Finding/Hypothesis domain types
    - Trong cùng file `executionPlanTypes.ts`
    - Define `Finding`, `Evidence_Ref`, `Hypothesis` interfaces theo design schema
    - Define `FindingStatus`, `HypothesisStatus` type aliases
    - Define `FindingFilter`, `HypothesisFilter` interfaces
    - _Requirements: 4.1, 4.5, 4.11_

  - [x] 4.3 Định nghĩa lifecycle/transition matrix
    - Trong cùng file `executionPlanTypes.ts`
    - Define `ActorRole` type
    - Define `ALLOWED_TRANSITIONS` constant (transition matrix từ design) — áp dụng cho cả Finding và Hypothesis
    - Define custom errors: `InvalidTransitionError`, `DuplicateFindingError`, `FindingNotFoundError`
    - Hypothesis reuse cùng error types: `InvalidTransitionError` cho invalid transitions, `FindingNotFoundError` (generic, dùng cho cả hypothesis lookup failures), `DuplicateFindingError` (generic, dùng cho cả duplicate hypothesis IDs)
    - _Requirements: 4.9_

  - [x] 4.4 Định nghĩa telemetry payload types
    - Trong `telemetryTypes.ts` (đã tạo ở 2.1) — verify `TruncationTelemetry` và `PipelineTelemetry` đã đầy đủ
    - Nếu chưa có, thêm vào `executionPlanTypes.ts` và re-export
    - _Requirements: 9.1–9.8_

  - [x] 4.5 Barrel export và import migration fixups
    - Tạo barrel export trong `executionPlanTypes.ts` cho tất cả types
    - Update `orchestratorTypes.ts`: re-export `Finding`, `Evidence_Ref`, `Hypothesis` từ `executionPlanTypes.ts`
    - Đảm bảo không break existing imports
    - _Requirements: 4.1, 4.5, 4.11_

  - [x] 4.6 Write type-level validation tests cho ExecutionPlan
    - Test: verify ExecutionPlan type constraints compile correctly (patchIntent enum, riskFlags booleans, agentBudgets Record)
    - Test: verify `ALLOWED_TRANSITIONS` matrix covers all ActorRole × FindingStatus combinations
    - Test: verify custom errors (`InvalidTransitionError`, `DuplicateFindingError`, `FindingNotFoundError`) instantiate correctly
    - Note: Property 8 (ExecutionPlan schema compliance from ContextGatherer) sẽ được test ở Phase 2 task 15.11 khi ContextGatherer tồn tại
    - _Requirements: 3.3, 4.9_

- [x] 5. Checkpoint — Ensure types compile, ask the user if questions arise.

- [x] 6. Extract SuppressionFilter as dedicated step
  - [x] 6.1 Định nghĩa SuppressionFilterInput/Output contracts
    - Tạo `src/services/llm/orchestrator/SuppressionFilter.ts`
    - Define `SuppressionFilterInput` (findings + suppression rules) và `SuppressionResult` (suppressedCount, suppressedFindingIds)
    - _Requirements: 7.5_

  - [x] 6.2 Extract pure matching helpers
    - Trong `SuppressionFilter.ts`: extract `isSuppressed`, `normalize`, `sha256`, `globMatch`, `globToRegExp`, `wordOverlapRatio` từ `SynthesisMerger.ts`
    - Các helpers là pure functions, export riêng để test được
    - _Requirements: 7.5_

  - [x] 6.3 Thêm adapter cho legacy `StructuredAgentReport[]`
    - Trong `SuppressionFilter.ts`: method `applyToLegacyReports(reports: StructuredAgentReport[], suppressedFindings: SuppressedFinding[]): SuppressionResult`
    - Phase 1 dùng adapter này, Phase 3 sẽ dùng Session Memory Finding transitions
    - _Requirements: 7.5_

  - [x] 6.4 Replace internal calls trong SynthesisMerger với SuppressionFilter wrapper
    - Update `SynthesisMerger.ts`: import và delegate suppression logic sang `SuppressionFilter`
    - Giữ nguyên behavior cho legacy path, chỉ refactor internal implementation
    - _Requirements: 7.5_

  - [x] 6.5 Write property test cho suppression filtering correctness
    - **Property 13: Suppression filtering correctness**
    - Test: generate random verified findings + suppression rules → verify chỉ findings match glob AND (hash match OR word overlap ≥ 0.7) bị suppress
    - **Validates: Requirements 7.5**

  - [x] 6.6 Write parity tests against legacy suppression behavior
    - So sánh output của `SuppressionFilter.applyToLegacyReports()` với inline suppression logic cũ trong `SynthesisMerger`
    - Dùng diff fixtures từ 1.2 làm input
    - _Requirements: 7.5, 10.2_

  - [x] 6.7 Write unit tests cho SuppressionFilter edge cases
    - Test: empty findings, empty suppression rules, partial matches, glob edge cases (`**/*.ts`, `src/**/auth*`)
    - Test: SHA-256 matching exact, word overlap boundary (0.69 vs 0.70)
    - _Requirements: 7.5, 11.6_

- [x] 7. Build Deterministic Renderer (per-section renderers)
  - [x] 7.1 Extract pure section renderers từ SynthesisMerger
    - Tạo `src/services/llm/orchestrator/DeterministicRenderer.ts`
    - Extract `EMPTY_SECTION_MESSAGES`, `severityWeight`, `emptyMessage` helpers từ `SynthesisMerger.ts`
    - _Requirements: 1.2, 1.3_

  - [x] 7.2 Định nghĩa renderer input DTOs per section
    - Trong `DeterministicRenderer.ts`: define `DeterministicSections` interface (output container cho tất cả sections)
    - Define input types cho mỗi section renderer nếu cần (hoặc dùng trực tiếp structured agent output types)
    - _Requirements: 1.2_

  - [x] 7.3 Implement `renderChangedFiles` (§1)
    - Extract `buildChangedFilesSection` từ `SynthesisMerger.ts` → `renderChangedFiles(changedFiles: UnifiedDiffFile[]): string`
    - _Requirements: 1.2_

  - [x] 7.4 Implement `renderFlowDiagram` (§4)
    - Extract diagram rendering logic từ `buildDiagramAssessmentFallback` → `renderFlowDiagram(flow: FlowDiagramOutput | undefined, language: string): string`
    - _Requirements: 1.2_

  - [x] 7.5 Implement `renderCodeQuality` (§5)
    - Extract code quality assessment logic từ `buildDiagramAssessmentFallback` → `renderCodeQuality(codeReviewer: CodeReviewerOutput | undefined, suppressedFindings: SuppressedFinding[], language: string): string`
    - _Requirements: 1.2_

  - [x] 7.6 Implement `renderTodo` (§7)
    - Extract TODO list logic từ `buildRiskTodoFallback` → `renderTodo(observer: ObserverOutput | undefined, language: string): string`
    - _Requirements: 1.2_

  - [x] 7.7 Implement `renderRisks` (§8)
    - Extract risks logic từ `buildRiskTodoFallback` → `renderRisks(observer: ObserverOutput | undefined, security: SecurityAnalystOutput | undefined, suppressedFindings: SuppressedFinding[], language: string): string`
    - _Requirements: 1.2_

  - [x] 7.8 Implement fallback `renderSummaryFallback` (§2)
    - Extract summary fallback từ `buildSummaryDetailFallback` → `renderSummaryFallback(structuredReports: StructuredAgentReport[]): string`
    - Dùng cho small patches khi Summary_Writer không bật
    - _Requirements: 2.2_

  - [x] 7.9 Implement fallback `renderImprovementsFallback` (§6)
    - Extract improvements fallback từ `buildImprovementFallback` → `renderImprovementsFallback(codeReviewer, security, suppressedFindings, language): { markdown: string; stats: MetadataStats }`
    - Dùng cho patches không đủ phức tạp cho Improvement_Writer
    - _Requirements: 2.4_

  - [x] 7.10 Language empty-state mapping
    - Verify `EMPTY_SECTION_MESSAGES` đã cover tất cả languages cần thiết
    - Thêm language fallback logic: nếu language không có trong map → dùng English
    - _Requirements: 1.3_

  - [x] 7.11 Write per-section parity tests against legacy SynthesisMerger fallbacks
    - Cho mỗi section (§1, §4, §5, §7, §8, §2 fallback, §6 fallback): so sánh output của extracted renderer function vs legacy fallback function trong SynthesisMerger với cùng input
    - Dùng diff fixtures từ 1.2 làm input
    - Đảm bảo extracted renderers produce identical output cho legacy inputs
    - _Requirements: 10.1, 1.2_

  - [x] 7.12 Write golden tests cho Deterministic Renderer
    - Tạo `src/test/fixtures/goldenSnapshots/` directory
    - Tạo JSON fixtures với structured findings → expected markdown output per section (§1, §4, §5, §7, §8)
    - Assert byte-for-byte match cho deterministic sections
    - Test empty-state messages cho Vietnamese, English, Japanese
    - _Requirements: 11.2_

  - [x] 7.13 Write property test cho deterministic rendering idempotence
    - **Property 5: Deterministic rendering idempotence**
    - Test: generate random findings + files → call renderer twice → assert identical output
    - **Validates: Requirements 1.2**

  - [x] 7.14 Write property test cho severity sorting within sections
    - **Property 14: Severity sorting within sections**
    - Test: generate random findings → verify output ordered by severity weight (critical=4 > major=3 > minor=2 > suggestion=1), stable within same severity
    - **Validates: Requirements 7.6**


- [x] 8. Build Hybrid Assembly layer
  - [x] 8.1 Định nghĩa `HybridAssemblyInput`
    - Tạo `src/services/llm/orchestrator/HybridAssembly.ts`
    - Define `HybridAssemblyInput` interface: `sessionMemory` (hoặc legacy structured reports cho Phase 1), `executionPlan`, `language`, `detailChangeReport`, `changedFiles`, `reviewDurationMs`, `suppressedFindings`
    - _Requirements: 7.1_

  - [x] 8.2 Implement section orchestration skeleton
    - Method `assemble(input: HybridAssemblyInput): string` — gọi từng section renderer theo thứ tự §1→§8, concatenate kết quả
    - Phase 1: tất cả sections dùng DeterministicRenderer (chưa có Section Writers)
    - _Requirements: 7.1, 1.4_

  - [x] 8.3 Implement §3 Detail Change sanitizer/cleanup
    - Method `sanitizeDetailChange(rawOutput: string | undefined): string`
    - Light cleanup: trim whitespace, normalize headings (ensure `## 3.` prefix)
    - Fallback: nếu output missing hoặc <50 chars → "Detail change not available"
    - _Requirements: 1.5, 1.6_

  - [x] 8.4 Implement provenance tagging mapper
    - Method `tagFindings(findings): Finding[]` — gắn tags [CR], [SA], [OB] theo agentRole
    - Cross-validation: nếu finding xuất hiện ở cả Code Reviewer và Security Analyst (word overlap > 0.4) → thêm [XV]
    - _Requirements: 7.3_

  - [x] 8.5 Implement severity sorting
    - Method `sortBySeverity(findings): Finding[]` — sort by severity weight (critical=4 > major=3 > minor=2 > suggestion=1), stable sort
    - _Requirements: 7.6_

  - [x] 8.6 Implement metadata footer builder
    - Method `buildMetadataFooter(findings, reviewDurationMs): string`
    - HTML comment format: `<!-- Review Metadata: findings=N, critical=N, major=N, minor=N, suggestion=N, by_agent={CR:N, SA:N, OB:N}, cross_validated=N, suppressed=N, duration=Nms -->`
    - _Requirements: 7.4_

  - [x] 8.7 Integrate prefiltered findings từ SuppressionFilter
    - Trong `assemble()`: nhận pre-filtered findings (post-suppression), không tự filter
    - Hybrid Assembly là read-only cho findings
    - _Requirements: 7.5_

  - [x] 8.8 Report structure validation helper
    - Method `validateReportStructure(report: string): boolean` — verify 8 section headings present in order + metadata footer
    - Dùng trong tests và debug mode
    - _Requirements: 1.4, 7.1_

  - [x] 8.9 Write parity snapshot test against legacy report shape
    - So sánh structure (section headings, metadata footer format) của HybridAssembly output với `mergeSynthesisOutputs` output
    - Dùng cùng input fixtures → verify cùng 8 sections + metadata footer
    - _Requirements: 10.1, 1.4_

  - [x] 8.10 Write property test cho report structure invariant
    - **Property 4: Report structure invariant**
    - Test: generate random findings + language → verify 8 section headings in order + metadata footer with required fields
    - **Validates: Requirements 1.4, 7.1, 7.4**

  - [x] 8.11 Write property test cho Detail Change pass-through
    - **Property 6: Detail Change pass-through**
    - Test: generate random non-empty string ≥50 chars → verify §3 contains original content (modulo whitespace trim + heading normalization)
    - **Validates: Requirements 1.5**

  - [x] 8.12 Write property test cho provenance tagging correctness
    - **Property 12: Provenance tagging correctness**
    - Test: generate random findings with various agentRoles → verify correct tags [CR]/[SA]/[OB]/[XV]
    - **Validates: Requirements 7.3**

  - [x] 8.13 Write unit tests cho Hybrid Assembly
    - Test provenance tagging, severity sorting, suppression filtering với various finding combinations
    - Test fallback behavior khi Detail Change output missing hoặc low quality
    - Test metadata footer generation accuracy
    - _Requirements: 11.6_

- [x] 9. Checkpoint — Ensure all Phase 1 core components compile and tests pass, ask the user if questions arise.

- [ ] 10. Wire adaptive pipeline vào ContextOrchestratorService
  - [x] 10.1 Định nghĩa Phase 1 Adaptive Pipeline DTOs
    - Trong `src/services/llm/orchestrator/adaptivePipelineTypes.ts` (new file)
    - Define `AdaptivePipelineInput`: adapter, phase1Agents, sharedStore (SharedContextStoreImpl for Phase 1), suppressedFindings, changedFiles, language, reviewDurationMs, signal, request, detailChangeReport
    - Define `AdaptivePipelineIntermediateData`: structuredReports, observerFindings, suppressionResult
    - Define `AdaptivePipelineOutput`: final markdown string (same as `mergeSynthesisOutputs` return type)
    - Define `LegacyStructuredReportAdapter`: helper to convert SharedContextStore findings → DeterministicRenderer input format
    - Note: Phase 1 dùng SharedContextStoreImpl + StructuredAgentReport[], Phase 3 sẽ dùng SessionMemory + Finding[]
    - _Requirements: 1.1, 7.1, 10.1_

  - [x] 10.2 Định nghĩa orchestration boundary và return type
    - Trong `src/services/llm/ContextOrchestratorService.ts`: define method signature `runAdaptivePipeline(input: AdaptivePipelineInput): Promise<AdaptivePipelineOutput>`
    - _Requirements: 1.1, 1.7_

  - [x] 10.3 Implement new orchestration path without Phase 3
    - Trong `runAdaptivePipeline`: gọi `executePhasedAgentReports` (Phase 1 + Phase 2), sau đó gọi `SuppressionFilter.apply()` → `HybridAssembly.assemble()`
    - Dùng `LegacyStructuredReportAdapter` để convert SharedContextStore data → DeterministicRenderer input
    - KHÔNG gọi `executeSynthesisAgentReports` (Phase 3 agents)
    - _Requirements: 1.1, 1.7_

  - [x] 10.4 Write adapter parity tests cho LegacyStructuredReportAdapter
    - Verify conversion preserves all fields needed by DeterministicRenderer và HybridAssembly
    - Verify no data loss cho findings/provenance/severity/confidence
    - Test với diff fixtures từ 1.2 + mock structured reports
    - _Requirements: 10.1, 1.2_

  - [x] 10.5 Preserve legacy orchestration path untouched
    - Existing methods `executePhasedAgentReports`, `executeSynthesisAgentReports`, `generateMultiAgentFinalText` KHÔNG thay đổi
    - Legacy path vẫn gọi đầy đủ Phase 3 synthesis agents
    - _Requirements: 6.6_

  - [x] 10.6 Wire cancellation propagation
    - Trong `runAdaptivePipeline`: propagate `AbortSignal` qua tất cả steps (SuppressionFilter, HybridAssembly)
    - Throw `GenerationCancelledError` nếu signal aborted
    - _Requirements: 10.4_

  - [x] 10.7 Wire error mapping to existing `ReviewErrorPayload`
    - Catch errors trong `runAdaptivePipeline`, map sang existing error handling pattern (same as legacy)
    - _Requirements: 10.5_

  - [x] 10.8 Wire telemetry emission points
    - Integrate `PipelineTelemetryEmitter` vào `runAdaptivePipeline`
    - Emit: `PIPELINE_START`, `AGENT_COMPLETE` (per agent), `ASSEMBLY_COMPLETE`, `PIPELINE_COMPLETE`
    - Log phase latencies, total input tokens, output completeness
    - _Requirements: 9.6, 9.7, 9.8_

- [ ] 11. Wire feature flag vào tất cả 4 review services
  - [x] 11.1 Định nghĩa shared service wrapper / strategy selector
    - Tạo helper method trong `ReviewWorkflowServiceBase` (hoặc mixin): `executeReviewPipeline(params)` — đọc flag, route sang adaptive hoặc legacy
    - Tránh duplicate code trong 4 services
    - _Requirements: 6.1, 6.6_

  - [x] 11.2 Wire adaptive pipeline trong `src/commands/reviewMerge/reviewMergeService.ts`
    - Trong `generateReview()`: gọi `shouldUseAdaptivePipeline()`, route sang `runAdaptivePipeline` hoặc legacy path
    - Preserve ReviewResult interface, ReviewMemoryService save behavior, error handling, cancellation
    - _Requirements: 6.1, 6.6, 8.1, 10.1–10.5_

  - [x] 11.3 Wire adaptive pipeline trong `src/commands/reviewStagedChanges/reviewStagedChangesService.ts`
    - Same pattern as 11.2
    - _Requirements: 6.1, 6.6, 8.2, 10.1–10.5_

  - [x] 11.4 Wire adaptive pipeline trong `src/commands/reviewMergedBranch/reviewMergedBranchService.ts`
    - Same pattern as 11.2
    - _Requirements: 6.1, 6.6, 8.3, 10.1–10.5_

  - [x] 11.5 Wire adaptive pipeline trong `src/commands/reviewSelectedCommits/reviewSelectedCommitsService.ts`
    - Same pattern as 11.2
    - _Requirements: 6.1, 6.6, 8.4, 10.1–10.5_

  - [x] 11.6 Write integration flag tests cho tất cả 4 entry points
    - Test legacy vs new pipeline với same mock input → same ReviewResult interface
    - Test tất cả 4 entry points dưới cả hai flag states
    - Test MR Description flow unaffected (Change Analyzer + Context Investigator)
    - Test PlantUML repair flow unaffected
    - Test ReviewMemoryService data format unchanged
    - _Requirements: 11.4, 11.7, 8.5, 8.6, 10.1, 10.5_

  - [x] 11.7 Write SharedContextStore compatibility tests cho adaptive path
    - Test `addAgentFindings`/`getAgentFindings` trên `SharedContextStoreImpl` vẫn hoạt động đúng trong adaptive pipeline path
    - Test backward compatibility: adaptive path dùng existing `SharedContextStoreImpl` API (Phase 1 chưa có SessionMemory)
    - Note: SessionMemory contract tests sẽ ở Phase 3 task 22.14–22.17
    - _Requirements: 4.6, 11.3_

  - [x] 11.8 Write migration contract suite
    - Test: same input under flag=off vs flag=on → verify ReviewResultPayload fields identical (review, description, rawDiff)
    - Test: progress/error/result webview message contract unchanged (message types, payload shapes)
    - Test: cancel semantics unchanged (silent-return, no error thrown)
    - Test: autosave/history behavior unchanged (saveReviewHistory called with same args)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 12. Migration/Rollback — Phase 1
  - [x] 12.1 Định nghĩa feature flag rollout stages
    - Tạo `docs/adaptive-pipeline-rollout.md` (hoặc comment block trong `adaptivePipelineFlag.ts`)
    - Document: Phase 1 = flag off by default, opt-in; Phase 2 = flag on by default, opt-out; Phase 3 = flag removed, legacy deprecated
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 12.2 Định nghĩa rollback procedure cho Phase 1
    - Document: set `gitmew.useAdaptivePipeline = false` → toàn bộ legacy path chạy unchanged
    - Verify: không có side effects khi toggle flag (no persistent state changes)
    - _Requirements: 6.6_

  - [x] 12.3 Thêm compatibility assertions cho legacy path
    - Write test: khi flag=false, verify legacy code path chạy EXACTLY như trước (no new imports, no new side effects)
    - Dùng spy/mock để verify `executeSynthesisAgentReports` vẫn được gọi khi flag=false
    - _Requirements: 6.6, 10.1_

  - [x] 12.4 Thêm deprecation notices timeline
    - Thêm JSDoc `@deprecated` annotations cho `SYNTHESIS_BUDGET_RATIOS`, `allocateSynthesisBudgets`, `mergeSynthesisOutputs` với message "Will be removed after Phase 3 stabilization"
    - _Requirements: 6.4_

- [x] 13. Phase 1 Exit Criteria Checkpoint
  - Ensure ALL of the following pass before proceeding to Phase 2:
    - [x] 13.1 Adaptive path behind flag works cho tất cả 4 entry points (Review Merge, Review Staged Changes, Review Merged Branch, Review Selected Commits)
    - [x] 13.2 No Phase 3 calls khi flag=true (verify `executeSynthesisAgentReports` NOT called)
    - [x] 13.3 Legacy path byte-compatible cho untouched flow (flag=false → identical behavior)
    - [x] 13.4 Deterministic renderer snapshots approved (golden tests pass)
    - [x] 13.5 Telemetry emitted at required points (pipeline start, agent complete, assembly complete, pipeline complete)
    - [x] 13.6 MR description flow unaffected (integration test pass)
    - [x] 13.7 PlantUML repair regression tests pass
    - [x] 13.8 All property tests pass (Properties 4, 5, 6, 12, 13, 14)
    - [x] 13.9 All unit tests pass
    - Ask the user if questions arise.


### Phase 1.5: Benchmark Harness (trước Phase 2)

- [x] 14. Benchmark Harness
  - [x] 14.1 Capture legacy baseline fixtures
    - Tạo `src/test/benchmarks/legacyBaseline/` directory
    - Capture: legacy pipeline output cho small/medium/large patch fixtures
    - Record: total LLM calls, total input tokens, end-to-end latency, output markdown
    - _Requirements: 9.9, 9.11_

  - [x] 14.2 Thêm end-to-end benchmark script
    - Tạo `src/test/benchmarks/pipelineBenchmark.ts`
    - Run cả legacy và adaptive pipeline với same fixtures → compare latency, token usage, output structure
    - Output: JSON report với metrics comparison
    - _Requirements: 9.9_

  - [x]* 14.3 Thêm token accounting harness
    - Tạo `src/test/benchmarks/tokenAccountingHarness.ts`
    - Count total input tokens cho adaptive pipeline vs legacy → verify ≥20% reduction
    - _Requirements: 9.11_

  - [x]* 14.4 Thêm renderer latency benchmark
    - Tạo `src/test/benchmarks/rendererLatencyBenchmark.ts`
    - Measure `DeterministicRenderer` latency cho tất cả sections → verify <50ms
    - _Requirements: 9.10_

### Phase 2: Context Gatherer + Adaptive Budgeting (Medium Effort)

- [x] 15. Build Context Gatherer
  - [x] 15.1 Định nghĩa `ContextGathererInput/Output`
    - Tạo `src/services/llm/orchestrator/ContextGatherer.ts`
    - Define `ContextGathererInput` interface: `changes: UnifiedDiffFile[]`, `diffText: string`, `dependencyGraph?: DependencyGraphData`, `diffTokens: number`, `contextWindow: number`
    - Output là `ExecutionPlan` (đã define ở 4.1)
    - _Requirements: 3.1, 3.3_

  - [x] 15.2 Implement patch size classifier
    - Private method `classifyPatchSize(fileCount: number, diffTokens: number): 'small' | 'medium' | 'large'`
    - Thresholds: small (<10 files AND <3000 tokens), medium (10-30 files OR 3000-15000 tokens), large (>30 files OR >15000 tokens)
    - OR logic cho medium/large (ưu tiên safety)
    - _Requirements: 3.3_

  - [x] 15.3 Implement patch intent classifier
    - Private method `classifyPatchIntent(changes: UnifiedDiffFile[], diffText: string): PatchIntent`
    - Rules: feature (>60% additions + new files), refactor (high rename/move, similar add/delete), bugfix (small patch, test accompanies source), mixed (no dominant >50%)
    - _Requirements: 3.1_

  - [x] 15.4 Implement risk flags detector
    - Private method `detectRiskFlags(changes, diffText, graph?): RiskFlags`
    - `securitySensitive`: file patterns (`auth`, `crypto`, `token`, `secret`, `password`, `session`, `permission`, `.env`) + diff keywords (`apiKey`, `jwt`, `hash`, `encrypt`)
    - `crossModule`: ≥3 distinct top-level directories OR ≥2 critical paths with changedFileCount ≥2
    - `highChurn`: ≥5 files with >100 changed lines each
    - `apiContractChange`: diff contains changes to exported interfaces/types/function signatures
    - _Requirements: 3.1_

  - [x] 15.5 Implement hotspot ranking
    - Private method `identifyHotspots(changes, graph?): string[]`
    - Order by descending `importedBy` reference count từ dependency graph
    - Fallback: empty array nếu graph unavailable
    - _Requirements: 3.2_

  - [x] 15.6 Implement agent enable/disable planner
    - Private method: determine `enabledAgents` và `disabledAgents` (with reasons) based on patchIntent + riskFlags
    - Default: all 4 specialist agents enabled. Disable logic cho future optimization
    - _Requirements: 3.3_

  - [x] 15.7 Implement adaptive budget planner
    - Private method `computeAgentBudgets(patchIntent, riskFlags, defaultRatios): Record<string, number>`
    - Boost Security Analyst ≥20% khi `securitySensitive`
    - Boost Flow Diagram ≥15% khi `refactor`
    - Normalize: ensure sum ≤ 1.0
    - _Requirements: 3.4, 3.5_

  - [x] 15.8 Implement fallback/default plan builder
    - Private method: build default ExecutionPlan khi heuristic analysis fails
    - `fallbackPolicy = 'static-budget'`, use `DEFAULT_BUDGET_CONFIG` ratios
    - _Requirements: 3.7_

  - [x] 15.9 Thêm heuristic trace/debug payload
    - Trong `analyze()`: collect classification decisions vào debug payload
    - Return debug info alongside ExecutionPlan (hoặc attach to telemetry)
    - _Requirements: 9.1, 9.2_

  - [x] 15.10 Write unit tests cho heuristic classification
    - Golden tests: known diffs → expected patchIntent/riskFlags cho feature, refactor, bugfix, mixed
    - Test riskFlags detection cho mỗi flag type
    - Test patch size classification với boundary values (9 files, 10 files, 30 files, 31 files)
    - Test error fallback behavior
    - _Requirements: 11.1_

  - [x] 15.11 Write property test cho adaptive budget boost
    - **Property 9: Adaptive budget boost**
    - Test: generate random input with `securitySensitive=true` → verify Security Analyst budget ≥ 1.2× default. Generate random input with `patchIntent='refactor'` → verify Flow Diagram budget ≥ 1.15× default
    - **Validates: Requirements 3.4, 3.5**

  - [x] 15.12 Write property test cho ExecutionPlan schema compliance
    - **Property 8: ExecutionPlan schema compliance**
    - Test: generate random `ContextGathererInput` → call `ContextGatherer.analyze()` → verify output ExecutionPlan has valid patchIntent, boolean riskFlags, non-empty enabledAgents, agentBudgets sum ≤ 1.0, valid fallbackPolicy
    - **Validates: Requirements 3.1, 3.3**

  - [x] 15.13 Write property test cho hotspot file ordering
    - **Property 10: Hotspot file ordering**
    - Test: generate random DependencyGraphData + changed files → verify priorityFiles ordered by descending importedBy count
    - **Validates: Requirements 3.2**

- [x] 16. Extend ContextBudgetManager cho ExecutionPlan overrides
  - [x] 16.1 Implement allocatable-agent-pool calculation
    - Trong `src/services/llm/orchestrator/ContextBudgetManager.ts`: new method `computeAllocatablePool(contextWindow, systemTokens, referenceTokens): number`
    - Pool = contextWindow - safety margin - system tokens - reference tokens
    - _Requirements: 5.1, 5.7_

  - [x] 16.2 Map `ExecutionPlan.agentBudgets` vào concrete allocations
    - New method `allocateFromExecutionPlan(plan, contextWindow, maxOutputTokens, systemTokens, diffTokens): AgentBudgetAllocation[]`
    - Dùng `plan.agentBudgets` ratios thay vì static `DEFAULT_BUDGET_CONFIG.agentBudgetRatios`
    - IMPORTANT: `agentBudgets` are ratios of allocatable-agent-pool (CW - safety - system - reference), NOT ratios of raw context window
    - _Requirements: 5.1_

  - [x] 16.3 Implement section writer budget allocation
    - New method `allocateSectionWriterBudgets(plan, contextWindow, maxOutputTokens, systemTokens): AgentBudgetAllocation[]`
    - Budget từ freed Phase 3 pool (không còn 4 synthesis agents)
    - Chỉ allocate khi `plan.sectionWriters.summary` hoặc `plan.sectionWriters.improvements` = true
    - _Requirements: 5.2, 5.3_

  - [x] 16.4 Thêm validation/normalization khi budget sum > 1.0
    - Trong `allocateFromExecutionPlan`: nếu `agentBudgets` sum > 1.0 → normalize proportionally
    - Log warning khi normalization xảy ra
    - _Requirements: 5.4_

  - [x] 16.5 Định nghĩa fallback behavior khi plan invalid
    - Nếu `ExecutionPlan` missing hoặc invalid → fallback về `allocateAgentBudgets` (existing static method)
    - _Requirements: 5.4_

  - [x] 16.6 Write property test cho budget safety threshold
    - **Property 11: Budget safety threshold**
    - Test: generate random context window + ExecutionPlan → verify total allocation ≤ 90% context window
    - **Validates: Requirements 5.7**

- [x] 17. Extend MultiAgentExecutor to skip disabled agents
  - [x] 17.1 Filter phase1 agent configs
    - Trong `src/services/llm/orchestrator/MultiAgentExecutor.ts`: add optional `executionPlan` param to `executePhasedAgents`
    - Filter `config.phase1` agents by `executionPlan.enabledAgents` before execution
    - _Requirements: 3.3_

  - [x] 17.2 Preserve stable ordering of enabled agents
    - Maintain original agent order after filtering (không re-sort)
    - _Requirements: 3.3_

  - [x] 17.3 Adapt self-audit/observer inputs khi agent absent
    - Khi một agent bị skip: Observer vẫn chạy nhưng không có findings từ skipped agent
    - SharedContextStore sẽ không có entries cho skipped agents — Observer prompt handles gracefully
    - _Requirements: 3.3_

  - [x] 17.4 Thêm skipped-agent telemetry/logging
    - Log skipped agents với reasons từ `executionPlan.disabledAgents`
    - _Requirements: 9.3_

- [x] 18. Thêm truncation telemetry vào AdapterCalibrationService
  - [x] 18.1 Extend `src/services/llm/orchestrator/AdapterCalibrationService.ts`
    - Emit `TruncationTelemetry` event khi `safeTruncatePrompt` performs truncation
    - Include: agent role, tokens truncated, context window actual, budget allocated
    - _Requirements: 5.5, 9.4_

- [x] 19. Wire Context Gatherer vào adaptive pipeline
  - [x] 19.1 Determine dependency graph provisioning cho Context Gatherer
    - Quyết định: reuse precomputed graph từ DependencyGraphIndex.build() (đã chạy trước Gatherer trong review services)
    - Nếu graph build fail: Gatherer chạy degraded mode (no hotspot, no crossModule flag)
    - Graph build time KHÔNG nằm trong target 500ms của Gatherer — chỉ heuristic analysis time
    - Thêm telemetry: log graph availability (available/unavailable/partial)
    - _Requirements: 3.2, 3.7_

  - [x] 19.2 Integrate Context Gatherer vào `runAdaptivePipeline`
    - Call `ContextGatherer.analyze()` trước agent execution
    - Pass precomputed dependencyGraph (nếu available) vào ContextGathererInput
    - Pass ExecutionPlan to `ContextBudgetManager.allocateFromExecutionPlan()`
    - Pass ExecutionPlan to `MultiAgentExecutor.executePhasedAgents()`
    - On Context Gatherer error: fallback to static budget (existing behavior)
    - _Requirements: 3.6, 3.7_

  - [x] 19.3 Thêm Context Gatherer telemetry
    - Log patchIntent và riskFlags sau classification
    - Log summarized ExecutionPlan ở normal level, full plan ở debug level
    - Log actual tokens used vs allocated per agent sau execution
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 20. Migration/Rollback — Phase 2
  - [x] 20.1 Định nghĩa rollback procedure cho Phase 2
    - Document: nếu Context Gatherer gây issues → fallback tự động về static budget (built-in)
    - Nếu cần manual rollback → set flag=false (quay về legacy hoàn toàn)
    - _Requirements: 3.7, 6.6_

  - [x] 20.2 Thêm compatibility assertions cho Phase 2
    - Test: adaptive pipeline với Context Gatherer error → verify fallback về static budget behavior identical to Phase 1
    - _Requirements: 3.7_

- [x] 21. Phase 2 Exit Criteria Checkpoint
  - Ensure ALL of the following pass before proceeding to Phase 3:
    - [x] 21.1 Context Gatherer produces valid ExecutionPlan cho tất cả diff fixture types (small/medium/large/security/refactor)
    - [x] 21.2 Adaptive budgets applied correctly (Security Analyst boosted khi securitySensitive, Flow Diagram boosted khi refactor)
    - [x] 21.3 Disabled agents skipped correctly với telemetry logged
    - [x] 21.4 Truncation telemetry emitted khi truncation xảy ra
    - [x] 21.5 Context Gatherer fallback works (error → static budget, pipeline continues)
    - [x] 21.6 Total budget allocation ≤ 90% context window cho mọi test case
    - [x] 21.7 All Phase 1 tests still pass (no regression)
    - [x] 21.8 All new property tests pass (Properties 8, 9, 10, 11)
    - [x] 21.9 Dependency graph provisioning documented and tested (available/unavailable/partial modes)
    - Ask the user if questions arise.


### Phase 3: Session Memory + Conditional Section Writers (Long-term)

- [x] 22. Upgrade SharedContextStore to Session Memory
  - [x] 22.1 Tạo new storage structures cho findings/hypotheses
    - Tạo `src/services/llm/orchestrator/SessionMemory.ts`
    - Extend `SharedContextStoreImpl`
    - Private stores: `Map<string, Finding>` cho findings, `Map<string, Hypothesis>` cho hypotheses
    - Private field: `executionPlan?: ExecutionPlan`
    - _Requirements: 4.1, 4.6, 4.11_

  - [x] 22.2 Implement add/get finding APIs
    - `addFinding(finding: Finding, actor: ActorRole): void` — validate actor is `specialist_agent`, set status to `proposed`, throw `DuplicateFindingError` nếu ID exists
    - `getFindings(filter?: FindingFilter): Finding[]` — return findings with status `verified` hoặc `proposed` (exclude `rejected`, `suppressed`)
    - _Requirements: 4.1, 4.2, 4.7_

  - [x] 22.3 Implement add/get hypothesis APIs
    - `addHypothesis(hypothesis: Hypothesis, actor: ActorRole): void` — validate actor is `specialist_agent`, set status to `proposed`
    - `getHypotheses(filter?: HypothesisFilter): Hypothesis[]` — return hypotheses with status `verified` hoặc `proposed`
    - _Requirements: 4.11_

  - [x] 22.4 Implement transition validator
    - Private method `validateTransition(actor: ActorRole, currentStatus: FindingStatus, targetStatus: FindingStatus): void`
    - Check against `ALLOWED_TRANSITIONS` matrix
    - Throw `InvalidTransitionError` với actor, current status, target status nếu invalid
    - _Requirements: 4.9_

  - [x] 22.5 Implement `transitionFindingStatus`
    - `transitionFindingStatus(findingId: string, newStatus: FindingStatus, actor: ActorRole): void`
    - Validate transition, update finding status
    - Throw `FindingNotFoundError` nếu finding không tồn tại
    - _Requirements: 4.3, 4.4, 4.9_

  - [x] 22.6 Implement `transitionHypothesisStatus`
    - `transitionHypothesisStatus(hypothesisId: string, newStatus: HypothesisStatus, actor: ActorRole): void`
    - Same validation logic as findings
    - _Requirements: 4.11_

  - [x] 22.7 Implement execution plan storage
    - `setExecutionPlan(plan: ExecutionPlan): void`
    - `getExecutionPlan(): ExecutionPlan | undefined`
    - _Requirements: 3.6_

  - [x] 22.8 Implement legacy bridge adapter
    - `addAgentFindings(agentRole, findings)` / `getAgentFindings(agentRole?)` — backward-compat bridge
    - Bridge converts legacy `AgentFinding[]` format to/from new `Finding` format
    - Log deprecation warning khi bridge methods called
    - _Requirements: 4.6_

  - [x] 22.9 Wire Evidence_Ref storage
    - Ensure `Finding.evidenceRefs` stored correctly (file, lineRange, toolResultId, diffLineRef)
    - Validate Evidence_Ref fields on addFinding
    - _Requirements: 4.5_

  - [x] 22.10 Wire linkedFindingIds support
    - Ensure `Finding.linkedFindingIds` stored and retrievable
    - Validate referenced finding IDs exist (warning, not error — findings may be added out of order)
    - _Requirements: 4.8_

  - [x] 22.11 Thêm invariant checks/errors
    - Session data does NOT persist to workspace state
    - No data leak to ReviewMemoryService without explicit save logic
    - Enforce: `section_writer`, `deterministic_renderer`, `hybrid_assembly` actors cannot modify finding/hypothesis status
    - _Requirements: 4.6, 4.9, 4.10_

  - [x] 22.12 Renderable filtering API
    - Method `getRenderableFindings(): Finding[]` — return findings with status `verified` hoặc `proposed` only
    - Used by DeterministicRenderer và Section Writers
    - _Requirements: 4.7_

  - [x] 22.13 Migration notes + deprecation annotations
    - Add JSDoc `@deprecated` to `addAgentFindings`/`getAgentFindings` bridge methods
    - Document migration path: Phase 1/2 use bridge, Phase 3 use new APIs
    - _Requirements: 4.6_

  - [x] 22.14 Write property test cho Finding/Hypothesis round-trip preservation
    - **Property 1: Finding/Hypothesis round-trip preservation**
    - Test: generate random Finding (with Evidence_Refs, linkedFindingIds) → store → retrieve → assert all fields identical
    - **Validates: Requirements 4.1, 4.5, 4.8, 4.11**

  - [x] 22.15 Write property test cho ownership enforcement
    - **Property 2: Ownership enforcement — valid transitions accepted, invalid transitions rejected**
    - Test: generate random (actor, currentStatus, targetStatus) combinations → verify transition succeeds iff listed in ALLOWED_TRANSITIONS. Verify specialist_agent always creates with status=proposed
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.9, 4.11**

  - [x] 22.16 Write property test cho rendering filter excludes rejected findings
    - **Property 3: Rendering filter excludes rejected findings**
    - Test: generate random findings with mixed statuses → verify getRenderableFindings returns only verified/proposed
    - **Validates: Requirements 4.7**

  - [x] 22.17 Write contract tests cho finding status transitions
    - Test all valid transitions per ownership matrix (specialist→proposed, self_audit→verified/rejected, observer→verified/rejected, suppression_filter→suppressed)
    - Test all invalid transitions rejected with `InvalidTransitionError`
    - Test edge cases: empty findings, null Evidence_Refs, duplicate finding IDs
    - _Requirements: 11.3_

- [x] 23. Upgrade SuppressionFilter cho Session Memory
  - [x] 23.1 Update `SuppressionFilter.apply()` cho Session Memory Finding lifecycle
    - New method `applyToSessionMemory(sessionMemory: SessionMemory, suppressedFindings: SuppressedFinding[]): SuppressionResult`
    - Transition matched findings từ `verified` → `suppressed` trong Session Memory
    - SuppressionFilter là ONLY actor allowed to perform `verified → suppressed` transition
    - Maintain backward compat: `applyToLegacyReports` vẫn works cho Phase 1/2 path
    - _Requirements: 7.5, 4.9_

- [x] 24. Build conditional Section Writers
  - [x] 24.1 Định nghĩa `SummaryWriterInput`
    - Trong `src/services/llm/orchestrator/SectionWriters.ts` (hoặc trong HybridAssembly)
    - Define input: renderable findings, changed files, language, token budget
    - _Requirements: 2.1, 2.5_

  - [x] 24.2 Định nghĩa `ImprovementWriterInput`
    - Define input: renderable findings (filtered), language, token budget
    - _Requirements: 2.3, 2.5_

  - [x] 24.3 Implement activation rule helper
    - Function `shouldActivateSummaryWriter(plan: ExecutionPlan): boolean` — true khi patch size medium hoặc large
    - Function `shouldActivateImprovementWriter(findings: Finding[]): boolean` — true khi ≥3 renderable findings OR ≥1 finding severity major/critical
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 24.4 Implement summary writer prompt builder
    - Build prompt cho Summary_Writer: inject renderable findings + changed files summary
    - Prompt instructs LLM to write §2 Summary section only
    - _Requirements: 2.1, 2.5_

  - [x] 24.5 Implement improvements writer prompt builder
    - Build prompt cho Improvement_Writer: inject renderable findings grouped by category
    - Prompt instructs LLM to write §6 Improvements section only
    - _Requirements: 2.3, 2.5_

  - [x] 24.6 Implement single-call execution wrapper
    - Method `executeSectionWriter(adapter, prompt, budget, signal): Promise<string>`
    - Max 1 LLM call per writer
    - _Requirements: 2.7_

  - [x] 24.7 Implement failure/timeout/quality fallback policy
    - On writer failure (timeout, API error, parse failure, output <50 chars): fallback to DeterministicRenderer cho section đó
    - Log fallback reason via telemetry
    - _Requirements: 7.2, 9.5_

  - [x] 24.8 Integrate writer outputs vào HybridAssembly
    - Update `HybridAssembly.assemble()`: check activation rules, call writers nếu enabled, fallback nếu fail
    - §2: Summary_Writer output hoặc `renderSummaryFallback`
    - §6: Improvement_Writer output hoặc `renderImprovementsFallback`
    - _Requirements: 7.1, 2.6_

  - [x] 24.9 Telemetry hooks cho Section Writers
    - Emit `SECTION_WRITER_FALLBACK` khi writer fails
    - Log: section name, failure reason, fallback used
    - _Requirements: 9.5_

  - [x] 24.10 Write property test cho Section Writer activation rules
    - **Property 7: Section Writer activation rules**
    - Test: generate random ExecutionPlan + Session Memory state → verify Summary_Writer enabled iff medium/large, Improvement_Writer enabled iff ≥3 findings OR ≥1 major/critical
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [x] 24.11 Write failure-path tests cho Section Writers
    - Test fallback to DeterministicRenderer khi writer fails (timeout, error, quality threshold)
    - Test report completeness after fallback (all 8 sections present)
    - _Requirements: 11.5_

- [x] 25. Switch adaptive path to read structured state directly
  - [x] 25.1 Update DeterministicRenderer to read Finding[] from SessionMemory
    - Replace legacy `StructuredAgentReport[]` input with `SessionMemory.getRenderableFindings()` when adaptive pipeline active
    - DeterministicRenderer reads structured Finding objects directly, not serialized AgentFinding markdown
    - Maintain backward compat: legacy path still uses StructuredAgentReport[]
    - _Requirements: 4.7, 2.5_

  - [x] 25.2 Update HybridAssembly to read structured state from SessionMemory
    - Replace legacy structured report consumption with `SessionMemory.getRenderableFindings()` + `SessionMemory.getHypotheses()`
    - Section Writers read filtered structured state, not serialized prose
    - _Requirements: 2.5, 4.7_

  - [x] 25.3 Update Observer/Verifier to read structured findings from SessionMemory
    - Observer reads `SessionMemory.getFindings()` structured data instead of serialized `serializeForAgent()` markdown
    - Reduces "summary-of-summary" problem
    - _Requirements: 4.7_

  - [x] 25.4 Write parity tests cho Observer structured-read path
    - So sánh observer output/behavior giữa serialized input path (legacy) và structured input path (new) trên cùng fixtures
    - Test observer handles missing skipped-agent data gracefully sau khi chuyển structured reads
    - _Requirements: 4.7, 11.4_

- [x] 26. Update orchestratorTypes.ts re-exports
  - [x] 26.1 Re-export Finding, Evidence_Ref, Hypothesis types
    - Update `src/services/llm/orchestrator/orchestratorTypes.ts`: re-export từ `executionPlanTypes.ts`
    - Add type aliases nếu cần cho backward compatibility
    - _Requirements: 4.1, 4.5, 4.11_

- [x] 27. Migration/Rollback — Phase 3
  - [x] 27.1 Định nghĩa rollback procedure cho Phase 3
    - Document: set flag=false → legacy path with SharedContextStoreImpl (no SessionMemory)
    - SessionMemory chỉ instantiated khi flag=true, no side effects khi flag=false
    - _Requirements: 6.4, 6.6_

  - [x] 27.2 Thêm compatibility assertions cho Phase 3
    - Test: toggle flag between legacy/new → verify ReviewResult contract unchanged
    - Test: ReviewMemoryService data format unchanged qua tất cả phases
    - Test: history auto-save behavior unchanged
    - _Requirements: 10.1, 10.2, 11.7_

- [x] 28. Phase 3 Exit Criteria Checkpoint
  - Ensure ALL of the following pass:
    - [x] 28.1 Session Memory stores/retrieves findings với correct lifecycle (proposed → verified → rejected/suppressed)
    - [x] 28.2 Ownership enforcement: invalid transitions rejected với error cho tất cả actor/status combinations
    - [x] 28.3 SuppressionFilter transitions verified → suppressed correctly trong Session Memory
    - [x] 28.4 Summary_Writer activates cho medium/large patches, deactivates cho small
    - [x] 28.5 Improvement_Writer activates khi ≥3 findings OR ≥1 major/critical
    - [x] 28.6 Section Writer fallback works (failure → deterministic, report complete)
    - [x] 28.7 Legacy bridge (`addAgentFindings`/`getAgentFindings`) vẫn functional
    - [x] 28.8 No data leak từ Session Memory sang ReviewMemoryService without explicit save
    - [x] 28.9 Adaptive path reads structured state directly from SessionMemory (not serialized prose)
    - [x] 28.10 All property tests pass (Properties 1, 2, 3, 7 + all previous)
    - [x] 28.11 All Phase 1 + Phase 2 tests still pass (no regression)
    - [x] 28.12 Feature flag toggle between legacy/new → ReviewResult contract unchanged
    - Ask the user if questions arise.

## Notes

- Mỗi phase independently shippable qua `gitmew.useAdaptivePipeline` feature flag
- Phase 1 works với existing `SharedContextStoreImpl` — không cần Session Memory upgrade
- Phase 1 reuses existing SynthesisMerger fallback functions làm DeterministicRenderer
- Property tests dùng `fast-check` (already in devDependencies)
- MR Description flow và PlantUML repair flow không bị ảnh hưởng bởi tất cả phases
- Tasks marked với `*` là optional (benchmarks, debug-level telemetry) — có thể skip cho faster MVP
- Core tests (property tests, golden tests, parity tests, contract tests, integration flag tests) là REQUIRED, không optional
- Dependency ordering: Types (task 4) → SuppressionFilter (task 6) → DeterministicRenderer (task 7) → HybridAssembly (task 8) → DTOs + Wiring (tasks 10-11)
- Test infrastructure (task 1) phải hoàn thành trước khi viết bất kỳ test nào
- Property 8 (ExecutionPlan schema compliance) nằm ở Phase 2 (task 15.12), không phải Phase 1, vì phụ thuộc ContextGatherer
- Phase 1 dùng SharedContextStoreImpl + StructuredAgentReport[] qua LegacyStructuredReportAdapter; Phase 3 chuyển sang SessionMemory + Finding[]
