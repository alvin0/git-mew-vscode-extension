# Change Log

## [0.0.6] - 2025-10-06

### Fixed
- **File Path References**: Updated `publishCommand.ts` to reference the new `publish-files` location

## [0.0.5] - 2025-10-06

### Improved
- Fix bug and improve

## [0.0.4] - 2025-10-05

### Added
- **Publish Command**: New `git-mew: Publish Files` command to easily copy template files to `.gitmew/` folder
- **MR Description Generation**: Generate professional merge request descriptions alongside code reviews
- **Smart Template Selection**: Automatic routing between default, release, and hotfix templates based on branch names and context
- **Description System Prompt**: New customizable template file `system-prompt.description-merge.md`
- **Task Context Support**: Optional task/issue context field in webview for better AI understanding
- **Auto-Reload Prompt**: Extension now prompts users to reload window after updates
- **Enhanced Webview UI**: Added "Generate Description" button alongside "Generate Review"

### Improved
- **Error Handling**: Better API key management with inline prompts during workflow
- **Configuration Management**: Separate settings for review/description independent from commit generation
- **User Experience**: More intuitive webview interface with clearer action buttons
- **Documentation**: Updated README with MR description feature and publish command usage


## [0.0.3] - 2025-10-05

### Fixed
- Fix bug and improve

## [0.0.2] - 2025-10-05

### Added
- Add feature review merge request

### Fixed
- Fix bug and improve

## [0.0.1] - 2025-10-04

### Added
- Initial release of Git Mew
- AI-powered commit message generation from staged Git changes
- Support for multiple LLM providers:
  - OpenAI (GPT-4, GPT-3.5 Turbo)
  - Anthropic Claude (Claude 3 Opus, Sonnet, Haiku)
  - Google Gemini (Gemini Pro)
- Source Control panel integration with sparkle icon button
- Setup wizard for configuring AI provider and model
- Secure API key storage using VS Code's secret storage
- Conventional commit message format support
- Configuration settings for provider and model selection
- File type detection for better context analysis