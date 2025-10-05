import { MODEL_UI_METADATA, PROVIDER_UI_METADATA } from '../../constant/llm';
import { LLMProvider } from '../../llm-adapter';

/**
 * Generates the HTML content for the Review Merge webview
 */
export function generateWebviewContent(
    branches: string[],
    currentBranch?: string,
    providers?: LLMProvider[],
    availableModels?: { [key: string]: string[] },
    currentProvider?: LLMProvider,
    currentModel?: string,
    savedLanguage?: string
): string {
    const branchOptions = generateBranchOptions(branches, currentBranch);
    const providerOptions = generateProviderOptions(providers, currentProvider);
    const modelOptionsMap = generateModelOptionsMap(providers, availableModels, currentProvider, currentModel);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Merge</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/markdown-it/12.3.2/markdown-it.min.js"></script>
    <style>
        ${getStyles()}
    </style>
</head>
<body>
    <div class="container">
        <h1>🔀 Review Merge</h1>
        
        <div class="form-row">
            <div class="form-group">
                <label for="baseBranch">Base Branch</label>
                <select id="baseBranch">${branchOptions}</select>
            </div>
            <div class="form-group">
                <label for="compareBranch">Compare Branch</label>
                <select id="compareBranch">${branchOptions}</select>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label for="provider">AI Provider</label>
                <select id="provider">${providerOptions}</select>
            </div>
            <div class="form-group">
                <label for="model">AI Model</label>
                <select id="model"></select>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label for="taskInfo">Current Task Info (Optional)</label>
                <textarea id="taskInfo" placeholder="Describe what this task is about to help the AI provide better review context..." rows="3"></textarea>
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label for="language">Response Language</label>
                <select id="language">
                    ${generateLanguageOptions(savedLanguage)}
                </select>
            </div>
        </div>

        <div class="button-group">
            <button id="reviewBtn">Generate Review</button>
            <button id="descriptionBtn" style="margin-left: 10px;">Generate Description</button>
            <button id="reviewAndDescBtn" style="margin-left: 10px;">Generate Review & Description</button>
            <button id="cancelBtn" class="hidden" style="margin-left: 10px; background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-secondaryHoverBackground);">Cancel Generate</button>
        </div>

        <div id="loader" class="loader hidden" style="margin-top: 20px;"></div>
        
        <div id="result-container" class="hidden">
            <div class="tabs">
                <button class="tab-button active" data-tab="review" id="reviewTab">📝 Review</button>
                <button class="tab-button" data-tab="description" id="descriptionTab" style="display: none;">📄 MR Description</button>
            </div>

            <div class="tab-content">
                <div id="review-tab" class="tab-pane active">
                    <div class="result-header">
                        <h2>Review Result</h2>
                        <div class="action-buttons">
                            <button id="viewDiffBtn" class="secondary-btn">📄 View Raw Diff in Editor</button>
                            <button class="copy-btn" id="copyReviewBtn">Copy Review</button>
                        </div>
                    </div>
                    <div id="review" class="review-content">
                        <div class="content-wrapper"></div>
                    </div>
                </div>

                <div id="description-tab" class="tab-pane">
                    <div class="result-header">
                        <h2>MR Description</h2>
                        <div class="action-buttons">
                            <button class="copy-btn" id="copyDescriptionBtn">Copy Description</button>
                        </div>
                    </div>
                    <div id="description" class="review-content">
                        <div class="content-wrapper"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        ${getClientScript(modelOptionsMap)}
    </script>
</body>
</html>`;
}

function generateBranchOptions(branches: string[], currentBranch?: string): string {
    return branches.map(branch => {
        const isCurrent = branch === currentBranch;
        return `<option value="${branch}"${isCurrent ? ' selected' : ''}>${branch}${isCurrent ? ' (current)' : ''}</option>`;
    }).join('\n');
}

function generateProviderOptions(providers?: LLMProvider[], currentProvider?: LLMProvider): string {
    if (!providers) {
        return '';
    }
    
    return providers.map(provider => {
        const metadata = PROVIDER_UI_METADATA[provider];
        const isSelected = currentProvider === provider;
        return `<option value="${provider}"${isSelected ? ' selected' : ''}>${metadata.displayName}</option>`;
    }).join('\n');
}

function generateModelOptionsMap(
    providers?: LLMProvider[],
    availableModels?: { [key: string]: string[] },
    currentProvider?: LLMProvider,
    currentModel?: string
): { [key: string]: string } {
    const modelOptionsMap: { [key: string]: string } = {};
    
    if (!providers || !availableModels) {
        return modelOptionsMap;
    }

    for (const provider of providers) {
        const models = availableModels[provider] || [];
        modelOptionsMap[provider] = models.map(modelId => {
            const isSelected = currentProvider === provider && currentModel === modelId;
            let displayName = modelId;
            
            // Get display name from metadata if available
            if (provider !== 'ollama') {
                const metadata = MODEL_UI_METADATA[modelId as keyof typeof MODEL_UI_METADATA];
                if (metadata) {
                    displayName = metadata.displayName;
                }
            }
            
            return `<option value="${modelId}"${isSelected ? ' selected' : ''}>${displayName}</option>`;
        }).join('\n');
    }

    return modelOptionsMap;
}

function generateLanguageOptions(savedLanguage?: string): string {
    const languages = [
        { value: 'English', label: 'English' },
        { value: 'Vietnamese', label: 'Tiếng Việt (Vietnamese)' },
        { value: 'Japanese', label: '日本語 (Japanese)' },
        { value: 'Korean', label: '한국어 (Korean)' },
        { value: 'Chinese', label: '中文 (Chinese)' },
        { value: 'French', label: 'Français (French)' },
        { value: 'German', label: 'Deutsch (German)' },
        { value: 'Spanish', label: 'Español (Spanish)' }
    ];

    return languages.map(lang => {
        const isSelected = savedLanguage === lang.value || (!savedLanguage && lang.value === 'Vietnamese');
        return `<option value="${lang.value}"${isSelected ? ' selected' : ''}>${lang.label}</option>`;
    }).join('\n');
}

function getStyles(): string {
    return `
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        h1 {
            color: var(--vscode-foreground);
            margin-bottom: 20px;
        }
        .form-row {
            display: flex;
            gap: 15px;
            margin-bottom: 15px;
            align-items: flex-start;
        }
        .form-group {
            flex: 1;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
        }
        select, textarea {
            width: 100%;
            padding: 8px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }
        textarea {
            resize: vertical;
            font-family: var(--vscode-font-family);
            min-height: 60px;
        }
        .button-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        button {
            padding: 10px 15px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        #cancelBtn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        #result-container {
            margin-top: 20px;
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            overflow: hidden;
        }
        .tabs {
            display: flex;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-input-border);
        }
        .tab-button {
            flex: 1;
            padding: 12px 20px;
            background-color: transparent;
            color: var(--vscode-descriptionForeground);
            border: none;
            border-bottom: 3px solid transparent;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
            opacity: 0.7;
        }
        .tab-button:hover {
            background-color: var(--vscode-list-hoverBackground);
            opacity: 0.9;
        }
        .tab-button.active {
            background-color: var(--vscode-tab-activeBackground);
            border-bottom-color: var(--vscode-focusBorder);
            color: var(--vscode-tab-activeForeground);
            font-weight: 600;
            opacity: 1;
        }
        .tab-content {
            padding: 15px;
        }
        .tab-pane {
            display: none;
        }
        .tab-pane.active {
            display: block;
        }
        .result-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--vscode-input-border);
        }
        .result-header h2 {
            margin: 0;
            font-size: 18px;
        }
        .action-buttons {
            display: flex;
            gap: 10px;
        }
        .secondary-btn {
            padding: 8px 12px;
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border);
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            font-size: 13px;
        }
        .secondary-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .copy-btn {
            padding: 8px 12px;
            font-size: 13px;
        }
        .review-content {
            padding: 10px;
        }
        .content-wrapper {
            line-height: 1.6;
        }
        .hidden {
            display: none;
        }
        .loader {
            border: 4px solid var(--vscode-input-background);
            border-top: 4px solid var(--vscode-button-background);
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
}

