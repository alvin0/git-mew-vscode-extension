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
                <label for="language">Response Language</label>
                <select id="language">
                    ${generateLanguageOptions(savedLanguage)}
                </select>
            </div>
        </div>

        <button id="reviewBtn">Generate Review</button>
        <button id="cancelBtn" class="hidden" style="margin-left: 10px; background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-secondaryHoverBackground);">Cancel Generate</button>
        <button id="viewDiffBtn" class="hidden" style="margin-left: 10px;">View Raw Changes</button>
        <button id="copyBtn" class="hidden" style="margin-left: 10px;">Copy</button>

        <div id="loader" class="loader hidden" style="margin-top: 20px;"></div>
        <div id="result-container" class="hidden"></div>
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
        select {
            width: 100%;
            padding: 8px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
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
        #copyBtn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        #result-container {
            margin-top: 20px;
            padding: 15px;
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--vscode-textBlockQuote-border);
            border-radius: 4px;
            white-space: pre-wrap;
            font-family: var(--vscode-editor-font-family);
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
    return `
        const vscode = acquireVsCodeApi();
        const baseBranchSelect = document.getElementById('baseBranch');
        const compareBranchSelect = document.getElementById('compareBranch');
        const providerSelect = document.getElementById('provider');
        const modelSelect = document.getElementById('model');
        const languageSelect = document.getElementById('language');
        const reviewBtn = document.getElementById('reviewBtn');
        const viewDiffBtn = document.getElementById('viewDiffBtn');
        const copyBtn = document.getElementById('copyBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const loader = document.getElementById('loader');
        const resultContainer = document.getElementById('result-container');
        let currentRawDiff = '';

        const modelOptions = ${JSON.stringify(modelOptionsMap)};

        function updateModelOptions() {
            const provider = providerSelect.value;
            modelSelect.innerHTML = modelOptions[provider] || '<option value="">No models available</option>';
        }

        function checkBranchSelection() {
            if (baseBranchSelect.value === compareBranchSelect.value) {
                reviewBtn.disabled = true;
                reviewBtn.style.opacity = 0.5;
                reviewBtn.style.cursor = 'not-allowed';
            } else {
                reviewBtn.disabled = false;
                reviewBtn.style.opacity = 1;
                reviewBtn.style.cursor = 'pointer';
            }
        }

        updateModelOptions();
        checkBranchSelection();

        providerSelect.addEventListener('change', updateModelOptions);
        baseBranchSelect.addEventListener('change', checkBranchSelection);
        compareBranchSelect.addEventListener('change', checkBranchSelection);

        reviewBtn.addEventListener('click', () => {
            loader.classList.remove('hidden');
            resultContainer.classList.add('hidden');
            resultContainer.textContent = '';
            reviewBtn.disabled = true;
            reviewBtn.style.opacity = 0.5;
            cancelBtn.classList.remove('hidden');
            viewDiffBtn.classList.add('hidden');
            copyBtn.classList.add('hidden');

            vscode.postMessage({
                command: 'reviewMerge',
                baseBranch: baseBranchSelect.value,
                compareBranch: compareBranchSelect.value,
                provider: providerSelect.value,
                model: modelSelect.value,
                language: languageSelect.value
            });
        });

        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancel' });
            loader.classList.add('hidden');
            cancelBtn.classList.add('hidden');
            reviewBtn.disabled = false;
            reviewBtn.style.opacity = 1;
            checkBranchSelection();
        });

        window.addEventListener('message', event => {
            const message = event.data;
            loader.classList.add('hidden');
            cancelBtn.classList.add('hidden');
            reviewBtn.disabled = false;
            reviewBtn.style.opacity = 1;
            checkBranchSelection();

            switch (message.command) {
                case 'showResult':
                    resultContainer.textContent = message.review;
                    resultContainer.classList.remove('hidden');
                    currentRawDiff = message.rawDiff;
                    viewDiffBtn.classList.remove('hidden');
                    copyBtn.classList.remove('hidden');
                    break;
                case 'showError':
                    resultContainer.textContent = 'Error: ' + message.message;
                    resultContainer.classList.remove('hidden');
                    viewDiffBtn.classList.add('hidden');
                    copyBtn.classList.add('hidden');
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

        copyBtn.addEventListener('click', () => {
            const textToCopy = resultContainer.textContent;
            navigator.clipboard.writeText(textToCopy).then(() => {
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = 'Copy';
                }, 2000);
            });
        });
    `;
}