import { LLMProvider } from '../../llm-adapter';
import { ContextStrategy } from '../../services/llm';
import { ReviewCustomModelSettings, ReviewCustomProviderConfig } from '../reviewShared/types';
import { buildEmptyState, buildPanelSection, buildReviewShell } from '../reviewShared/webview/layout';
import { buildContextStrategyOptionsHtml, buildLanguageOptionsHtml, buildModelOptionsMap, buildProviderOptionsHtml } from '../reviewShared/webview/options';
import { buildPlantUmlRepairMessageHandler, buildSharedClientActions, buildSharedWebviewScriptState, buildSingleResultMessageHandler } from '../reviewShared/webview/scriptFragments';
import { buildSharedStyles } from '../reviewShared/webview/styles';

export function generateWebviewContent(
    providers?: LLMProvider[],
    availableModels?: Record<string, string[]>,
    currentProvider?: LLMProvider,
    currentModel?: string,
    savedLanguage?: string,
    savedContextStrategy?: ContextStrategy,
    customModelSettings?: ReviewCustomModelSettings,
    customProviderConfig?: ReviewCustomProviderConfig
): string {
    const providerOptions = buildProviderOptionsHtml(providers, currentProvider);
    const modelOptionsMap = buildModelOptionsMap(providers, availableModels, currentProvider, currentModel);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Staged Changes</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/markdown-it/12.3.2/markdown-it.min.js"></script>
    <style>${buildSharedStyles()}</style>
</head>
<body>
    ${buildReviewShell({
        title: 'Review Staged Changes',
        description: 'Run a fast AI review on your staged diff before you commit. Keep the setup compact, generate once, then copy feedback or inspect the raw diff.',
        heroActions: renderHeroActions(),
        controlPanel: renderControlPanel(providerOptions, savedLanguage, savedContextStrategy),
        outputPanel: renderOutputPanel()
    })}
    <script>${getClientScript(modelOptionsMap, customModelSettings || {}, customProviderConfig || { hasApiKey: false })}</script>
</body>
</html>`;
}

function renderControlPanel(providerOptions: string, savedLanguage?: string, savedContextStrategy?: ContextStrategy): string {
    return [
        buildPanelSection({
            title: 'AI setup',
            description: 'Choose the provider and model for this review. Advanced settings stay hidden until you need them.',
            content: renderModelSelectionSection(providerOptions)
        }),
        buildPanelSection({
            title: 'Context',
            description: 'Optional context helps the model judge risk and intent more accurately.',
            content: `
                <div class="stack">
                    <div class="field">
                        <label for="taskInfo">Current task info</label>
                        <textarea id="taskInfo" placeholder="Describe what you're changing, why it matters, or any risk areas to focus on."></textarea>
                        <div class="field__hint">Keep it short. A few sentences are enough.</div>
                    </div>
                    <div class="form-grid">
                        <div class="field">
                            <label for="language">Response language</label>
                            <select id="language">${buildLanguageOptionsHtml(savedLanguage)}</select>
                        </div>
                        <div class="field">
                            <label for="contextStrategy">Context strategy</label>
                            <select id="contextStrategy">${buildContextStrategyOptionsHtml(savedContextStrategy)}</select>
                        </div>
                    </div>
                </div>
            `
        }),
    ].join('');
}

function renderHeroActions(): string {
    return `
        <button id="reviewBtn" class="btn-primary">Generate review</button>
        <button id="controlsToggleBtn" class="btn-ghost" aria-expanded="true">Hide AI setup</button>
        <button id="cancelBtn" class="btn-secondary hidden">Cancel generation</button>
        <button id="logToggleBtn" class="btn-ghost hidden">Show activity log</button>
    `;
}

function renderModelSelectionSection(providerOptions: string): string {
    return `
        <div class="stack">
            <div class="form-grid">
                <div class="field">
                    <label for="provider">AI provider</label>
                    <select id="provider">${providerOptions}</select>
                </div>
                <div class="field">
                    <label for="model">AI model</label>
                    <select id="model"></select>
                    <input id="customModel" class="hidden" type="text" placeholder="Enter a custom model name" />
                    <div class="field__hint">Saved selections remain available the next time you open this panel.</div>
                </div>
            </div>
            <details id="advancedSettings" class="details-card hidden">
                <summary>Advanced settings</summary>
                <div class="details-card__body stack">
                    <div id="customModelSettings" class="form-grid hidden">
                        <div class="field">
                            <label for="contextWindow">Context window</label>
                            <input id="contextWindow" type="number" min="1024" step="1" placeholder="128000" />
                        </div>
                        <div class="field">
                            <label for="maxOutputTokens">Max output tokens</label>
                            <input id="maxOutputTokens" type="number" min="256" step="1" placeholder="16384" />
                        </div>
                    </div>
                    <div id="customProviderSettings" class="form-grid hidden">
                        <div class="field">
                            <label for="customBaseUrl">Custom provider base URL</label>
                            <input id="customBaseUrl" type="url" placeholder="https://your-provider.example/v1" />
                        </div>
                        <div class="field">
                            <label for="customApiKey">Custom provider API key</label>
                            <input id="customApiKey" type="password" placeholder="Custom provider API key" />
                        </div>
                    </div>
                </div>
            </details>
        </div>
    `;
}

function renderOutputPanel(): string {
    return `
        <section class="status-card" id="statusCard" data-state="idle">
            <div class="status-card__main">
                <div class="status-card__copy">
                    <p class="status-card__eyebrow">Generation status</p>
                    <h2 id="statusTitle" class="status-card__title">Ready to review</h2>
                    <p id="statusDetail" class="status-card__detail">Use the left panel to choose a model and generate feedback for the currently staged diff.</p>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <div id="loader" class="loader"></div>
                    <div id="statusBadge" class="status-badge">Waiting</div>
                </div>
            </div>
            <details id="logPanel" class="status-log hidden is-collapsed">
                <summary>Execution log</summary>
                <pre id="logOutput" class="log-output"></pre>
            </details>
        </section>
        ${buildEmptyState({
            title: 'Your staged review will appear here',
            description: 'Generate a review to inspect AI feedback in a readable workspace with markdown rendering, diagrams, and quick actions.',
            note: 'Tip: use raw diff view if you want to compare the generated review against the exact staged patch.'
        })}
        <div id="result-container" class="result-workspace hidden">
            <div class="sticky-result-header">
                <div>
                    <h2>Review result</h2>
                    <p>Generated feedback for your staged changes.</p>
                </div>
                <div class="action-buttons">
                    <button id="viewDiffBtn" class="btn-ghost">View raw diff</button>
                    <button class="btn-secondary" id="copyReviewBtn">Copy review</button>
                </div>
            </div>
            <div id="review" class="review-content"><div class="content-wrapper"></div></div>
        </div>
    `;
}

function getClientScript(
    modelOptionsMap: Record<string, string>,
    customModelSettings: ReviewCustomModelSettings,
    customProviderConfig: ReviewCustomProviderConfig
): string {
    return `
        const vscode = acquireVsCodeApi();
        const providerSelect = document.getElementById('provider');
        const modelSelect = document.getElementById('model');
        const customModelInput = document.getElementById('customModel');
        const advancedSettings = document.getElementById('advancedSettings');
        const customModelSettingsContainer = document.getElementById('customModelSettings');
        const customProviderSettingsContainer = document.getElementById('customProviderSettings');
        const customBaseUrlInput = document.getElementById('customBaseUrl');
        const customApiKeyInput = document.getElementById('customApiKey');
        const contextWindowInput = document.getElementById('contextWindow');
        const maxOutputTokensInput = document.getElementById('maxOutputTokens');
        const taskInfoInput = document.getElementById('taskInfo');
        const languageSelect = document.getElementById('language');
        const contextStrategySelect = document.getElementById('contextStrategy');
        const reviewBtn = document.getElementById('reviewBtn');
        const controlsToggleBtn = document.getElementById('controlsToggleBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const logToggleBtn = document.getElementById('logToggleBtn');
        const dashboard = document.getElementById('reviewDashboard');
        const controlsPanel = document.getElementById('controlsPanel');
        const loader = document.getElementById('loader');
        const statusCard = document.getElementById('statusCard');
        const statusBadge = document.getElementById('statusBadge');
        const statusTitle = document.getElementById('statusTitle');
        const statusDetail = document.getElementById('statusDetail');
        const logPanel = document.getElementById('logPanel');
        const logOutput = document.getElementById('logOutput');
        const emptyState = document.getElementById('emptyState');
        const resultContainer = document.getElementById('result-container');
        const reviewContent = document.getElementById('review');
        const copyReviewBtn = document.getElementById('copyReviewBtn');
        const viewDiffBtn = document.getElementById('viewDiffBtn');
        ${buildSharedWebviewScriptState(modelOptionsMap, customModelSettings, customProviderConfig)}
        ${buildSharedClientActions(['reviewBtn'])}
        ${buildSingleResultMessageHandler()}
        ${buildPlantUmlRepairMessageHandler()}

        function postGenerateRequest() {
            setGeneratingState(true);
            logOutput.textContent = '';
            appendLogMessage('Starting staged review generation.');
            setResultVisible(false);
            reviewContent.querySelector('.content-wrapper').innerHTML = '';

            const selectedModel = getSelectedModel();
            if (!selectedModel) {
                appendLogMessage('Model name is required.');
                setGeneratingState(false);
                setStatusState('error', 'Model required', 'Choose a model before generating a review.');
                return;
            }

            const isCustomModel = providerSelect.value === 'custom' || modelSelect.value === CUSTOM_MODEL_SENTINEL;
            const customCapabilities = getCustomCapabilities();
            if (
                isCustomModel &&
                (!Number.isInteger(customCapabilities.contextWindow) ||
                    customCapabilities.contextWindow < 1024 ||
                    !Number.isInteger(customCapabilities.maxOutputTokens) ||
                    customCapabilities.maxOutputTokens < 256)
            ) {
                appendLogMessage('Context window and max output tokens must be valid integers.');
                setGeneratingState(false);
                setStatusState('error', 'Invalid advanced settings', 'Context window and max output tokens must be valid integers.');
                advancedSettings.open = true;
                return;
            }

            vscode.postMessage({
                command: 'reviewStagedChanges',
                provider: providerSelect.value,
                model: selectedModel,
                baseURL: providerSelect.value === 'custom' ? customBaseUrlInput.value.trim() : undefined,
                apiKey: providerSelect.value === 'custom' ? customApiKeyInput.value.trim() : undefined,
                contextWindow: isCustomModel ? customCapabilities.contextWindow : undefined,
                maxOutputTokens: isCustomModel ? customCapabilities.maxOutputTokens : undefined,
                taskInfo: taskInfoInput.value.trim(),
                language: languageSelect.value,
                contextStrategy: contextStrategySelect.value
            });
        }

        updateModelOptions();
        providerSelect.addEventListener('change', updateModelOptions);
        modelSelect.addEventListener('change', syncModelInput);
        reviewBtn.addEventListener('click', postGenerateRequest);
        controlsToggleBtn.addEventListener('click', () => toggleControlsPanel());
        logToggleBtn.addEventListener('click', () => toggleLogPanel());
        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancel' });
            appendLogMessage('Cancellation requested by user.');
            setGeneratingState(false);
            setStatusState('idle', 'Generation cancelled', 'The request was cancelled. Adjust the setup and generate again when ready.');
        });
        viewDiffBtn.addEventListener('click', handleViewRawDiffAction);
        copyReviewBtn.addEventListener('click', () => handleCopyToClipboardAction(copyReviewBtn, currentReview, 'Copy review'));

        window.addEventListener('message', (event) => {
            const message = event.data;
            const markdownRenderer = window.markdownit();

            switch (message.command) {
                case 'showResult':
                    handleWebviewResultMessage(message, markdownRenderer);
                    break;
                case 'showProgress':
                    setStatusState('running', 'Generating output', message.message);
                    appendLogMessage(message.message);
                    break;
                case 'showLog':
                    logToggleBtn.classList.remove('hidden');
                    appendLogMessage(message.message);
                    break;
                case 'showError':
                    handleWebviewErrorMessage(message);
                    break;
                case 'replacePlantUmlContent':
                    handlePlantUmlRepairResult(message, markdownRenderer);
                    break;
            }
        });
    `;
}