function getClientScript(modelOptionsMap: { [key: string]: string }): string {
    const script = `
        const vscode = acquireVsCodeApi();
        const baseBranchSelect = document.getElementById('baseBranch');
        const compareBranchSelect = document.getElementById('compareBranch');
        const providerSelect = document.getElementById('provider');
        const modelSelect = document.getElementById('model');
        const taskInfoInput = document.getElementById('taskInfo');
        const languageSelect = document.getElementById('language');
        const reviewBtn = document.getElementById('reviewBtn');
        const descriptionBtn = document.getElementById('descriptionBtn');
        const reviewAndDescBtn = document.getElementById('reviewAndDescBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const loader = document.getElementById('loader');
        const resultContainer = document.getElementById('result-container');
        const reviewTab = document.getElementById('reviewTab');
        const descriptionTab = document.getElementById('descriptionTab');
        const reviewContent = document.getElementById('review');
        const descriptionContent = document.getElementById('description');
        const copyReviewBtn = document.getElementById('copyReviewBtn');
        const copyDescriptionBtn = document.getElementById('copyDescriptionBtn');
        const viewDiffBtn = document.getElementById('viewDiffBtn');
        let currentReview = '';
        let currentDescription = '';
        let currentRawDiff = '';

        // Tab switching functionality
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabPanes = document.querySelectorAll('.tab-pane');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.getAttribute('data-tab');
                
                // Remove active class from all buttons and panes
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanes.forEach(pane => pane.classList.remove('active'));
                
                // Add active class to clicked button and corresponding pane
                button.classList.add('active');
                document.getElementById(targetTab + '-tab').classList.add('active');
            });
        });

        const modelOptions = ${JSON.stringify(modelOptionsMap)};

        function updateModelOptions() {
            const provider = providerSelect.value;
            modelSelect.innerHTML = modelOptions[provider] || '<option value="">No models available</option>';
        }

        function checkBranchSelection() {
            const disabled = baseBranchSelect.value === compareBranchSelect.value;
            reviewBtn.disabled = disabled;
            descriptionBtn.disabled = disabled;
            reviewAndDescBtn.disabled = disabled;
            reviewBtn.style.opacity = disabled ? 0.5 : 1;
            descriptionBtn.style.opacity = disabled ? 0.5 : 1;
            reviewAndDescBtn.style.opacity = disabled ? 0.5 : 1;
            reviewBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
            descriptionBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
            reviewAndDescBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
        }

        updateModelOptions();
        checkBranchSelection();

        providerSelect.addEventListener('change', updateModelOptions);
        baseBranchSelect.addEventListener('change', checkBranchSelection);
        compareBranchSelect.addEventListener('change', checkBranchSelection);

        function startGeneration(mode = 'review') {
            loader.classList.remove('hidden');
            resultContainer.classList.add('hidden');
            // Clear content based on mode
            if (mode === 'review' || mode === 'both') {
                reviewContent.querySelector('.content-wrapper').innerHTML = '';
            }
            if (mode === 'description' || mode === 'both') {
                descriptionContent.querySelector('.content-wrapper').innerHTML = '';
            }
            
            // Show/hide tabs based on mode
            if (mode === 'review') {
                reviewTab.style.display = 'block';
                descriptionTab.style.display = 'none';
            } else if (mode === 'description') {
                reviewTab.style.display = 'none';
                descriptionTab.style.display = 'block';
            } else {
                reviewTab.style.display = 'block';
                descriptionTab.style.display = 'block';
            }
            
            // Reset to review tab
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            tabButtons[0].classList.add('active');
            document.getElementById('review-tab').classList.add('active');
            
            reviewBtn.disabled = true;
            descriptionBtn.disabled = true;
            reviewAndDescBtn.disabled = true;
            reviewBtn.style.opacity = 0.5;
            descriptionBtn.style.opacity = 0.5;
            reviewAndDescBtn.style.opacity = 0.5;
            cancelBtn.classList.remove('hidden');

            const commandMap = {
                'review': 'reviewMerge',
                'description': 'generateDescription',
                'both': 'reviewAndDescription'
            };

            vscode.postMessage({
                command: commandMap[mode],
                baseBranch: baseBranchSelect.value,
                compareBranch: compareBranchSelect.value,
                provider: providerSelect.value,
                model: modelSelect.value,
                taskInfo: taskInfoInput.value.trim(),
                language: languageSelect.value
            });
        }

        reviewBtn.addEventListener('click', () => startGeneration('review'));
        descriptionBtn.addEventListener('click', () => startGeneration('description'));
        reviewAndDescBtn.addEventListener('click', () => startGeneration('both'));

        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancel' });
            loader.classList.add('hidden');
            cancelBtn.classList.add('hidden');
            reviewBtn.disabled = false;
            descriptionBtn.disabled = false;
            reviewAndDescBtn.disabled = false;
            reviewBtn.style.opacity = 1;
            descriptionBtn.style.opacity = 1;
            reviewAndDescBtn.style.opacity = 1;
            checkBranchSelection();
        });

        window.addEventListener('message', event => {
            const message = event.data;
            loader.classList.add('hidden');
            cancelBtn.classList.add('hidden');
            reviewBtn.disabled = false;
            descriptionBtn.disabled = false;
            reviewAndDescBtn.disabled = false;
            reviewBtn.style.opacity = 1;
            descriptionBtn.style.opacity = 1;
            reviewAndDescBtn.style.opacity = 1;
            checkBranchSelection();

            const md = window.markdownit();

            switch (message.command) {
                case 'showResult':
                    currentRawDiff = message.rawDiff;
                    
                    // Render review if provided
                    if (message.review) {
                        currentReview = message.review;
                        const htmlResult = md.render(message.review);
                        reviewContent.querySelector('.content-wrapper').innerHTML = htmlResult;
                    }
                    
                    // Render description if provided
                    if (message.description) {
                        currentDescription = message.description;
                        const htmlDescription = md.render(message.description);
                        descriptionContent.querySelector('.content-wrapper').innerHTML = htmlDescription;
                        descriptionTab.style.display = 'block';
                        
                        // If only description was generated, switch to description tab and hide review tab
                        if (!message.review) {
                            reviewTab.style.display = 'none';
                            tabButtons.forEach(btn => btn.classList.remove('active'));
                            tabPanes.forEach(pane => pane.classList.remove('active'));
                            tabButtons[1].classList.add('active');
                            document.getElementById('description-tab').classList.add('active');
                        } else {
                            reviewTab.style.display = 'block';
                        }
                    } else {
                        descriptionTab.style.display = 'none';
                        reviewTab.style.display = 'block';
                    }
                    
                    resultContainer.classList.remove('hidden');
                    break;
                case 'showError':
                    reviewContent.querySelector('.content-wrapper').textContent = 'Error: ' + message.message;
                    resultContainer.classList.remove('hidden');
                    break;
            }
        });

        viewDiffBtn.addEventListener('click', () => {
            if (currentRawDiff) {
                vscode.postMessage({
                    command: 'viewRawDiff',
                    diff: currentRawDiff
                });
            }
        });

        copyReviewBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(currentReview).then(() => {
                copyReviewBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyReviewBtn.textContent = 'Copy Review';
                }, 2000);
            });
        });

        copyDescriptionBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(currentDescription).then(() => {
                copyDescriptionBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyDescriptionBtn.textContent = 'Copy Description';
                }, 2000);
            });
        });

    `;
    return script;
}