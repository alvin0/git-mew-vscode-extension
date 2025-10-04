# Product Context: Git Mew

## Problem Statement
Developers often struggle with writing meaningful commit messages, leading to:
- Poor commit history that's hard to understand
- Time wasted thinking about how to describe changes
- Inconsistent commit message formats across teams
- Difficulty generating changelogs from commit history

## Solution
Git Mew analyzes staged Git changes and uses AI to generate clear, conventional commit messages that accurately describe what changed and why.

## User Experience Flow

### First-Time Setup
1. User installs Git Mew extension
2. User runs "git-mew: Setup Model" command
3. System guides through 3-step configuration:
   - **Step 1:** Select AI provider (OpenAI/Claude/Gemini)
   - **Step 2:** Enter API key (stored securely)
   - **Step 3:** Choose specific model
4. Configuration saved for future use

### Daily Usage
1. User stages changes in Git (standard workflow)
2. User clicks sparkle icon (✨) in Source Control panel
3. Git Mew analyzes staged changes:
   - Detects file types (text vs binary)
   - Generates formatted diff markdown
   - Categorizes changes (Add/Edit/Remove)
4. AI generates commit message with:
   - Conventional commit subject line (≤50 chars)
   - File-by-file change summary
   - Brief functional/technical description (≤50 words)
5. Message appears in Git SCM input box
6. User reviews and commits

### Auto-Configuration
If user clicks generate without setup:
- System detects missing configuration
- Automatically starts setup flow
- Returns to generation after setup complete

### Review Merge
1. User runs "git-mew: Review Merge" command
2. System opens a webview with options:
   - Base branch selection
   - Compare branch selection
   - LLM provider and model selection
   - Output language selection
3. User selects branches and options, then clicks "Generate Review"
4. Git Mew analyzes the diff between the two branches
5. AI generates a comprehensive code review report with:
   - Summary of changes
   - Code quality assessment
   - Improvement suggestions
6. The review is displayed in a new editor tab
7. User can view the raw diff in a separate tab

## Key User Benefits

### For Individual Developers
- **Save time:** No more staring at blank commit message box
- **Better history:** Consistent, descriptive messages
- **Learn patterns:** See how AI describes changes
- **Flexibility:** Choose preferred AI provider

### For Teams
- **Standardization:** Conventional commit format enforced
- **Better changelogs:** Structured messages enable automation
- **Code review:** Clear commit messages aid review process
- **Onboarding:** New developers see good commit examples

## Commit Message Format
```
<type>: <subject line (≤50 chars)>

Files changed:
- path/to/file1.js: Brief description
- path/to/file2.ts: Brief description

<Functional and technical summary (≤50 words)>
```

## Privacy & Security
- API keys stored in VS Code's secure secret storage
- Code only sent to user's chosen AI provider
- No data collected or stored by Git Mew
- User maintains full control over API usage

## Supported Scenarios

### ✅ Supported
- Text file changes (code, config, docs)
- Binary file detection and labeling
- Multiple file changes in single commit
- Added, modified, and deleted files
- Renamed and copied files

### ⚠️ Limitations
- Large diffs may take longer to process
- Very large binary files may timeout
- Requires active internet connection
- Depends on AI provider availability

## Future Considerations
- Custom commit message templates
- Team-specific conventions
- Commit message history learning
- Multi-repository support
- Offline mode with local models