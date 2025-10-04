# Git Mew 🐱

Your AI kitty for Git chaos - Generate intelligent commit messages using AI.

## Features

Git Mew helps you write better commit messages by analyzing your staged changes and generating meaningful, conventional commit messages using AI.

### Key Features

- 🤖 **AI-Powered Commit Messages**: Automatically generate commit messages based on your staged changes.
- 🔍 **AI-Powered Code Review**: Generate comprehensive code reviews for merge requests/pull requests by comparing any two branches.
- 🎯 **Multiple LLM Providers**: Support for OpenAI, Claude, Gemini, and Ollama.
- ⚡ **Quick Access**: Generate commit messages directly from the Source Control panel.
- 🎨 **Conventional Commits & Rich Reviews**: Follows conventional commit format and generates detailed code review reports.
- 🔧 **Customizable**: Configure your preferred AI model and provider for both commit generation and code review.
- 📝 **Custom Rules**: Define project-specific rules for both commit messages and code reviews.
- 🌍 **Multi-Language Support**: Get code reviews in your preferred language.

### How to Use

#### Generating Commit Messages
1. Stage your changes in Git.
2. Click the sparkle icon (✨) in the Source Control panel, or run the command `git-mew: Generate Commit Message`.
3. Git Mew will analyze your changes and generate a commit message.
4. Review and commit!

#### Generating a Code Review
1. Ensure you have committed your changes to your feature branch.
2. Run the command `git-mew: Review Merge`.
3. A webview will open. Select your base branch (e.g., `main`) and your compare branch (your feature branch).
4. Choose your preferred LLM provider, model, and output language.
5. Click "Generate Review".
6. A detailed code review report will open in a new tab.

## Requirements

- Visual Studio Code 1.104.0 or higher
- Git installed and configured
- API key for your chosen LLM provider (OpenAI, Claude, or Gemini)

## Setup

1. Install the extension
2. Run the command `git-mew: Setup Model` to configure your AI provider
3. Select your preferred LLM provider (OpenAI, Claude, or Gemini)
4. Enter your API key when prompted
5. Choose your preferred model

## Customizing Rules

Git Mew allows you to customize how AI generates content by creating rule files in a `.gitmew` folder in your repository root.

### Customizing Commit Message Rules

1.  Create a file: `.gitmew/systemprompt.generate-commit.md`
2.  Define your custom commit message rules in this file. The AI will use these instructions instead of the default prompt.

### Customizing Code Review Rules

You can customize the code review process at two levels:

1.  **Custom System Prompt**: To completely replace the default review instructions, create `.gitmew/systemprompt.review-merge.md`. This file gives you full control over the AI's persona, structure, and output format.

2.  **Custom Review Rules**: To add specific, project-level rules *on top of* the default system prompt, create `.gitmew/code-review-rule.md`. This is useful for defining project-specific conventions, style guides, or areas to check.

**Example structure:**
```
your-project/
├── .gitmew/
│   ├── systemprompt.generate-commit.md  # Custom rules for commit messages
│   ├── systemprompt.review-merge.md     # (Optional) Overrides default review prompt
│   └── code-review-rule.md              # (Optional) Adds specific rules to the review
├── src/
└── ...
```

## Extension Settings

This extension contributes the following settings:

* `git-mew.llmProvider`: Select the default LLM provider (openai, claude, gemini, or ollama).
* `git-mew.llmModel.openai`: Default OpenAI model to use.
* `git-mew.llmModel.claude`: Default Claude model to use.
* `git-mew.llmModel.gemini`: Default Gemini model to use.
* `git-mew.reviewMerge.provider`: (Internal) Stores the last used provider for Review Merge.
* `git-mew.reviewMerge.model`: (Internal) Stores the last used model for Review Merge.
* `git-mew.reviewMerge.language`: (Internal) Stores the last used language for Review Merge.

## Supported LLM Providers

### OpenAI
- GPT-5, GPT-5 Mini, GPT-5 Nano, GPT-4.1

### Anthropic Claude
- Claude Sonnet 4.5

### Google Gemini
- Gemini 2.5 Pro, Gemini 2.5 Flash

### Ollama
- Supports any model you have running locally.

## Privacy & Security

- Your API keys are stored securely in VS Code's secret storage
- Your code is only sent to the AI provider you choose
- No data is collected or stored by Git Mew

## Known Issues

- Large diffs may take longer to process
- Some binary file changes may not be analyzed properly

## Release Notes

### 0.0.1

Initial release of Git Mew:
- AI-powered commit message generation
- Support for OpenAI, Claude, and Gemini
- Conventional commit format
- Source Control panel integration

## Contributing

Found a bug or have a feature request? Please open an issue on our [GitHub repository](https://github.com/git-mew/git-mew).

## License

See LICENSE file for details.

---

**Enjoy using Git Mew! 🐱✨**
