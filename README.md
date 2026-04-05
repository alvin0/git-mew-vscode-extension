<div align="center">

<img src="resources/images/git-mew-logo.png" width="120" alt="Git Mew"/>

### GitMew - Your AI kitty for Git chaos

**AI-powered commit messages, code reviews, and MR descriptions — all inside VS Code.**

[![VS Code](https://img.shields.io/badge/VS%20Code-1.75.1+-blue.svg)](https://code.visualstudio.com/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE.md)
[![Version](https://img.shields.io/badge/version-0.5.4-orange.svg)](CHANGELOG.md)

[Features](#features) • [Quick Start](#quick-start) • [Usage](#usage) • [Customization](#customization) • [Providers](#supported-llm-providers)

</div>

---

## Features

Git Mew is your intelligent Git companion that leverages AI to streamline commit creation, code review, and merge history analysis inside VS Code. It helps you move faster without losing visibility into what changed, why it changed, and what still needs attention.

### Core Capabilities

<div align="center">
  <video src="resources/documents/gitmew-overview.mp4" width="900" controls muted></video>
  <br/><b>Overview</b><br/>
  <sub>A quick tour of Git Mew — sidebar panel, commit graph, and all core features at a glance.</sub>
</div>

<br/>

<div align="center">
  <video src="resources/documents/gitmew-generate-commit.mp4" width="900" controls muted></video>
  <br/><b>Generate Commit Message</b><br/>
  <sub>Stage your changes and let Git Mew generate a meaningful, conventional commit message in seconds.</sub>
</div>

<br/>

<div align="center">
  <video src="resources/documents/gitmew-review-staged.mp4" width="900" controls muted></video>
  <br/><b>Review Staged Changes</b><br/>
  <sub>Get AI-powered code review on your staged changes before committing — catch issues early.</sub>
</div>

#### Sidebar Panel
Git Mew now has its own Activity Bar icon. The sidebar gives you a unified workspace for staging, committing, pushing, reviewing, and browsing commit history — all without switching views.

- Stage/unstage files individually, by folder, or all at once
- Commit with AI-generated messages (sparkle button)
- Visual commit graph with branch lines, sync status, and merge detection
- Squash local commits with undo support and AI-generated squash messages
- One-click push when you have unpushed commits
- Merge conflict warnings at a glance
- Quick access to all code review workflows and settings

#### Smart Commit Messages
Automatically generate meaningful, conventional commit messages by analyzing your staged changes. No more staring at blank commit boxes.

#### Pre-Commit Review
Get AI-powered analysis of your staged changes before committing. Catch potential issues, receive improvement suggestions, and understand the impact of your changes.

#### Comprehensive Code Review
Generate detailed code reviews for merge requests by comparing any two branches. Includes quality assessment, security considerations, and actionable feedback.

#### Review Merged Branch History
Inspect code that has already been merged into the current branch by selecting a historical merge commit. This is useful for understanding past work, auditing risky merges, or reviewing work after integration.

#### Review Selected Commits
Select one or more commits directly from the graph and generate a review from their combined diff. Useful for reviewing a specific set of changes without switching branches or creating merge commits.

#### Review History
Every review is automatically saved to `~/.gitmew/.histories/` as a Markdown file. Browse, preview, and manage past reviews from the "Histories" sidebar view.

#### Professional MR Descriptions
Create polished merge request descriptions with smart template selection:
- **Default**: Standard feature/bugfix descriptions
- **Release**: Release branches with changelog links
- **Hotfix**: Urgent fixes with incident tracking

#### Visual Flow Analysis
Reviews include PlantUML diagrams to visualize code flow, architecture changes, and component interactions. Diagrams can be fixed with AI if syntax errors occur.

#### Deep Change Explanations
Review outputs now include both a concise summary and a longer `Detail Change` section to explain the logic, behavior, and implementation impact of code changes in more depth.

#### Context-Aware Analysis
Git Mew intelligently inspects related files outside the diff to understand runtime flow and catch hidden integration risks.

#### Security Analysis
A dedicated Security Analyst agent performs OWASP-aligned taint analysis, CWE-tagged vulnerability detection, and auth-flow inspection as part of every review.

### Power Features

- **Multiple LLM Providers**: OpenAI (GPT-5.4, GPT-5.4 Mini, GPT-5.4 Nano), Claude (Sonnet 4.6, Haiku 4.5), Gemini (3.1 Pro, 3 Flash), Ollama (local), and custom OpenAI-compatible endpoints
- **Zero Setup for Ollama**: Run AI models locally without API keys
- **Conventional Commits**: Automatic formatting following best practices
- **Multi-Language Support**: Get reviews and descriptions in 8+ languages
- **Custom Rules**: Define project-specific guidelines via `.gitmew/` folder
- **Quick Access**: Integrated sidebar in VS Code's Activity Bar and Source Control panel buttons
- **History-Safe Review Picker**: Review Merged Branch shows the 20 most recent merges by default and uses search for older history to avoid UI lag
- **Review Memory**: Cross-session memory de-prioritizes recurring low-value findings and tracks resolution history
- **Status Bar Menu**: Fast access to frequently used commands
- **Template Publishing**: One-click distribution of customization templates
- **Cancellable Operations**: Stop generation mid-flight if needed
- **Auto-Staging**: Automatically stage changes when nothing is staged
- **Secure Storage**: API keys encrypted in VS Code's secret storage

---

## Quick Start

### Installation

1. Install Git Mew from the VS Code Marketplace
2. Click the Git Mew icon in the Activity Bar to open the sidebar
3. Open **Settings** and configure your AI provider:
   - **OpenAI/Claude/Gemini**: Enter your API key
   - **Ollama**: Just select your local model (no API key needed)
   - **Custom**: Provide your OpenAI-compatible endpoint URL and API key
4. Start staging, committing, reviewing, and pushing — all from the sidebar

---

## Usage

### Generate Commit Messages

Never struggle with commit messages again. Git Mew analyzes your changes and creates professional, conventional commit messages.

**How to use:**

1. Stage your changes in Git
2. Click the sparkle icon (✨) in the sidebar or Source Control panel
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
2. Click the eye icon (👁️) in the sidebar or Source Control panel
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
- Summary of changes
- Detail Change walkthrough
- Security analysis (OWASP-aligned, CWE-tagged)
- PlantUML diagrams showing code flow
- Related file analysis for context
- Observer warnings for hidden risks

---

### Review Merged Branch

Review code that has already been merged into your current branch. This is useful when you want to audit completed work, understand a past merge, or inspect a risky integration after the fact.

**How to use:**

1. Check out the branch you want to review from
2. Click the history icon in the Source Control panel
   - Or run: `git-mew: Review Merged Branch`
3. A dashboard opens with options:
   - Browse the 20 most recent merged branches
   - Search older merged branches without loading the entire history into the UI
   - Select LLM provider, model, and output language
   - Add optional task or issue context
4. Click **"Generate review"**
5. Inspect the result in separate **Review** and **Diff** tabs

**What you get:**
- Review generated from the exact merge commit patch
- Summary of changes
- Detail Change walkthrough
- Commit-message context from the merged branch history
- Potential bugs, risks, and follow-up suggestions
- PlantUML diagrams and repair support when needed

---

### Review Selected Commits

Review a specific set of commits directly from the graph without switching branches or creating merge requests.

**How to use:**

1. Open the Graph view in the Git Mew sidebar
2. Select one or more commits using the checkboxes
3. Click the **"Review"** button in the toolbar
4. A review dashboard opens showing the selected commits
5. Choose LLM provider, model, and output language
6. Click **"Generate review"**

**What you get:**
- Combined diff review across all selected commits
- Code quality assessment with security analysis
- Detail Change walkthrough
- PlantUML diagrams and repair support
- Review auto-saved to history for later reference

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
- Detail Change walkthrough
- Code quality assessment
- Security analysis (OWASP-aligned, CWE-tagged)
- Performance considerations
- Improvement suggestions
- PlantUML diagrams visualizing architecture
- Observer todo list
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

- Visual Studio Code 1.75.1 or higher
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

### How Rules Are Loaded (Priority Order)

Git Mew resolves customization files using a three-tier priority chain:

```
Project (.gitmew/)  >  Global (~/.gitmew/)  >  Built-in defaults
```

- **Project-level** (`.gitmew/` in your repo root): highest priority, overrides everything. Commit to Git to share with your team.
- **Global** (`~/.gitmew/` in your home directory): applies to all projects on your machine. Useful for personal preferences.
- **Built-in defaults**: used when no custom file is found at either level.

This means you can set global baseline rules and override specific ones per project.

### Getting Started: Publish Rules to .gitmew

The sidebar **Settings** panel has a **"Publish Rules to .gitmew"** button. Clicking it opens a picker where you select which template files to copy, then choose the scope:

- **Project** — copies to `.gitmew/` in your workspace root (highest priority, team-shareable)
- **Global** — copies to `~/.gitmew/` in your home directory (applies to all projects)

After publishing, open the files and edit them to fit your project. Git Mew picks them up automatically on the next run — no restart needed.

### Customization Files

Create a `.gitmew/` folder in your repository root (or `~/.gitmew/` for global config) with any of these files:

#### 1. `commit/rules.md`
Define custom rules for commit message generation.

**Example:**
```markdown
# Custom Commit Rules

- Always include ticket number in format: [PROJ-123]
- Use present tense for all commit messages
- Maximum subject line length: 72 characters
- Include "Breaking Change:" prefix for breaking changes
```

#### 2. `review/system-prompt.md`
Completely replace the default review system prompt. Full control over AI behavior.

**Use when:** You want to fundamentally change how reviews work.

#### 3. `review/code-rules.md`
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

#### 4. `review/agent-rules.md`
Customize internal review agents (flow diagrams, observer checks, security analyst, domain reviewers).

**Example:**
```markdown
# Review Agent Rules

## Flow Diagram Agent
- Generate sequence diagrams for authentication flows
- Use class diagrams for data model changes

## Observer Agent
- Focus on security and performance issues
- Flag breaking changes

## Security Analyst Agent
- Prioritize OWASP Top 10 checks
- Flag any hardcoded credentials
```

#### 5. `description/system-prompt.md`
Customize merge request description generation and template selection.

**Use when:** You want custom MR description formats or template logic.

### Project Structure

```
your-project/
├── .gitmew/
│   ├── commit/
│   │   └── rules.md
│   ├── review/
│   │   ├── system-prompt.md
│   │   ├── code-rules.md
│   │   └── agent-rules.md
│   └── description/
│       └── system-prompt.md
├── src/
└── ...
```

### Tips

- Start with `review/code-rules.md` — it's additive, so you keep all default review behavior and just layer your project rules on top
- Use `review/system-prompt.md` only when you need full control over how the review agents behave
- `review/agent-rules.md` is useful for steering specific agents (e.g. tell the Security Analyst to focus on your auth layer)
- Keep rules concise — the AI reads them as part of the prompt, so shorter and more specific is better
- Commit `.gitmew/` to Git so your whole team benefits from the same rules
- Use `~/.gitmew/` for personal preferences (language, style) that you don't want to impose on the team
- To change the commit message language, edit `commit/rules.md` and update the line `**IMPORTANT: You MUST respond in English...**` to your target language

### Template Variables

You can use dynamic variables inside any `.gitmew/` rule file. Git Mew replaces them at runtime before sending to the AI:

| Variable | Description | Available in |
|---|---|---|
| `{{branch}}` | Current branch name | All rule files |
| `{{baseBranch}}` | Base branch of the review | Review Merge only |
| `{{compareBranch}}` | Compare branch of the review | Review Merge only |
| `{{repoName}}` | Repository folder name | All rule files |

**Example** — `review/code-rules.md`:
```markdown
# Project Rules for {{repoName}}

- This review is for branch `{{compareBranch}}` merging into `{{baseBranch}}`
- Treat `main` as the production branch — flag any direct changes to it
```

**Example** — `commit/rules.md`:
```markdown
# Commit Rules

- Branch: {{branch}} — include ticket number if branch matches `feature/PROJ-*`
- Maximum subject line: 72 characters
- **IMPORTANT: You MUST respond in Vietnamese language. All commit message content must be written in Vietnamese.**
```

Unknown variables (e.g. a typo like `{{branchh}}`) are left as-is in the output.

---

---

## Supported LLM Providers

Git Mew supports multiple AI providers, giving you flexibility and choice.

### OpenAI
**Models:** GPT-5.4, GPT-5.4 Mini, GPT-5.4 Nano

**Setup:**
1. Get API key from [OpenAI Platform](https://platform.openai.com/)
2. Select "OpenAI" in Git Mew setup
3. Enter your API key
4. Choose your preferred model

**Best for:** Latest AI capabilities, reasoning tasks, complex code analysis

---

### Anthropic Claude
**Models:** Claude Sonnet 4.6, Claude Haiku 4.5

**Setup:**
1. Get API key from [Anthropic Console](https://console.anthropic.com/)
2. Select "Claude" in Git Mew setup
3. Enter your API key
4. Choose your preferred model

**Best for:** Detailed analysis, long context windows, nuanced understanding

---

### Google Gemini
**Models:** Gemini 3.1 Pro, Gemini 3 Flash

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
- **Error Tracking**: Git Mew uses Sentry for anonymous crash reporting with automatic PII scrubbing. No source code is ever included in error reports.
- **Local Control**: You control which provider and model to use
- **Ollama Option**: Run completely locally with no external API calls

---

## Requirements

- **VS Code**: Version 1.75.1 or higher
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
- Custom commit message templates
- Team configuration sharing
- Automated testing integration

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
