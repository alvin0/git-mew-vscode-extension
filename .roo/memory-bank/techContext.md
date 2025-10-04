# Technical Context: Git Mew

## Technology Stack

### Core Technologies
- **Language:** TypeScript 5.9.3
- **Platform:** VS Code Extension API 1.104.0+
- **Runtime:** Node.js 22.x
- **Build Tool:** TypeScript Compiler (tsc)

### Development Dependencies
```json
{
  "@types/vscode": "^1.104.0",
  "@types/mocha": "^10.0.10",
  "@types/node": "22.x",
  "@typescript-eslint/eslint-plugin": "^8.45.0",
  "@typescript-eslint/parser": "^8.45.0",
  "eslint": "^9.36.0",
  "typescript": "^5.9.3",
  "@vscode/test-cli": "^0.0.11",
  "@vscode/test-electron": "^2.5.2"
}
```

### Runtime Dependencies
**None** - Extension uses only:
- VS Code built-in APIs
- Node.js standard library
- Native fetch API (no axios/node-fetch)

## Project Structure

```
git-mew/
├── src/
│   ├── extension.ts              # Entry point, command registration
│   ├── commands/
│   │   ├── generateCommitCommand.ts
│   │   ├── reviewMergeCommand.ts
│   │   └── setupModelCommand.ts
│   │   └── reviewMerge/
│   │       ├── index.ts
│   │       ├── modelProvider.ts
│   │       ├── reviewMergeService.ts
│   │       ├── webviewContentGenerator.ts
│   │       └── webviewMessageHandler.ts
│   ├── services/
│   │   ├── llm/
│   │   │   ├── LLMService.ts
│   │   │   ├── LLMConfigManager.ts
│   │   │   └── ReviewMergeConfigManager.ts
│   │   └── utils/
│   │       ├── gitService.ts
│   │       └── fileTypeDetector.ts
│   ├── llm-adapter/
│   │   ├── index.ts
│   │   ├── adapterInterface.ts
│   │   ├── claude/
│   │   ├── openai/
│   │   ├── gemini/
│   │   └── ollama/
│   ├── prompts/
│   │   ├── systemPromptGenerateCommit.ts
│   │   └── systemPromptGenerateReviewMerge.ts
│   └── test/
│       └── extension.test.ts
├── resources/
│   └── images/
│       └── logo.png
├── out/                          # Compiled JavaScript (gitignored)
├── .vscode/                      # VS Code workspace settings
├── .roo/                         # Memory Bank & rules
│   ├── memory-bank/
│   └── rules/
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript configuration
├── eslint.config.mjs             # ESLint configuration
└── README.md                     # User documentation
```

## Build & Development

### Build Commands
```bash
npm run compile        # Compile TypeScript to JavaScript
npm run watch          # Watch mode for development
npm run lint           # Run ESLint
npm run test           # Run tests
npm run vscode:prepublish  # Pre-publish build
```

### TypeScript Configuration
- **Target:** ES2022
- **Module:** CommonJS (for Node.js compatibility)
- **Strict Mode:** Enabled
- **Output:** `./out` directory
- **Source Maps:** Enabled for debugging

### Development Workflow
1. Make changes in `src/`
2. Run `npm run watch` for auto-compilation
3. Press F5 in VS Code to launch Extension Development Host
4. Test changes in the development instance
5. Check console for errors/logs

## VS Code Extension APIs Used

### Core APIs
- **vscode.commands:** Command registration and execution
- **vscode.window:** UI elements (QuickPick, InputBox, notifications)
- **vscode.workspace:** Configuration management
- **vscode.ExtensionContext:** Extension lifecycle and storage
- **vscode.SecretStorage:** Secure API key storage

### Git Extension API
- **vscode.extensions.getExtension('vscode.git'):** Access Git extension
- **git.getAPI(1):** Get Git API instance
- **repository.state:** Access staged/unstaged changes
- **repository.diffIndexWithHEAD():** Get file diffs
- **repository.inputBox:** Set commit message

### Progress API
- **vscode.window.withProgress():** Show progress notifications
- **vscode.ProgressLocation.Notification:** Progress in notification area

## LLM Provider APIs

### OpenAI API
- **Endpoint:** `https://api.openai.com/v1/chat/completions`
- **Authentication:** Bearer token in Authorization header
- **Models:**
  - GPT-5 (gpt-5-2025-08-07)
  - GPT-5 Mini (gpt-5-mini-2025-08-07)
  - GPT-5 Nano (gpt-5-nano-2025-08-07)
  - GPT-4.1 (gpt-4.1-2025-04-14)
