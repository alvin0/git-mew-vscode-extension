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

## Verification Commands
- `npm run compile`
- `npm run lint`
- `npm test`

## Current Tooling Notes
- Lint currently reports pre-existing warnings in sidebar-related files and a couple of unused eslint directives.
- Compile and tests pass after the review-quality-enhancement changes in this session.
