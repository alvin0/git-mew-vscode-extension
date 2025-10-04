# System Patterns: Git Mew

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code Extension                     │
├─────────────────────────────────────────────────────────┤
│  extension.ts (Entry Point)                             │
│  ├─ Command: git-mew.generate-commit                    │
│  ├─ Command: git-mew.setupModel                         │
│  └─ Command: git-mew.review-merge (Webview)              │
└─────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
 ┌───────▼────────┐                 ┌────────▼────────┐
 │  GitService    │                 │ LLMService      │
 │                │                 │                 │
 │ - Get staged   │                 │ - Provider mgmt │
 │ - Get diffs    │                 │ - API key store │
 │ - Detect binary│                 │ - Model select  │
 │ - Format output│                 │ - Generate text │
 └────────────────┘                 └────────┬────────┘
                                              │
                            ┌─────────────────┴─────────────────┐
                            │      LLM Adapter Layer            │
                            │  (Unified Interface Pattern)      │
                            └─────────────────┬─────────────────┘
                                              │
                      ┌───────────────────────┼──────────────────────────┐
                      │                       │                          │
              ┌───────▼────────┐    ┌────────▼────────┐        ┌─────────▼─────────┐
              │ OpenAIAdapter  │    │ ClaudeAdapter   │        │ GeminiAdapter     │
              │                │    │                 │        │                   │
              │ - GPT-5/4.1    │    │ - Claude 4.5    │        │ - Gemini 2.5 Pro  │
              │ - Chat API     │    │ - Messages API  │        │ - Generate API    │
              └────────────────┘    └─────────────────┘        └───────────────────┘
                                                                         │
                                                                 ┌───────▼────────┐
                                                                 │ OllamaAdapter  │
                                                                 │                │
                                                                 │ - Local models │
                                                                 └────────────────┘
```

## Core Design Patterns

### 1. Adapter Pattern (LLM Providers)
**Purpose:** Provide unified interface for different AI providers

**Implementation:**
- `ILLMAdapter` interface defines contract
- Each provider implements the interface
- Factory function `createAdapter()` instantiates correct adapter
- All adapters support: `initialize()`, `generateText()`, `isReady()`, `testConnection()`

**Benefits:**
- Easy to add new providers
- Consistent error handling
- Swappable implementations
- Testable in isolation

### 2. Service Layer Pattern
**Purpose:** Separate business logic from VS Code API

**Services:**
- **GitService:** Git operations (staging, diffs, file detection)
- **LLMConfigService:** Configuration management and text generation
- **FileTypeDetector:** Binary file detection logic

**Benefits:**
- Clear separation of concerns
- Reusable business logic
- Easier testing
- Independent evolution

### 3. Configuration Management Pattern
**Purpose:** Secure, hierarchical configuration storage

**Storage Layers:**
1. **VS Code Settings:** Provider and model selection (workspace/global)
2. **Secret Storage:** API keys (encrypted, per-provider)
3. **Runtime Cache:** Initialized adapter instance

**Configuration Flow:**
```
User Input → Validation → Storage → Adapter Initialization → Cached Instance
```

### 4. Progressive Enhancement Pattern
**Purpose:** Graceful handling of missing configuration

**Flow:**
1. User triggers generate command
2. Check for staged files → Warn if none
3. Check for configuration → Auto-setup if missing
4. Generate commit message
5. Insert into SCM input box

## Key Technical Decisions

### Binary File Detection
**Decision:** Use advanced FileTypeDetector with multiple heuristics

**Rationale:**
- Git's binary detection can be unreliable
- Need to handle edge cases (minified files, large diffs)
- Prevent sending binary data to AI

**Implementation:**
```typescript
// Multi-layered detection:
1. Check for Git binary markers
2. Check diff size (>100KB = likely binary)
3. Use FileTypeDetector with buffer analysis
4. Fallback to null byte detection
```

### Diff Formatting
**Decision:** Categorize changes by type (Add/Edit/Remove)

**Format:**
```markdown
# Files Add:
## path/to/file
### Description Change
```diff
[diff content]
```

# Files Edit:
[similar structure]

# Files Remove:
[similar structure]
```

**Rationale:**
- Clear structure for AI to parse
- Matches conventional commit categories
- Easy to understand at a glance

### API Key Security
**Decision:** Use VS Code Secret Storage API

**Implementation:**
- Keys stored per-provider: `llmApiKey.{provider}`
- Never logged or displayed
- Encrypted by VS Code
- Cleared on configuration reset

### Error Handling Strategy
**Layers:**
1. **Adapter Level:** Timeout, network errors, API errors
2. **Service Level:** Configuration errors, Git errors
3. **Extension Level:** User-facing messages, fallback flows

**User Experience:**
- Informational messages for success
- Warning messages for recoverable issues
- Error messages with actionable guidance

## Critical Code Paths

### Path 1: Generate Commit Message
```
User clicks sparkle icon
  → Check staged files (GitService)
  → Check configuration (LLMConfigService)
  → Get formatted changes (GitService)
  → Generate text (LLMAdapter)
  → Set commit message (GitService)
  → Show success message
```

### Path 2: Setup Configuration
```
User runs setup command
  → Select provider (Quick Pick)
  → Check existing API key
  → Prompt for API key if needed
  → Select model (Quick Pick)
  → Clear adapter cache
  → Show success message
```

### Path 3: Binary File Detection
```
Get staged file diff
  → Check for Git binary markers
  → Check diff size
  → Convert to buffer
  → Run FileTypeDetector
  → Return binary flag
  → Replace diff with "Binary file" if true
```

## Component Relationships

### GitService Dependencies
- VS Code Git Extension API
- FileTypeDetector (for binary detection)
- No dependencies on LLM layer

### LLMConfigService Dependencies
- VS Code Configuration API
- VS Code Secret Storage API
- LLM Adapter Layer (via factory)
- System prompt from prompts module

### LLM Adapters Dependencies
- Native fetch API (no external HTTP libraries)
- AbortController for timeouts
- Provider-specific API endpoints

## Extension Points

### Adding New LLM Provider
1. Create adapter class implementing `ILLMAdapter`
2. Add provider to `LLMProvider` type
3. Add models to constants
4. Update factory function
5. Add to configuration UI

### Customizing Commit Format
1. Modify `SYSTEM_PROMPT_GENERATE_COMMIT`
2. Adjust diff formatting in `GitService.getFormattedStagedChanges()`
3. Update validation rules if needed

### Adding New Commands
1. Register command in `package.json`
2. Implement handler in `extension.ts`
3. Add to subscriptions
4. Update documentation