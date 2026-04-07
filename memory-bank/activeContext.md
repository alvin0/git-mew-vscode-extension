# Active Context

## Current Focus
Phase 3 of the `adaptive-review-pipeline` spec is complete. Adaptive reviews now use `SessionMemory`, direct structured-state rendering, SessionMemory-based suppression, and conditional section writers with deterministic fallback, with the remaining legacy path isolated behind the feature flag. The latest follow-up work addressed post-implementation audit findings around adaptive duration accounting, runtime-vs-plan section-writer telemetry, preserved boosted budgets, and explicit Flow Diagram suppression handling.

## Recent Changes
- Added Phase 1 adaptive-pipeline scaffolding: feature flags, execution-plan/finding domain types, telemetry payloads/emitter, and rollout doc.
- Added dedicated `SuppressionFilter`, `DeterministicRenderer`, `HybridAssembly`, and `adaptivePipelineTypes` modules.
- Added `ContextOrchestratorService.runAdaptivePipeline()` to execute Phase 1/2 agents and assemble reports without Phase 3 synthesis agents.
- Wired adaptive-vs-legacy routing into Review Merge, Review Staged Changes, Review Merged Branch, and Review Selected Commits.
- Added adaptive pipeline fixtures/helpers/tests and checked completed items in `.kiro/specs/adaptive-review-pipeline/tasks.md`.
- Refactored `SynthesisMerger` to delegate fallback/suppression behavior to `SuppressionFilter` and `DeterministicRenderer` instead of duplicating logic.
- Added parity, golden snapshot, and property tests for Phase 1 deterministic rendering and hybrid assembly.
- Verified `npm test` passes with 201 tests after the latest adaptive-pipeline Phase 1 work.
- Added adaptive pipeline contract/integration tests covering all 4 review entry points under both flag states, SharedContextStore compatibility, telemetry emission, legacy-path compatibility, MR description stability, and PlantUML repair stability.
- Added an injectable adaptive telemetry emitter hook so `runAdaptivePipeline()` telemetry can be asserted directly in tests.
- Added benchmark harness utilities and scripts under `src/test/benchmarks/` for legacy-vs-adaptive comparisons, token accounting, and deterministic renderer latency measurement.
- Generated legacy baseline benchmark fixtures in `src/test/benchmarks/legacyBaseline/` for small, medium, and large diff scenarios.
- Verified benchmark harness outputs show 4 fewer LLM calls in adaptive mode, average token reduction of 29.37%, and renderer latency under 50ms across benchmark scenarios.
- Added `ContextGatherer` to classify patch size, intent, risk flags, hotspot ordering, dependency-graph availability, and per-agent execution budgets for the adaptive path.
- Extended `ContextBudgetManager` with allocatable-pool planning, ExecutionPlan-driven per-agent allocation, section-writer budget allocation, normalization, and Phase 2 fallback behavior.
- Extended `MultiAgentExecutor` to honor `ExecutionPlan.enabledAgents`, log skipped agents, preserve stable ordering, and capture actual per-agent token usage for telemetry.
- Extended `AdapterCalibrationService` to emit truncation telemetry with agent role, allocated budget, and truncation counts.
- Wired `ContextOrchestratorService.runAdaptivePipeline()` to run Context Gatherer, store execution plans in `SharedContextStore`, allocate adaptive budgets, fall back to static budgets on planner failure, and emit richer adaptive telemetry.
- Added Phase 2 tests in `src/test/adaptivePipelinePhase2.test.ts` covering ExecutionPlan classification, budget safety/property checks, hotspot ordering, graph availability modes, disabled-agent skipping, truncation telemetry, and adaptive fallback behavior.
- Updated `docs/adaptive-pipeline-rollout.md` with Phase 2 rollout status and rollback behavior.
- Verified the full test suite now passes with `214 passing` after the Phase 2 additions.
- Added `SessionMemory` as the adaptive structured-state store, with Finding/Hypothesis lifecycle validation, renderable filtering, bridge APIs for legacy agent data, and structured serialization for prompt injection.
- Added `SectionWriters` for Summary and Improvement sections, including activation rules, single-call execution, and fallback handling.
- Extended `HybridAssembly` with an async adaptive path that reads structured findings/hypotheses directly from `SessionMemory`, uses conditional section writers, and falls back to deterministic rendering with telemetry.
- Extended `SuppressionFilter` to transition verified findings to suppressed inside `SessionMemory`.
- Updated adaptive review entry points to instantiate `SessionMemory` only when the adaptive flag is enabled.
- Added Phase 3 tests in `src/test/adaptivePipelinePhase3.test.ts` covering round-trip preservation, lifecycle ownership rules, renderable filtering, suppression transitions, section writer activation, and writer fallback telemetry.
- Added Observer structured-read parity coverage in `AgentPromptBuilder.test.ts` and compatibility/no-leak coverage in `adaptivePipelineContracts.test.ts`.
- Verified the full test suite now passes with `225 passing` after the latest Phase 3 work.
- Fixed adaptive review duration propagation so `HybridAssembly` receives elapsed time computed after pipeline completion via `reviewStartTimeMs`, and aligned all 4 review entry points to pass a consistent review start timestamp.
- Updated `ContextGatherer` so `sectionWriters.improvements` is treated as runtime eligibility, section-writer budgets always include an improvement budget, and boosted roles keep their intended weight while non-boosted roles rebalance proportionally.
- Made `SuppressionFilter.applyToLegacyReports()` explicitly preserve `Flow Diagram` reports, and clarified in `SessionMemory.setRiskHypotheses()` that generated hypotheses are seeded as specialist-origin proposed items before observer verification.
- Added regression coverage for adaptive duration footer correctness, runtime section-writer telemetry, preserved budget boosts, improvement-writer eligibility, and explicit Flow Diagram passthrough.
- Added `SecurityAnalystOutput`, `StructuredAuditResult`, `SynthesisAgentContext`, and extended review-related types.
- Added `ReviewMemoryService` and `reviewMemoryTypes` for cross-session pattern/history/suppression storage.
- Added `Security Analyst` prompt builder and expanded `Observer` tools/instructions.
- Upgraded `MultiAgentExecutor` with structured self-audit, security parsing, diff-context tracking, and synthesis-agent execution.
- Added synthesis prompt builders and deterministic merge via `SynthesisMerger`.
- Wired review memory + security + phase-3 synthesis into Review Merge and Review Staged Changes services.
- Registered `gitmew.clearReviewMemory`.
- Rewrote `docs/review-flows.md` to reflect the real 4-agent phase 1 + phase 3 synthesis architecture.
- Fixed review-memory suppression normalization to derive from finding description, not dismiss reason.
- Fixed synthesis suppression matching to use real SHA-256-compatible comparison and consistent glob handling for patterns like `src/**/*.ts`.
- Fixed observer structured-audit removals so todo-item removals apply correctly.
- Added regression coverage for suppression, decay cadence, bounded resolution history, observer todo removals, and safer JSON extraction.

## Important Notes
- `memory-bank/` was empty before this session, so these files are newly created from current repo understanding.
- Existing tests still cover older prompt-builder/synthesizer behavior; compatibility was preserved where practical.

## Next Likely Steps
- Consider whether observer-risk suppression should infer a richer category than the current `'correctness'` fallback when no explicit category exists.
- Clean up legacy self-audit/synthesis code once the adaptive structured-state path fully replaces it.
- Evaluate whether bridge-style `addAgentFindings/getAgentFindings` usage can be narrowed further now that adaptive assembly reads structured state directly.
