# Tech Context

## Stack
- TypeScript with `strict` mode.
- VS Code extension APIs.
- Custom LLM adapter abstraction for OpenAI, Claude, Gemini, Ollama, and compatible endpoints.
- Test stack uses `vscode-test`, Mocha-style suites, and ESLint.

## Key Files
- `src/services/llm/orchestrator/*` for multi-agent orchestration.
- `src/commands/reviewMerge/*` and `src/commands/reviewStagedChanges/*` for review entrypoints.
- `src/prompts/*` and `publish-files/review/*` for prompt/output contracts.
- `src/test/adaptivePipelinePhase1.test.ts`, `src/test/adaptivePipelinePhase2.test.ts`, `src/test/adaptivePipelinePhase3.test.ts`, and `src/test/adaptivePipelineContracts.test.ts` for adaptive-pipeline verification.

## Verification Commands
- `npm run compile`
- `npm run lint`
- `npm test`
- `npm run benchmark:pipeline:baseline`
- `npm run benchmark:tokens`
- `npm run benchmark:renderer`
- Targeted Mocha runs may fail outside the VS Code test host because some compiled modules import `vscode`.

## Current Tooling Notes
- Lint currently reports pre-existing warnings in sidebar-related files and a couple of unused eslint directives.
- `npm run compile` and `npm run lint` pass after the adaptive-pipeline Phase 1 changes in this session.
- `npm test` now passes in the VS Code test host after the adaptive-pipeline Phase 3 completion work, currently at `225 passing`.
