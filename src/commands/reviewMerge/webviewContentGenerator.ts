import { LLMProvider } from '../../llm-adapter';
import { ReviewCustomModelSettings, ReviewCustomProviderConfig } from '../reviewShared/types';
import { buildEmptyState, buildPanelSection, buildReviewShell } from '../reviewShared/webview/layout';
import { buildBranchOptionsHtml, buildLanguageOptionsHtml, buildModelOptionsMap, buildProviderOptionsHtml } from '../reviewShared/webview/options';
import { buildPlantUmlRepairMessageHandler, buildSharedClientActions, buildSharedWebviewScriptState, buildTabbedResultMessageHandler } from '../reviewShared/webview/scriptFragments';
import { buildSharedStyles } from '../reviewShared/webview/styles';

export function generateMergeWebviewContent(
    branches: string[],
    currentBranch?: string,
    providers?: LLMProvider[],
    availableModels?: Record<string, string[]>,
    currentProvider?: LLMProvider,
    currentModel?: string,
    savedLanguage?: string,
    customModelSettings?: ReviewCustomModelSettings,
    customProviderConfig?: ReviewCustomProviderConfig
): string {
    const branchOptions = buildBranchOptionsHtml(branches, currentBranch);
    const providerOptions = buildProviderOptionsHtml(providers, currentProvider);
    const modelOptionsMap = buildModelOptionsMap(providers, availableModels, currentProvider, currentModel);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Merge</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/markdown-it/12.3.2/markdown-it.min.js"></script>
    <style>${buildSharedStyles({ includeTabs: true })}</style>
</head>
<body>
    ${buildReviewShell({
        title: 'Review Merge',
        description: 'Compare two branches, generate an AI review, draft an MR description, or produce both in one run from a single workspace.',
        heroActions: renderHeroActions(),
        controlPanel: renderControlPanel(branchOptions, providerOptions, savedLanguage),
        outputPanel: renderOutputPanel()
    })}
    <script>${getClientScript(modelOptionsMap, customModelSettings || {}, customProviderConfig || { hasApiKey: false })}</script>
</body>
</html>`;
}

function renderControlPanel(
    branchOptions: string,
    providerOptions: string,
    savedLanguage?: string,
): string {
    return [
        buildPanelSection({
            title: 'Review source',
            description: 'Choose the base branch and the branch you want to inspect against it.',
            tone: 'accent',
            content: `
                <div class="stack">
                    <div class="form-grid">
                        <div class="field">
                            <label for="baseBranch">Base branch</label>
                            <select id="baseBranch">${branchOptions}</select>
                            <div class="field__hint">Usually your target branch, such as <span class="inline-kbd">main</span> or <span class="inline-kbd">develop</span>.</div>
                        </div>
                        <div class="field">
                            <label for="compareBranch">Compare branch</label>
                            <select id="compareBranch">${branchOptions}</select>
                            <div class="field__hint">Usually the feature or fix branch you want reviewed.</div>
                        </div>
                    </div>
                    <div id="branchValidationMessage" class="field__feedback field__feedback--warning">Base branch and compare branch must be different.</div>
                </div>
            `
        }),
        buildPanelSection({
            title: 'AI setup',
            description: 'Pick the provider and model. Advanced settings stay tucked away unless you switch to custom or custom-model flows.',
            content: renderModelSelectionSection(providerOptions)
        }),
        buildPanelSection({
            title: 'Context',
            description: 'Add task context and response preferences to shape the review or description output.',
            content: `
                <div class="stack">
                    <div class="field">
                        <label for="taskInfo">Current task info</label>
                        <textarea id="taskInfo" placeholder="Describe the feature, issue, or rollout context that the review and MR description should understand."></textarea>
                        <div class="field__hint">This is optional, but useful when the diff does not explain intent by itself.</div>
                    </div>
                    <div class="form-grid">
                        <div class="field">
                            <label for="language">Response language</label>
                            <select id="language">${buildLanguageOptionsHtml(savedLanguage)}</select>
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
        <button id="descriptionBtn" class="btn-secondary">Generate description</button>
        <button id="reviewAndDescBtn" class="btn-ghost">Generate both</button>
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
                    <div class="field__hint">Use a custom model only when your provider exposes additional variants outside the preset list.</div>
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
                    <h2 id="statusTitle" class="status-card__title">Ready to compare branches</h2>
                    <p id="statusDetail" class="status-card__detail">Select two different branches, then generate a review or draft an MR description from the same diff.</p>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                    <div id="loader" class="loader"></div>
                    <div id="statusBadge" class="status-badge">Waiting</div>
                </div>
            </div>
            <details id="logPanel" class="status-log hidden is-collapsed">
                <summary>Activity log</summary>
                <div class="log-tabs">
                    <button class="log-tab-btn active" data-log-tab="execution" aria-selected="true">Execution log</button>
                    <button class="log-tab-btn" data-log-tab="llm" aria-selected="false">LLM requests <span id="llmLogCount" class="log-tab-count">0</span></button>
                </div>
                <div id="executionLogPane" class="log-tab-pane active">
                    <pre id="logOutput" class="log-output"></pre>
                </div>
                <div id="llmLogPane" class="log-tab-pane">
                    <div id="llmLogEntries" class="llm-entries"></div>
                </div>
            </details>
        </section>
        ${buildEmptyState({
            title: 'Review and MR output will appear here',
            description: 'Run one action to open the result workspace. Review output and MR description share the same area so you can switch between them without losing context.',
            note: 'Generate both when you want code feedback and a polished merge request description from the same branch comparison.'
        })}
        <div id="result-container" class="result-workspace hidden">
            <section id="errorReport" class="error-report hidden"></section>
            <div class="tabs" role="tablist" aria-label="Output tabs">
                <button class="tab-button active" data-tab="review" id="reviewTab" aria-selected="true">Review</button>
                <button class="tab-button hidden" data-tab="description" id="descriptionTab" aria-selected="false">MR description</button>
            </div>
            <div class="tab-content">
                <div id="review-tab" class="tab-pane active">
                    <div class="sticky-result-header">
                        <div>
                            <h2>Review result</h2>
                            <p>AI feedback for the selected branch comparison.</p>
                        </div>
                        <div class="action-buttons">
                            <button id="viewDiffBtn" class="btn-ghost">View raw diff</button>
                            <button class="btn-secondary" id="copyReviewBtn">Copy review</button>
                        </div>
                    </div>
                    <div id="review" class="review-content"><div class="content-wrapper"></div></div>
                </div>
                <div id="description-tab" class="tab-pane">
                    <div class="sticky-result-header">
                        <div>
                            <h2>MR description</h2>
                            <p>Drafted from the same branch diff and task context.</p>
                        </div>
                        <div class="action-buttons">
                            <button class="btn-secondary" id="copyDescriptionBtn">Copy description</button>
                        </div>
                    </div>
                    <div id="description" class="review-content"><div class="content-wrapper"></div></div>
                </div>
            </div>
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
        const baseBranchSelect = document.getElementById('baseBranch');
        const compareBranchSelect = document.getElementById('compareBranch');
        const branchValidationMessage = document.getElementById('branchValidationMessage');
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
        const reviewBtn = document.getElementById('reviewBtn');
        const descriptionBtn = document.getElementById('descriptionBtn');
        const reviewAndDescBtn = document.getElementById('reviewAndDescBtn');
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
        const errorReportContainer = document.getElementById('errorReport');
        const reviewContent = document.getElementById('review');
        const descriptionContent = document.getElementById('description');
        const descriptionTab = document.getElementById('descriptionTab');
        const copyReviewBtn = document.getElementById('copyReviewBtn');
        const copyDescriptionBtn = document.getElementById('copyDescriptionBtn');
        const viewDiffBtn = document.getElementById('viewDiffBtn');
        ${buildSharedWebviewScriptState(modelOptionsMap, customModelSettings, customProviderConfig, { includeDescriptionState: true })}
        ${buildSharedClientActions(['reviewBtn', 'descriptionBtn', 'reviewAndDescBtn'], { idleHook: 'checkBranchSelection();' })}
        ${buildTabbedResultMessageHandler()}
        ${buildPlantUmlRepairMessageHandler({ includeDescription: true })}

        function checkBranchSelection() {
            const disabled = baseBranchSelect.value === compareBranchSelect.value;
            [reviewBtn, descriptionBtn, reviewAndDescBtn].forEach((button) => {
                button.disabled = disabled;
            });
            branchValidationMessage.classList.toggle('is-visible', disabled);
            if (!disabled && statusCard.dataset.state === 'idle') {
                setStatusState('idle', 'Ready to compare branches', 'Select an action to generate the review, description, or both from the chosen branch diff.');
            }
            if (disabled) {
                setStatusState('error', 'Choose two different branches', 'Base branch and compare branch cannot be the same.');
            }
        }

        function postGenerateRequest(mode) {
            setGeneratingState(true);
            logOutput.textContent = '';
            llmLogCounter = 0;
            var llmCountEl = document.getElementById('llmLogCount');
            if (llmCountEl) { llmCountEl.textContent = '0'; }
            var llmEntriesEl = document.getElementById('llmLogEntries');
            if (llmEntriesEl) { llmEntriesEl.innerHTML = ''; }
            appendLogMessage('Starting ' + mode + ' generation.');
            setResultVisible(false);
            if (mode === 'review' || mode === 'both') {
                reviewContent.querySelector('.content-wrapper').innerHTML = '';
            }
            if (mode === 'description' || mode === 'both') {
                descriptionContent.querySelector('.content-wrapper').innerHTML = '';
            }

            const selectedModel = getSelectedModel();
            if (!selectedModel) {
                appendLogMessage('Model name is required.');
                setGeneratingState(false);
                setStatusState('error', 'Model required', 'Choose a model before generating output.');
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

            const command = mode === 'review'
                ? 'reviewMerge'
                : mode === 'description'
                    ? 'generateDescription'
                    : 'reviewAndDescription';

            vscode.postMessage({
                command,
                baseBranch: baseBranchSelect.value,
                compareBranch: compareBranchSelect.value,
                provider: providerSelect.value,
                model: selectedModel,
                baseURL: providerSelect.value === 'custom' ? customBaseUrlInput.value.trim() : undefined,
                apiKey: providerSelect.value === 'custom' ? customApiKeyInput.value.trim() : undefined,
                contextWindow: isCustomModel ? customCapabilities.contextWindow : undefined,
                maxOutputTokens: isCustomModel ? customCapabilities.maxOutputTokens : undefined,
                taskInfo: taskInfoInput.value.trim(),
                language: languageSelect.value,
                contextStrategy: 'auto'
            });
        }

        updateModelOptions();
        checkBranchSelection();

        providerSelect.addEventListener('change', updateModelOptions);
        modelSelect.addEventListener('change', syncModelInput);
        baseBranchSelect.addEventListener('change', checkBranchSelection);
        compareBranchSelect.addEventListener('change', checkBranchSelection);
        document.querySelectorAll('.tab-button').forEach((button) => {
            button.addEventListener('click', () => switchTab(button.getAttribute('data-tab')));
        });
        controlsToggleBtn.addEventListener('click', () => toggleControlsPanel());
        logToggleBtn.addEventListener('click', () => toggleLogPanel());
        reviewBtn.addEventListener('click', () => postGenerateRequest('review'));
        descriptionBtn.addEventListener('click', () => postGenerateRequest('description'));
        reviewAndDescBtn.addEventListener('click', () => postGenerateRequest('both'));
        cancelBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancel' });
            appendLogMessage('Cancellation requested by user.');
            setGeneratingState(false);
            setStatusState('idle', 'Generation cancelled', 'The request was cancelled. Adjust the branch selection or model setup and generate again.');
        });
        viewDiffBtn.addEventListener('click', handleViewRawDiffAction);
        copyReviewBtn.addEventListener('click', () => handleCopyToClipboardAction(copyReviewBtn, currentReview, 'Copy review'));
        copyDescriptionBtn.addEventListener('click', () => handleCopyToClipboardAction(copyDescriptionBtn, currentDescription, 'Copy description'));

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
                case 'showLlmLog':
                    logToggleBtn.classList.remove('hidden');
                    appendLlmLogEntry(message.entry);
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
