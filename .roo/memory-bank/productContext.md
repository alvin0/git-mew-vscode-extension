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

### Review Merge & MR Description
1. User runs "git-mew: Review Merge" command
2. System opens a webview with options:
   - Base branch selection
   - Compare branch selection
   - LLM provider and model selection
   - Output language selection
   - Optional task/issue context
3. User can choose between two actions:
   - **Generate Review:** Creates comprehensive code review
   - **Generate Description:** Creates MR/PR description
4. Git Mew analyzes the diff between the two branches
5. For **Review**, AI generates:
   - Summary of changes
   - Code quality assessment
   - Improvement suggestions
   - Security considerations
6. For **Description**, AI generates:
   - Smart template selection (default/release/hotfix)
   - Structured MR description with:
     - Problem/feature summary
     - Changes made (grouped by scope)
     - Related issues
     - Checklists
7. Results displayed in new editor tabs
8. User can view raw diff in separate tab

## Key User Benefits

### For Individual Developers
- **Save time:** No more staring at blank commit message box
- **Better history:** Consistent, descriptive messages
- **Learn patterns:** See how AI describes changes
- **Flexibility:** Choose preferred AI provider
- **Quality reviews:** Get AI-powered code review insights
- **Professional MRs:** Generate polished merge request descriptions

### For Teams
- **Standardization:** Conventional commit format enforced
- **Better changelogs:** Structured messages enable automation
- **Code review:** Clear commit messages and AI reviews aid review process
- **Onboarding:** New developers see good commit examples
- **Consistent MRs:** Template-based descriptions ensure completeness
- **Custom rules:** Project-specific guidelines via `.gitmew/` folder

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