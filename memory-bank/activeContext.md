# Active Context

## Current Focus
Implementing the `review-quality-enhancement` spec under `.kiro/specs/review-quality-enhancement/`.

## Recent Changes
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
- Consider extending the same enhanced pipeline to merged-branch review if desired.
- Clean up legacy self-audit/synthesis code once no longer needed.
