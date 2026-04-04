# System Patterns

## Architecture
- Command layer opens webviews and instantiates review services.
- Review services prepare adapter, diff, reference context, dependency graph, and agent prompts.
- `ContextOrchestratorService` and `MultiAgentExecutor` run multi-agent pipelines.
- `SharedContextStore` is the in-session blackboard for tool cache, findings, dependency graph, and risk hypotheses.

## Review Pipeline Pattern
1. Pre-analysis builds dependency graph and reference context.
2. Phase 1 runs review agents in parallel.
3. Structured self-audit refines agent output.
4. Risk hypotheses feed the Observer phase.
5. Phase 3 synthesis agents write report sections in parallel.
6. Deterministic merge assembles the final markdown report.

## Memory Pattern
- `ReviewMemoryService` persists pattern memory, suppression memory, review history, and resolution stats via `workspaceState`.
- Prompt builders can inject previous patterns/history into review agents.

## Compatibility Pattern
- Existing APIs like `buildSynthesizerPrompt()` and legacy tests were left intact where possible.
- New pipeline capabilities were added alongside existing orchestration rather than replacing everything wholesale.