- **Request Format:** Chat completion with messages array
- **Response:** JSON with choices array

### Claude API (Anthropic)
- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **Authentication:** x-api-key header
- **API Version:** anthropic-version header (2023-06-01)
- **Models:** Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)
- **Request Format:** Messages with system parameter
- **Response:** JSON with content array

### Gemini API (Google)
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **Authentication:** API key in URL parameter
- **Models:**
  - Gemini 2.5 Pro (gemini-2.5-pro)
  - Gemini 2.5 Flash (gemini-2.5-flash-preview-09-2025)
- **Request Format:** Contents array with parts
- **Response:** JSON with candidates array

### Ollama API
- **Endpoint:** User-configurable (e.g., `http://localhost:11434/api/generate`)
- **Authentication:** None
- **Models:** Any model supported by the user's Ollama instance
- **Request Format:** Generate with prompt and model name
- **Response:** Streamed JSON objects with `response` field

## Configuration Storage

### VS Code Settings (settings.json)
```json
{
  "git-mew.llmProvider": "openai|claude|gemini",
  "git-mew.llmModel.openai": "gpt-5",
  "git-mew.llmModel.claude": "claude-sonnet-4.5",
  "git-mew.llmModel.gemini": "gemini-2.5-pro"
}
```

### Secret Storage (Encrypted)
```
Key: llmApiKey.openai
Key: llmApiKey.claude
Key: llmApiKey.gemini
```

## Error Handling

### Network Errors
- **Timeout:** 30 seconds default (configurable)
- **AbortController:** Used for request cancellation
- **Retry Logic:** None (fail fast, user can retry)

### API Errors
- **401 Unauthorized:** Invalid API key
- **429 Rate Limit:** Too many requests
- **500 Server Error:** Provider service issues
- **Network Error:** Connection issues

### User-Facing Messages
```typescript
// Success
vscode.window.showInformationMessage('✓ Message')

// Warning (recoverable)
vscode.window.showWarningMessage('⚠ Message')

// Error (requires action)
vscode.window.showErrorMessage('✗ Message')
```

## Performance Considerations

### Binary File Detection
- **Max Diff Size:** 100KB before marking as binary
- **Buffer Analysis:** Only on text-like files
- **Caching:** FileTypeDetector results not cached (stateless)

### API Calls
- **No Caching:** Each generation is a fresh API call
- **Timeout:** 30 seconds to prevent hanging
- **Streaming:** Not supported (complete response only)

### Memory Management
- **Adapter Caching:** Single adapter instance per session
- **Configuration:** Loaded on-demand, cached in service
- **Diffs:** Loaded per-file, not kept in memory

## Security Considerations

### API Key Storage
- ✅ Stored in VS Code Secret Storage (encrypted)
- ✅ Never logged or displayed in UI
- ✅ Cleared on configuration reset
- ✅ Per-provider isolation

### Code Transmission
- ⚠️ Staged changes sent to AI provider
- ⚠️ User must trust their chosen provider
- ✅ No data sent to Git Mew servers (none exist)
- ✅ Binary files excluded from transmission

### Input Validation
- ✅ API key presence validated
- ✅ Provider selection validated
- ✅ Model selection validated
- ⚠️ Diff content not sanitized (trusted from Git)

## Testing Strategy

### Unit Tests
- Location: `src/test/extension.test.ts`
- Framework: Mocha
- Runner: `@vscode/test-electron`

### Manual Testing Checklist
1. Install extension in development mode
2. Test setup flow for each provider
3. Test commit generation with various file types
4. Test binary file detection
5. Test error scenarios (no API key, network error)
6. Test configuration persistence

## Deployment

### Package Extension
```bash
npm run vscode:prepublish
vsce package
```

### Publishing
- **Marketplace:** VS Code Marketplace
- **Publisher:** GitMew
- **Version:** Semantic versioning (0.0.1)

## Development Constraints

### VS Code Version
- **Minimum:** 1.104.0
- **Reason:** Uses latest Secret Storage API

### Node.js Version
- **Target:** 22.x
- **Reason:** Native fetch API support

### TypeScript Version
- **Version:** 5.9.3
- **Reason:** Latest stable with best type inference

## Known Technical Limitations

1. **Single Repository:** Only works with first repository in workspace
2. **No Streaming:** Complete response only (no partial updates)
3. **No Offline Mode:** Requires internet connection
4. **No Custom Endpoints:** Fixed API endpoints per provider
5. **No Rate Limiting:** Relies on provider's rate limits