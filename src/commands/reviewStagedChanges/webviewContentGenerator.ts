import { MODEL_UI_METADATA, PROVIDER_UI_METADATA } from '../../constant/llm';
import { LLMProvider } from '../../llm-adapter';

/**
 * Generates the HTML content for the Review Staged Changes webview
 */
export function generateWebviewContent(
    providers?: LLMProvider[],
    availableModels?: { [key: string]: string[] },
    currentProvider?: LLMProvider,
    currentModel?: string,
    savedLanguage?: string
): string {
    const providerOptions = generateProviderOptions(providers, currentProvider);
    const modelOptionsMap = generateModelOptionsMap(providers, availableModels, currentProvider, currentModel);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Staged Changes</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/markdown-it/12.3.2/markdown-it.min.js"></script>
    <style>
        ${getStyles()}
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 Review Staged Changes</h1>
        
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
                <textarea id="taskInfo" placeholder="Describe what you're working on to help the AI provide better review context..." rows="3"></textarea>
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
            <button id="cancelBtn" class="hidden" style="margin-left: 10px; background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-secondaryHoverBackground);">Cancel Generate</button>
        </div>

        <div id="loader" class="loader hidden" style="margin-top: 20px;"></div>
        
        <div id="result-container" class="hidden">
            <div class="result-header">
                <h2>📝 Review Result</h2>
                <div class="action-buttons">
                    <button id="viewDiffBtn" class="secondary-btn">📄 View Raw Diff in Editor</button>
                    <button class="copy-btn" id="copyReviewBtn">Copy Review</button>
                </div>
            </div>
            <div id="review" class="review-content">
                <div class="content-wrapper"></div>
            </div>
        </div>
    </div>

    <script>
        ${getClientScript(modelOptionsMap)}
    </script>
</body>
</html>`;
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
            padding: 15px;
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
        const providerSelect = document.getElementById('provider');
        const modelSelect = document.getElementById('model');
        const taskInfoInput = document.getElementById('taskInfo');
        const languageSelect = document.getElementById('language');
        const reviewBtn = document.getElementById('reviewBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const loader = document.getElementById('loader');
        const resultContainer = document.getElementById('result-container');
        const reviewContent = document.getElementById('review');
        const copyReviewBtn = document.getElementById('copyReviewBtn');
        const viewDiffBtn = document.getElementById('viewDiffBtn');
        let currentReview = '';
        let currentRawDiff = '';

        const modelOptions = ${JSON.stringify(modelOptionsMap)};

        function updateModelOptions() {
            const provider = providerSelect.value;
            modelSelect.innerHTML = modelOptions[provider] || '<option value="">No models available</option>';
        }

        updateModelOptions();

        providerSelect.addEventListener('change', updateModelOptions);

        function startGeneration() {
            loader.classList.remove('hidden');
            resultContainer.classList.add('hidden');
            reviewContent.querySelector('.content-wrapper').innerHTML = '';
            
            reviewBtn.disabled = true;
            reviewBtn.style.opacity = 0.5;
            cancelBtn.classList.remove('hidden');

            vscode.postMessage({
                command: 'reviewStagedChanges',
                provider: providerSelect.value,
                model: modelSelect.value,
                taskInfo: taskInfoInput.value.trim(),
                language: languageSelect.value
            });
        }

        reviewBtn.addEventListener('click', startGeneration);

        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancel' });
            loader.classList.add('hidden');
            cancelBtn.classList.add('hidden');
            reviewBtn.disabled = false;
            reviewBtn.style.opacity = 1;
        });

        window.addEventListener('message', event => {
            const message = event.data;
            loader.classList.add('hidden');
            cancelBtn.classList.add('hidden');
            reviewBtn.disabled = false;
            reviewBtn.style.opacity = 1;

            const md = window.markdownit();

            switch (message.command) {
                case 'showResult':
                    currentRawDiff = message.rawDiff;
                    currentReview = message.review;
                    const htmlResult = md.render(message.review);
                    reviewContent.querySelector('.content-wrapper').innerHTML = htmlResult;
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

    `;
    return script;
}