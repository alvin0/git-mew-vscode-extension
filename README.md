# Git Mew 🐱

Your AI kitty for Git chaos - Generate intelligent commit messages using AI.

## Features

Git Mew helps you write better commit messages by analyzing your staged changes and generating meaningful, conventional commit messages using AI.

### Key Features

- 🤖 **AI-Powered Commit Messages**: Automatically generate commit messages based on your staged changes.
- 👀 **AI-Powered Staged Changes Review**: Review your staged changes before committing with AI analysis and suggestions.
- 🔍 **AI-Powered Code Review**: Generate comprehensive code reviews for merge requests/pull requests by comparing any two branches.
- 📝 **AI-Powered MR Descriptions**: Generate professional merge request descriptions with smart template selection (default, release, hotfix).
- 🎯 **Multiple LLM Providers**: Support for OpenAI, Claude, Gemini, and Ollama (no API key required for Ollama).
- ⚡ **Quick Access**: Generate commit messages and review changes directly from the Source Control panel.
- 🎨 **Conventional Commits & Rich Reviews**: Follows conventional commit format and generates detailed code review reports.
- 🔧 **Customizable**: Configure your preferred AI model and provider for commit generation, code review, and MR descriptions.
- 📝 **Custom Rules**: Define project-specific rules for commit messages, code reviews, and MR descriptions.
- 🌍 **Multi-Language Support**: Get code reviews and MR descriptions in your preferred language.
- 📤 **Easy Template Publishing**: Use the publish command to copy template files to your project.
- 🚀 **GPT-5 Support**: Automatic optimization for GPT-5 models with reasoning capabilities.

### How to Use

#### Generating Commit Messages
1. Stage your changes in Git.
2. Click the sparkle icon (✨) in the Source Control panel, or run the command `git-mew: Generate Commit Message`.
3. Git Mew will analyze your changes and generate a commit message.
4. Review and commit!

#### Reviewing Staged Changes
1. Stage your changes in Git.
2. Click the eye icon (👁️) in the Source Control panel, or run the command `git-mew: Review Staged Changes`.
3. A webview will open. Select your preferred LLM provider, model, and output language.
4. Click **"Generate Review"** to get AI-powered analysis of your staged changes.
5. Review the suggestions and insights before committing.

#### Generating a Code Review or MR Description
1. Ensure you have committed your changes to your feature branch.
2. Run the command `git-mew: Review Merge`.
3. A webview will open. Select your base branch (e.g., `main`) and your compare branch (your feature branch).
4. Choose your preferred LLM provider, model, and output language.
5. Optionally, add task/issue context for better results.
6. Click either:
   - **"Generate Review"** for a comprehensive code review
   - **"Generate Description"** for a merge request description
7. The result will open in a new tab.

**MR Description Templates:**
- **Default**: Standard feature/bugfix descriptions
- **Release**: For release branches with changelog links
- **Hotfix**: For urgent fixes with incident tracking

## Requirements

- Visual Studio Code 1.104.0 or higher
- Git installed and configured
- API key for your chosen LLM provider (OpenAI, Claude, or Gemini)
  - **Note**: Ollama does not require an API key - just have it running locally

## Setup

1. Install the extension
2. Run the command `git-mew: Setup Model` to configure your AI provider
3. Select your preferred LLM provider (OpenAI, Claude, Gemini, or Ollama)
4. Enter your API key when prompted (not required for Ollama)
5. Choose your preferred model

### Using Ollama (Local AI)

Ollama allows you to run AI models locally without requiring an API key:

1. Install [Ollama](https://ollama.ai/) on your machine
2. Pull a model: `ollama pull llama2` (or any other model)
3. Make sure Ollama is running
4. Select "Ollama" as your provider in Git Mew
5. Choose your installed model

## Customizing Rules

Git Mew allows you to customize how AI generates content by creating rule files in a `.gitmew` folder in your repository root.

### Publishing Template Files

The easiest way to get started with customization:

1. Run the command `git-mew: Publish Files`
2. Select which template files you want to copy to your project
3. Edit the files in `.gitmew/` to match your project needs

### Available Customization Files

1. **Commit Message Rules** (`.gitmew/commit-rule.generate-commit.md`)
   - Define custom rules for commit message generation
   - The AI will use these instructions instead of the default prompt

2. **Code Review System Prompt** (`.gitmew/system-prompt.review-merge.md`)
   - Completely replace the default review instructions
   - Full control over AI's persona, structure, and output format

3. **Code Review Rules** (`.gitmew/code-rule.review-merge.md`)
   - Add specific, project-level rules on top of the default system prompt
   - Define project-specific conventions, style guides, or areas to check

4. **MR Description System Prompt** (`.gitmew/system-prompt.description-merge.md`)
   - Customize the merge request description generation
   - Control template selection logic and output format

**Example structure:**
```
your-project/
├── .gitmew/
│   ├── commit-rule.generate-commit.md        # Custom commit rules
│   ├── system-prompt.review-merge.md         # Custom review prompt
│   ├── code-rule.review-merge.md             # Custom review rules
│   └── system-prompt.description-merge.md    # Custom MR description prompt
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

## Contributing

Found a bug or have a feature request? Please open an issue on our [GitHub repository](https://github.com/git-mew/git-mew).

## License

See LICENSE file for details.

---

## Author

Châu Lâm Đình Ái (alvin0)
GitHub: https://github.com/alvin0
Email: chaulamdinhai@gmail.com

**Enjoy using Git Mew! 🐱✨**
