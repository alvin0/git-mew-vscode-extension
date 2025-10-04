# Active Context: Git Mew

## Current Status
**Project State:** Initial release (v0.0.1) - Feature complete and functional  
**Last Updated:** 2025-10-04  
**Active Work:** Documenting new "Review Merge" feature

## Recent Changes
- Added "Review Merge" command to generate AI-powered code reviews for branches.
- Implemented a webview UI for selecting branches, models, and languages.
- Added support for custom review rules via `.gitmew/systemprompt.review-merge.md` and `.gitmew/code-review-rule.md`.
- Refactored the `reviewMerge` module for better separation of concerns.
- Added Ollama support.

## What's Working

### Core Functionality ✅
- **Commit Message Generation:** Fully functional with OpenAI, Claude, Gemini.
- **Code Review Generation:** Fully functional for branch diffs.
- **Multi-Provider Support:** OpenAI, Claude, Gemini, and Ollama all working.
- **Configuration Flow:** 3-step setup for commit generation, separate config for code review.
- **Git Integration:** Seamless integration with VS Code SCM panel and branch operations.
- **Binary Detection:** Advanced FileTypeDetector with multiple heuristics.
- **Security:** API keys stored in VS Code Secret Storage.

### User Experience ✅
- **Auto-Configuration:** Detects missing config and guides setup
- **Progress Indicators:** Shows progress during generation
- **Error Handling:** Clear, actionable error messages
- **Quick Access:** Sparkle icon in Source Control panel

### Technical Implementation ✅
- **Adapter Pattern:** Clean abstraction for LLM providers
- **Service Layer:** Separation of concerns (Git, Config, LLM)
- **Type Safety:** Full TypeScript with strict mode
- **No External Dependencies:** Uses only VS Code and Node.js APIs

## Current Focus
**Memory Bank Initialization** - Documenting project for AI agent continuity

## Next Steps

### Immediate (If Requested)
1. Complete remaining Memory Bank files:
   - `progress.md` - Track what's built and what's left
   - Any additional context files if needed

### Future Enhancements (Not Currently Planned)
1. **Custom Templates:** Allow users to define commit message format
2. **Multi-Repository:** Support multiple Git repositories
3. **History Learning:** Learn from user's commit history
4. **Offline Mode:** Support local LLM models
5. **Team Conventions:** Share configuration across team

## Active Decisions & Patterns

### Architectural Decisions
1. **No External HTTP Libraries:** Use native fetch for simplicity
2. **Adapter Pattern:** Easy to add new LLM providers
3. **Progressive Enhancement:** Auto-setup if configuration missing
4. **Fail Fast:** No retry logic, let user retry manually

### Code Patterns
1. **Service Layer:** All business logic in services, not extension.ts
2. **Type Safety:** Explicit types for all functions and variables
3. **Error Boundaries:** Try-catch at command level with user messages
4. **Single Responsibility:** Each class/function has one clear purpose

### User Experience Patterns
1. **Guided Setup:** Step-by-step with clear titles
2. **Visual Indicators:** Icons (✓, ✗, ⚠) in messages
3. **Context Preservation:** Show current selection in Quick Picks
4. **Non-Blocking:** Progress notifications, not modal dialogs

## Important Learnings

### Binary File Detection
- Git's binary detection is unreliable for edge cases
- Need multi-layered approach: markers → size → buffer analysis → fallback
- 100KB threshold works well for catching minified files
- FileTypeDetector provides confidence scores

### LLM Provider Differences
- **OpenAI:** Uses chat completions with messages array
- **Claude:** Uses messages API with separate system parameter
- **Gemini:** Uses generateContent with contents array
- All require different authentication methods

### VS Code Extension Patterns
- Secret Storage is the right place for API keys
- Git Extension API is stable and reliable
- Progress notifications better than status bar for long operations
- Command palette integration is essential

### Configuration Management
- Store provider/model in settings (visible, shareable)
- Store API keys in secrets (encrypted, private)
- Cache adapter instance for performance
- Clear cache when configuration changes

## Known Issues & Limitations

### Current Limitations
1. **Single Repository:** Only works with first repo in workspace
2. **No Streaming:** Waits for complete response
3. **Fixed Endpoints:** Can't use custom API endpoints
4. **No Rate Limiting:** Relies on provider limits

### Edge Cases Handled
- ✅ No staged files → Warning message
- ✅ Missing configuration → Auto-setup flow
- ✅ Binary files → Detected and labeled
- ✅ Large diffs → Size check before processing
- ✅ Network timeout → 30 second limit with AbortController

### Edge Cases Not Handled
- ⚠️ Multiple repositories in workspace
- ⚠️ Very large text files (>100KB)
- ⚠️ Custom API endpoints
- ⚠️ Proxy configurations

## Development Environment

### Active Tools
- **VS Code:** Primary development environment
- **TypeScript:** Language with strict mode
- **ESLint:** Code quality and consistency
- **Git:** Version control

### Testing Approach
- Manual testing in Extension Development Host
- Test all three providers with real API keys
- Test error scenarios (no API key, network issues)
- Test various file types (text, binary, large)

## Project Insights

### What Makes This Project Unique
1. **Zero Dependencies:** No npm packages beyond dev tools
2. **Multi-Provider:** Not locked to single AI provider
3. **Security First:** API keys never exposed
4. **Developer UX:** Integrated into existing Git workflow

### Design Philosophy
- **Simplicity:** Do one thing well (generate commit messages)
- **Flexibility:** Support multiple AI providers
- **Security:** Protect user credentials
- **Integration:** Feel native to VS Code

### Success Metrics
- Users can generate commit messages in <5 seconds
- Setup takes <2 minutes
- Messages follow conventional commit format
- No security incidents with API keys

## Communication Preferences

### When Documenting
- Use clear, technical language
- Include code examples where helpful
- Explain "why" not just "what"
- Link related concepts

### When Implementing
- Follow existing patterns
- Maintain type safety
- Add comments for complex logic
- Update documentation when changing behavior

## Memory Bank Status
- ✅ `projectbrief.md` - Created
- ✅ `productContext.md` - Created
- ✅ `systemPatterns.md` - Created
- ✅ `techContext.md` - Created
- ✅ `activeContext.md` - Created (this file)
- ✅ `progress.md` - Created
- ✅ README.md - Updated with correct model versions