# Active Context: Git Mew

## Current Status
**Project State:** v0.0.4 - Stable Release
**Last Updated:** 2025-10-05
**Active Work:** Documentation maintenance and memory bank updates.

## Recent Changes (v0.0.4)
- ✅ Added "Publish" command (`git-mew.publish`) to copy template files to `.gitmew/` folder
- ✅ Added MR Description generation feature alongside code review
- ✅ Implemented smart template selection (default, release, hotfix) for MR descriptions
- ✅ Added `system-prompt.description-merge.md` template file
- ✅ Enhanced webview UI with description generation capability
- ✅ Added automatic window reload prompt after extension updates
- ✅ Improved configuration management with separate settings for review merge
- ✅ Added support for task context in review and description generation
- ✅ Enhanced error handling with API key prompts in webview flow

## What's Working

### Core Functionality ✅
- **Commit Message Generation:** Fully functional with OpenAI, Claude, Gemini, Ollama
- **Code Review Generation:** Comprehensive branch diff analysis with quality assessment
- **MR Description Generation:** Smart template-based descriptions (default, release, hotfix)
- **Multi-Provider Support:** OpenAI, Claude, Gemini, and Ollama all working
- **Configuration Flow:** 3-step setup for commit generation, separate config for review/description
- **Git Integration:** Seamless integration with VS Code SCM panel and branch operations
- **Binary Detection:** Advanced FileTypeDetector with multiple heuristics
- **Security:** API keys stored in VS Code Secret Storage
- **Custom Rules:** Support for project-specific prompts and rules via `.gitmew/` folder

### User Experience ✅
- **Auto-Configuration:** Detects missing config and guides setup
- **Progress Indicators:** Shows progress during generation
- **Error Handling:** Clear, actionable error messages with inline API key prompts
- **Quick Access:** Sparkle icon and merge icon in Source Control panel
- **Publish Command:** Easy template file distribution to projects
- **Auto-Reload:** Prompts for window reload after extension updates
- **Webview UI:** Rich interface for branch/model/language selection

### Technical Implementation ✅
- **Adapter Pattern:** Clean abstraction for LLM providers
- **Service Layer:** Separation of concerns (Git, Config, LLM, ReviewMerge)
- **Type Safety:** Full TypeScript with strict mode
- **No External Dependencies:** Uses only VS Code and Node.js APIs (except markdown rendering)
- **Modular Architecture:** Clear separation in reviewMerge module

## Current Focus
**Documentation Maintenance** - Keeping memory bank, README, and CHANGELOG synchronized with v0.0.4 features

## Next Steps

### Immediate
1. ✅ Update memory bank with v0.0.4 features
2. ✅ Update README with MR description generation
3. ✅ Update CHANGELOG with detailed v0.0.4 changes

### Future Enhancements (Not Currently Planned)
1. **Automated Testing:** Add unit and integration tests
2. **Marketplace Publishing:** Package and publish extension
3. **Multi-Repository:** Support multiple Git repositories
4. **Streaming Responses:** Real-time generation feedback
5. **Team Conventions:** Share configuration across team
6. **Custom API Endpoints:** Support for self-hosted LLM services

## Active Decisions & Patterns

### Architectural Decisions
1. **No External HTTP Libraries:** Use native fetch for simplicity
2. **Adapter Pattern:** Easy to add new LLM providers
3. **Progressive Enhancement:** Auto-setup if configuration missing
4. **Fail Fast:** No retry logic, let user retry manually
5. **Separate Configurations:** Review/Description settings independent from commit generation
6. **Template-Based Generation:** Smart routing for MR descriptions (default/release/hotfix)

### Code Patterns
1. **Service Layer:** All business logic in services, not extension.ts
2. **Type Safety:** Explicit types for all functions and variables
3. **Error Boundaries:** Try-catch at command level with user messages
4. **Single Responsibility:** Each class/function has one clear purpose
5. **Modular Commands:** Each feature in its own command file
6. **Webview Separation:** Content generation, message handling, and service logic separated

### User Experience Patterns
1. **Guided Setup:** Step-by-step with clear titles
2. **Visual Indicators:** Icons (✓, ✗, ⚠) in messages
3. **Context Preservation:** Show current selection in Quick Picks
4. **Non-Blocking:** Progress notifications, not modal dialogs
5. **Inline API Key Prompts:** Request keys during workflow if missing
6. **Template Publishing:** Easy distribution of customization files

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
- **Ollama:** Local models, no API key required, streaming support
- All require different authentication methods

### VS Code Extension Patterns
- Secret Storage is the right place for API keys
- Git Extension API is stable and reliable
- Progress notifications better than status bar for long operations
- Command palette integration is essential
- Webview for complex UIs provides better UX than Quick Picks
- Extension updates should prompt for reload

### Configuration Management
- Store provider/model in settings (visible, shareable)
- Store API keys in secrets (encrypted, private)
- Cache adapter instance for performance
- Clear cache when configuration changes
- Separate configs for different features (commit vs review) improves UX

### Template-Based Generation
- Smart routing based on branch names and context improves relevance
- Three templates (default, release, hotfix) cover most use cases
- Language detection from task context enhances localization
- Custom prompts allow project-specific adaptations

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
- ✅ `projectbrief.md` - Updated to v0.0.4
- ✅ `productContext.md` - Updated with MR description feature
- ✅ `systemPatterns.md` - Updated with new patterns
- ✅ `techContext.md` - Updated with new dependencies
- ✅ `activeContext.md` - Updated (this file)
- ✅ `progress.md` - Updated with v0.0.4 completion
- ✅ README.md - Updated with all features
- ✅ CHANGELOG.md - Updated with v0.0.4 details