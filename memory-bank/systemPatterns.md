# System Patterns

## Architecture
- Command layer opens webviews and instantiates review services.
- Review services prepare adapter, diff, reference context, dependency graph, and agent prompts.
- `ContextOrchestratorService` and `MultiAgentExecutor` run multi-agent pipelines.
- `SharedContextStore` is the in-session blackboard for tool cache, findings, dependency graph, and risk hypotheses.

## Review Pipeline Pattern
1. Pre-analysis builds dependency graph and reference context.
2. Adaptive mode now runs `ContextGatherer` before execution to classify patch intent/risk and produce an `ExecutionPlan`.
3. `ContextBudgetManager` can allocate budgets either from static defaults or from the adaptive `ExecutionPlan`.
4. Phase 1 runs enabled review agents in parallel; adaptive mode may skip agents based on the plan while preserving original order.
5. Structured self-audit refines agent output.
6. Risk hypotheses feed the Observer phase.
7. Legacy mode still uses Phase 3 synthesis agents; adaptive mode skips Phase 3 entirely.
8. Adaptive mode runs `SuppressionFilter` then `HybridAssembly`, which uses `DeterministicRenderer` for report assembly.

## Memory Pattern
- `ReviewMemoryService` persists pattern memory, suppression memory, review history, and resolution stats via `workspaceState`.
- Prompt builders can inject previous patterns/history into review agents.
- `SharedContextStore` now also carries the current adaptive `ExecutionPlan` so later orchestrator stages can read the planner result without changing outward contracts.
- Adaptive mode now instantiates `SessionMemory`, which extends the shared-store contract with Finding/Hypothesis lifecycle storage while keeping bridge APIs available for legacy-parity code paths.

## Compatibility Pattern
- Existing APIs like `buildSynthesizerPrompt()` and legacy tests were left intact where possible.
- New pipeline capabilities were added alongside existing orchestration rather than replacing everything wholesale.
- Review entry points now route by feature flag, so adaptive and legacy pipelines coexist without changing outward `ReviewResult` contracts.
