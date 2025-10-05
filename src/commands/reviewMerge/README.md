# Review Merge Module

This module handles the "Review Merge" functionality, which allows users to generate AI-powered code reviews for comparing two Git branches.

## Core Functionality

- **Webview Interface**: Provides a user-friendly webview to select base and compare branches, LLM provider, model, and output language.
- **AI-Powered Review**: Analyzes the diff between the selected branches and generates a comprehensive code review report.
- **Custom Rules**: Supports project-specific review guidelines through `.gitmew/system-prompt.review-merge.md` and `.gitmew/code-review-rule.md`.
- **Multi-Provider Support**: Integrates with OpenAI, Claude, Gemini, and Ollama.
- **Configuration Management**: Saves the user's last-used settings for convenience.

## Architecture

The module is structured with a clear separation of concerns:

- **`reviewMergeCommand.ts`**: Registers the VS Code command, initializes the webview panel, and orchestrates the overall flow.
- **`webviewContentGenerator.ts`**: Generates the dynamic HTML, CSS, and client-side JavaScript for the webview UI.
- **`webviewMessageHandler.ts`**: Handles all communication from the webview (e.g., user clicks "Generate Review") and coordinates with the `ReviewMergeService`.
- **`reviewMergeService.ts`**: Contains the core business logic for generating the review. It fetches the branch diff, builds the prompt (including custom rules), calls the appropriate LLM adapter, and handles the response.
- **`modelProvider.ts`**: Fetches the list of available models for each LLM provider, including dynamically fetching models from a local Ollama instance.
- **`index.ts`**: Serves as the main export file for the module, making components available to the rest of the extension.

## User Flow

1.  User executes the `git-mew: Review Merge` command.
2.  `reviewMergeCommand.ts` creates a webview panel.
3.  `webviewContentGenerator.ts` builds the HTML for the UI, populated with branches and available models from `modelProvider.ts`.
4.  User makes selections in the webview and clicks "Generate Review".
5.  A message is sent from the webview to `webviewMessageHandler.ts`.
6.  The message handler calls `reviewMergeService.ts` with the user's selections.
7.  `reviewMergeService.ts` uses `GitService` to get the branch diff and read any custom rule files.
8.  It constructs a detailed prompt and uses the selected LLM adapter to generate the code review.
9.  The resulting review is displayed in a new editor tab.

## Dependencies

- **`vscode`**: For UI elements like webviews, commands, and notifications.
- **`GitService`**: For all Git-related operations (fetching branches, getting diffs).
- **`LLMService`**: For accessing configured LLM providers and API keys.
- **`ReviewMergeConfigManager`**: For persisting the user's selections (provider, model, language) specifically for this feature.
- **LLM Adapters**: To communicate with the various supported AI services (OpenAI, Claude, Gemini, Ollama).