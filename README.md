<div align="center">

# 🐱 Git Mew

### Your AI kitty for Git chaos

**Transform your Git workflow with AI-powered commit messages, code reviews, and merge request descriptions**

[![VS Code](https://img.shields.io/badge/VS%20Code-1.104.0+-blue.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE.md)
[![Version](https://img.shields.io/badge/version-0.2.1-orange.svg)](CHANGELOG.md)

[Features](#features) • [Quick Start](#quick-start) • [Usage](#usage) • [Customization](#customization) • [Providers](#supported-llm-providers)

</div>

---

## Features

Git Mew is your intelligent Git companion that leverages AI to streamline your development workflow. Say goodbye to commit message writer's block and hello to professional, consistent Git practices.

### Core Capabilities

#### Smart Commit Messages
Automatically generate meaningful, conventional commit messages by analyzing your staged changes. No more staring at blank commit boxes.

#### Pre-Commit Review
Get AI-powered analysis of your staged changes before committing. Catch potential issues, receive improvement suggestions, and understand the impact of your changes.

#### Comprehensive Code Review
Generate detailed code reviews for merge requests by comparing any two branches. Includes quality assessment, security considerations, and actionable feedback.

#### Professional MR Descriptions
Create polished merge request descriptions with smart template selection:
- **Default**: Standard feature/bugfix descriptions
- **Release**: Release branches with changelog links
- **Hotfix**: Urgent fixes with incident tracking

#### Visual Flow Analysis
Reviews include PlantUML diagrams to visualize code flow, architecture changes, and component interactions. Diagrams can be fixed with AI if syntax errors occur.

#### Context-Aware Analysis
Git Mew intelligently inspects related files outside the diff to understand runtime flow and catch hidden integration risks.

### Power Features

- **Multiple LLM Providers**: OpenAI (GPT-5, GPT-4.1), Claude (Sonnet 4.6), Gemini (3 Pro/Flash), Ollama (local), and custom OpenAI-compatible endpoints
- **Zero Setup for Ollama**: Run AI models locally without API keys
- **Conventional Commits**: Automatic formatting following best practices
- **Multi-Language Support**: Get reviews and descriptions in 8+ languages
- **Custom Rules**: Define project-specific guidelines via `.gitmew/` folder
- **Quick Access**: Integrated buttons in VS Code's Source Control panel
- **Status Bar Menu**: Fast access to frequently used commands
- **Template Publishing**: One-click distribution of customization templates
- **Cancellable Operations**: Stop generation mid-flight if needed
- **Auto-Staging**: Automatically stage changes when nothing is staged
- **Secure Storage**: API keys encrypted in VS Code's secret storage

---

## Quick Start

### Installation

1. Install Git Mew from the VS Code Marketplace
2. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run `git-mew: Setup Model Generate Commit`
4. Choose your AI provider and configure:
   - **OpenAI/Claude/Gemini**: Enter your API key
   - **Ollama**: Just select your local model (no API key needed)
   - **Custom**: Provide your OpenAI-compatible endpoint URL

That's it! You're ready to go.

---

## Usage

### Generate Commit Messages

Never struggle with commit messages again. Git Mew analyzes your changes and creates professional, conventional commit messages.

**How to use:**

1. Stage your changes in Git
2. Click the sparkle icon (✨) in the Source Control panel
   - Or run: `git-mew: Generate Commit Message`
3. Git Mew analyzes your changes and generates a commit message
4. Review and commit!

**Output format:**
```
feat: add user authentication system

Files changed:
- src/auth/login.ts: Implement JWT-based authentication
- src/middleware/auth.ts: Add authentication middleware
- tests/auth.test.ts: Add authentication tests

Implemented secure user authentication using JWT tokens with bcrypt password hashing and session management.
```

**Pro tips:**
- If nothing is staged, Git Mew offers to stage all changes automatically
- Click the pause icon to cancel generation mid-flight
- Use the status bar menu for quick access to all commands

---

### Review Staged Changes

Get AI-powered feedback on your changes before committing. Catch issues early and improve code quality.

**How to use:**

1. Stage your changes in Git
2. Click the eye icon (👁️) in the Source Control panel
   - Or run: `git-mew: Review Staged Changes`
3. A dashboard opens with options:
   - Select LLM provider and model
   - Choose output language
   - Add optional task/issue context
4. Click **"Generate Review"**
5. Review the AI analysis, suggestions, and potential issues

**What you get:**
- Code quality assessment
- Potential bugs and issues
- Improvement suggestions
- Security considerations
- PlantUML diagrams showing code flow
- Related file analysis for context
- Observer warnings for hidden risks

---

### Generate Code Reviews

Create comprehensive code reviews for merge requests by comparing branches.

**How to use:**

1. Commit your changes to your feature branch
2. Click the merge icon (🔀) in the Source Control panel
   - Or run: `git-mew: Review Merge`
3. A dashboard opens:
   - Select base branch (e.g., `main`)
   - Select compare branch (your feature branch)
   - Choose LLM provider, model, and language
   - Add optional task/issue context
4. Click **"Generate Review"**
5. Review opens in a new tab with comprehensive analysis

**Review includes:**
- Summary of all changes
- Code quality assessment
- Security and performance considerations
- Improvement suggestions
- PlantUML diagrams visualizing architecture
- Observer todo list (max 4 items)
- Related file context for better understanding

---

### Generate MR Descriptions

Create professional merge request descriptions with smart template selection.

**How to use:**

1. Follow steps 1-3 from "Generate Code Reviews" above
2. Click **"Generate Description"** instead
3. Description opens in a new tab, ready to copy

**Smart templates:**
- **Default**: Detected for standard feature/bugfix branches
- **Release**: Auto-selected for release branches (includes changelog)
- **Hotfix**: Auto-selected for hotfix branches (includes incident tracking)

**Description includes:**
- Problem/feature summary
- Changes made (grouped by scope)
- Related issues and tickets
- Testing checklist
- Deployment notes (for release/hotfix)

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

---

## Customization

Git Mew is highly customizable. Define project-specific rules, prompts, and behaviors to match your team's workflow.

### Quick Start: Publish Templates

The easiest way to get started with customization:

1. Run: `git-mew: Publish Files`
2. Select which template files to copy to your project
3. Edit the files in `.gitmew/` folder
4. Git Mew automatically uses your custom rules

### Customization Files

Create a `.gitmew/` folder in your repository root with any of these files:

#### 1. `commit-rule.generate-commit.md`
Define custom rules for commit message generation.

**Example:**
```markdown
# Custom Commit Rules

- Always include ticket number in format: [PROJ-123]
- Use present tense for all commit messages
- Maximum subject line length: 72 characters
- Include "Breaking Change:" prefix for breaking changes
```

#### 2. `system-prompt.review-merge.md`
Completely replace the default review system prompt. Full control over AI behavior.

**Use when:** You want to fundamentally change how reviews work.

#### 3. `code-rule.review-merge.md`
Add project-specific review rules on top of the default system prompt.

**Example:**
```markdown
# Project Review Rules

## Security
- Check all database queries for SQL injection
- Verify authentication on all API endpoints

## Performance
- Flag any N+1 query patterns
- Check for missing database indexes

## Style
- Ensure all functions have JSDoc comments
- Verify consistent error handling patterns
```

#### 4. `agent-rule.review-merge.md`
Customize internal review agents (flow diagrams, observer checks, domain reviewers).

**Example:**
```markdown
# Review Agent Rules

## Flow Diagram Agent
- Generate sequence diagrams for authentication flows
- Use class diagrams for data model changes

## Observer Agent
- Maximum 4 todo items
- Focus on security and performance issues
- Flag breaking changes
```

#### 5. `system-prompt.description-merge.md`
Customize merge request description generation and template selection.

**Use when:** You want custom MR description formats or template logic.

### Project Structure

```
your-project/
├── .gitmew/
│   ├── commit-rule.generate-commit.md
│   ├── system-prompt.review-merge.md
│   ├── code-rule.review-merge.md
│   ├── agent-rule.review-merge.md
│   └── system-prompt.description-merge.md
├── src/
└── ...
```

### Customization Tips

- Start with `code-rule.review-merge.md` for simple project rules
- Use `system-prompt.review-merge.md` only if you need complete control
- Keep rules concise and specific
- Test your rules with small changes first
- Share `.gitmew/` folder with your team via Git

---

## Configuration

### Extension Settings

Configure Git Mew through VS Code settings:

#### Commit Generation
- `git-mew.llmProvider`: Default LLM provider (openai, claude, gemini, ollama, custom)
- `git-mew.llmModel.openai`: Default OpenAI model
- `git-mew.llmModel.claude`: Default Claude model
- `git-mew.llmModel.gemini`: Default Gemini model
- `git-mew.llmModel.ollama`: Default Ollama model
- `git-mew.llmModel.custom`: Default custom provider model
- `git-mew.llmBaseUrl.custom`: Base URL for custom OpenAI-compatible provider
- `git-mew.commit.contextStrategy`: Context handling strategy (direct, auto, hierarchical)

#### Review & MR Description
- `git-mew.reviewMerge.provider`: Last used provider for reviews
- `git-mew.reviewMerge.model`: Last used model for reviews
- `git-mew.reviewMerge.language`: Default output language (English, Vietnamese, Japanese, etc.)
- `git-mew.reviewMerge.contextStrategy`: Context handling strategy for reviews

#### Custom Model Limits
Configure context window and max output tokens for custom models:
- `git-mew.llmCustomModelContextWindow.[provider]`
- `git-mew.llmCustomModelMaxOutputTokens.[provider]`

### Managing API Keys

Run `git-mew: Manage API Keys` to:
- View configured providers
- Update API keys
- Remove stored credentials

API keys are stored securely in VS Code's encrypted secret storage.

---

## Supported LLM Providers

Git Mew supports multiple AI providers, giving you flexibility and choice.

### OpenAI
**Models:** GPT-5, GPT-5 Mini, GPT-5 Nano, GPT-4.1

**Setup:**
1. Get API key from [OpenAI Platform](https://platform.openai.com/)
2. Select "OpenAI" in Git Mew setup
3. Enter your API key
4. Choose your preferred model

**Best for:** Latest AI capabilities, reasoning tasks, complex code analysis

---

### Anthropic Claude
**Models:** Claude Sonnet 4.5

**Setup:**
1. Get API key from [Anthropic Console](https://console.anthropic.com/)
2. Select "Claude" in Git Mew setup
3. Enter your API key
4. Choose your preferred model

**Best for:** Detailed analysis, long context windows, nuanced understanding

---

### Google Gemini
**Models:** Gemini 2.5 Pro, Gemini 2.5 Flash

**Setup:**
1. Get API key from [Google AI Studio](https://makersuite.google.com/)
2. Select "Gemini" in Git Mew setup
3. Enter your API key
4. Choose your preferred model

**Best for:** Fast responses, cost-effective, multimodal capabilities

---

### Ollama (Local AI)
**Models:** Any model you have installed locally

**Setup:**
1. Install [Ollama](https://ollama.ai/)
2. Pull a model: `ollama pull llama2` (or any other)
3. Start Ollama
4. Select "Ollama" in Git Mew setup
5. Choose your installed model

**Best for:** Privacy, no API costs, offline usage, experimentation

**No API key required!**

---

### Custom (OpenAI-Compatible)
**Models:** Any OpenAI-compatible endpoint

**Setup:**
1. Select "Custom" in Git Mew setup
2. Enter your base URL (e.g., `https://api.example.com/v1`)
3. Enter your API key
4. Enter your model name
5. Configure context window and max tokens

**Best for:** Self-hosted models, enterprise deployments, custom endpoints

**Supported endpoints:** Any service implementing OpenAI's `/chat/completions` API

---

## Privacy & Security

Your data and credentials are protected:

- **API Keys**: Stored in VS Code's encrypted secret storage, never in plain text
- **Code Privacy**: Your code is only sent to the AI provider you choose
- **No Telemetry**: Git Mew doesn't collect or store any data
- **Local Control**: You control which provider and model to use
- **Ollama Option**: Run completely locally with no external API calls

---

## Requirements

- **VS Code**: Version 1.104.0 or higher
- **Git**: Installed and configured
- **API Key**: For your chosen provider (except Ollama)
- **Internet**: Required for cloud providers (OpenAI, Claude, Gemini)

---

## Known Issues

- Large diffs (>100KB) may take longer to process
- Binary files are detected but not analyzed in detail
- Multiple repositories in workspace: only first repo is used
- Custom API endpoints must support OpenAI's chat completions format

---

## Roadmap

Future enhancements we're considering:

- Streaming responses for real-time feedback
- Multi-repository support
- Commit history analysis
- Custom commit message templates
- Team configuration sharing
- Automated testing integration
- More diagram types (architecture, data flow)

Have a feature request? [Open an issue](https://github.com/alvin0/git-mew-vscode-extension/issues)!

---

## Contributing

We welcome contributions! Here's how you can help:

1. **Report Bugs**: [Open an issue](https://github.com/alvin0/git-mew-vscode-extension/issues) with details
2. **Suggest Features**: Share your ideas in the issues
3. **Submit PRs**: Fork, code, and submit pull requests
4. **Share Feedback**: Let us know how Git Mew works for you

**Repository**: [github.com/alvin0/git-mew-vscode-extension](https://github.com/alvin0/git-mew-vscode-extension)

---

## License

See [LICENSE.md](LICENSE.md) for details.

---

## Author

**Châu Lâm Đình Ái (alvin0)**

- GitHub: [@alvin0](https://github.com/alvin0)
- Email: chaulamdinhai@gmail.com

---

<div align="center">

### Enjoy using Git Mew!

**Star us on GitHub** | **Share with your team** | **Report issues**

Made with love for developers who love clean Git history

</div>
