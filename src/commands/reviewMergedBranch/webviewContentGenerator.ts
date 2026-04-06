import { LLMProvider } from '../../llm-adapter';
import { MergedBranchInfo } from '../../services/utils/gitService';
import { ReviewCustomModelSettings, ReviewCustomProviderConfig } from '../reviewShared/types';
import { buildEmptyState, buildPanelSection, buildReviewShell } from '../reviewShared/webview/layout';
import { buildLanguageOptionsHtml, buildModelOptionsMap, buildProviderOptionsHtml } from '../reviewShared/webview/options';
import { buildPlantUmlRepairMessageHandler, buildReviewDiffResultMessageHandler, buildSharedClientActions, buildSharedWebviewScriptState } from '../reviewShared/webview/scriptFragments';
import { buildSharedStyles } from '../reviewShared/webview/styles';

export function generateMergedBranchWebviewContent(
    mergedBranches: MergedBranchInfo[],
    providers?: LLMProvider[],
    availableModels?: Record<string, string[]>,
    currentProvider?: LLMProvider,
    currentModel?: string,
    savedLanguage?: string,
    customModelSettings?: ReviewCustomModelSettings,
    customProviderConfig?: ReviewCustomProviderConfig,
    visibleBranchLimit: number = 20
): string {
    const visibleBranches = mergedBranches.slice(0, visibleBranchLimit);
    const providerOptions = buildProviderOptionsHtml(providers, currentProvider);
    const modelOptionsMap = buildModelOptionsMap(providers, availableModels, currentProvider, currentModel);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Merged Branch</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/markdown-it/12.3.2/markdown-it.min.js"></script>
    <style>${buildSharedStyles({ includeTabs: true })}${getMergedBranchStyles()}</style>
</head>
<body>
    ${buildReviewShell({
        title: 'Review Merged Branch',
        description: 'Select a previously merged branch to generate an AI-powered code review from its merge commit diff.',
        heroActions: renderHeroActions(),
        controlPanel: renderControlPanel(visibleBranches, providerOptions, savedLanguage, visibleBranchLimit),
        outputPanel: renderOutputPanel()
    })}
    <script>${getClientScript(visibleBranches, modelOptionsMap, customModelSettings || {}, customProviderConfig || { hasApiKey: false }, visibleBranchLimit)}</script>
</body>
</html>`;
}

function getMergedBranchStyles(): string {
    return `
        .branch-list {
            display: flex;
            flex-direction: column;
            gap: var(--gm-space-2);
            max-height: 320px;
            overflow-y: auto;
            padding: var(--gm-space-1);
        }

        .branch-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--gm-space-3);
            padding: 10px 12px;
            border: 1px solid var(--gm-border);
            border-radius: var(--gm-radius-sm);
            background: var(--gm-surface);
            cursor: pointer;
            transition: border-color 140ms ease, background-color 140ms ease;
        }

        .branch-item:hover {
            border-color: var(--gm-border-strong);
            background: var(--gm-surface-alt);
        }

        .branch-item.selected {
            border-color: var(--gm-accent);
            background: var(--gm-accent-soft);
        }

        .branch-item__name {
            font-weight: 700;
            font-size: 13px;
            word-break: break-all;
        }

        .branch-item__meta {
            display: flex;
            gap: var(--gm-space-3);
            color: var(--gm-muted);
            font-size: 11px;
            white-space: nowrap;
        }

        .branch-empty {
            padding: var(--gm-space-5);
            text-align: center;
            color: var(--gm-muted);
            font-size: 13px;
        }

        #branchSearch {
            margin-bottom: var(--gm-space-2);
        }
    `;
}

function renderControlPanel(
    mergedBranches: MergedBranchInfo[],
    providerOptions: string,
    savedLanguage?: string,
    visibleBranchLimit: number = 20,
): string {
    return [
        buildPanelSection({
            title: 'Merged branches',
            description: `Showing the ${visibleBranchLimit} most recent merged branches. Use search to find older branches without loading the full history.`,
            tone: 'accent',
            content: renderBranchListSection(mergedBranches, visibleBranchLimit)
        }),
        buildPanelSection({
            title: 'AI setup',
            description: 'Pick the provider and model. Advanced settings stay tucked away unless you switch to custom or custom-model flows.',
            content: renderModelSelectionSection(providerOptions)
        }),
        buildPanelSection({
            title: 'Context',
            description: 'Add task context and response preferences to shape the review output.',
            content: `
                <div class="stack">
                    <div class="field">
                        <label for="taskInfo">Current task info</label>
                        <textarea id="taskInfo" placeholder="Describe the feature, issue, or rollout context that the review should understand."></textarea>
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

function escapeHtmlAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderBranchListSection(mergedBranches: MergedBranchInfo[], visibleBranchLimit: number): string {
    if (mergedBranches.length === 0) {
        return `<div class="branch-empty">No merged branches found in this repository.</div>`;
    }

    const branchItems = mergedBranches.map(info => {
        const name = escapeHtmlAttr(info.branchName);
        const date = info.mergeDate.toLocaleDateString();
        const author = escapeHtmlAttr(info.mergeAuthor);
        return `<div class="branch-item" data-sha="${escapeHtmlAttr(info.mergeCommitSha)}" data-branch="${name}">
            <span class="branch-item__name">${name}</span>
            <span class="branch-item__meta"><span>${date}</span><span>${author}</span></span>
        </div>`;
    }).join('');

    return `
        <div class="stack">
            <input type="text" id="branchSearch" placeholder="Search branches..." />
            <div class="field__hint">Showing the ${visibleBranchLimit} most recent merged branches. Search to find older results.</div>
            <div class="branch-list" id="branchList">
                ${branchItems}
            </div>
        </div>
    `;
}

function renderHeroActions(): string {
    return `
        <button id="reviewBtn" class="btn-primary" disabled>Generate review</button>
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
                    <h2 id="statusTitle" class="status-card__title">Ready to review a merged branch</h2>
                    <p id="statusDetail" class="status-card__detail">Select a merged branch from the list, then generate a review from its merge commit diff.</p>
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
            title: 'Review output will appear here',
            description: 'Pick a merged branch and generate a review to see AI feedback rendered with markdown, diagrams, and the exact merge patch.',
            note: 'Use the Diff tab to inspect the exact merge commit patch and open it in the editor when needed.'
        })}
        <div id="result-container" class="result-workspace hidden">
            <section id="errorReport" class="error-report hidden"></section>
            <div class="tabs" role="tablist" aria-label="Output tabs">
                <button class="tab-button active" data-tab="review" id="reviewTab" aria-selected="true">Review</button>
                <button class="tab-button" data-tab="diff" id="diffTab" aria-selected="false">Diff</button>
            </div>
            <div class="tab-content">
                <div id="review-tab" class="tab-pane active">
                    <div class="sticky-result-header">
                        <div>
                            <h2>Review result</h2>
                            <p>AI feedback for the selected merged branch.</p>
                        </div>
                        <div class="action-buttons">
                            <button id="viewDiffBtn" class="btn-ghost">View raw diff</button>
                            <button class="btn-secondary" id="copyReviewBtn">Copy review</button>
                        </div>
                    </div>
                    <div id="review" class="review-content"><div class="content-wrapper"></div></div>
                </div>
                <div id="diff-tab" class="tab-pane">
                    <div class="sticky-result-header">
                        <div>
                            <h2>Merge diff</h2>
                            <p>The exact merge-commit patch used to generate this review.</p>
                        </div>
                        <div class="action-buttons">
                            <button id="openDiffBtn" class="btn-ghost">Open in editor</button>
                            <button class="btn-secondary" id="copyDiffBtn">Copy diff</button>
                        </div>
                    </div>
                    <div id="diff" class="review-content"><div class="content-wrapper"></div></div>
                </div>
            </div>
        </div>
    `;
}

function getClientScript(
    mergedBranches: MergedBranchInfo[],
    modelOptionsMap: Record<string, string>,
    customModelSettings: ReviewCustomModelSettings,
    customProviderConfig: ReviewCustomProviderConfig,
    visibleBranchLimit: number
): string {
    const branchData = mergedBranches.map(b => ({
        sha: b.mergeCommitSha,
        branch: b.branchName,
        author: b.mergeAuthor,
        mergeDateLabel: b.mergeDate.toLocaleDateString(),
    }));

    return `
        const vscode = acquireVsCodeApi();
        const initialBranches = ${JSON.stringify(branchData)};
        const visibleBranchLimit = ${JSON.stringify(visibleBranchLimit)};
        const branchSearchInput = document.getElementById('branchSearch');
        const branchList = document.getElementById('branchList');
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
        const diffContent = document.getElementById('diff');
        const copyReviewBtn = document.getElementById('copyReviewBtn');
        const copyDiffBtn = document.getElementById('copyDiffBtn');
        const viewDiffBtn = document.getElementById('viewDiffBtn');
        const openDiffBtn = document.getElementById('openDiffBtn');
        ${buildSharedWebviewScriptState(modelOptionsMap, customModelSettings, customProviderConfig)}
        ${buildSharedClientActions(['reviewBtn'], { idleHook: 'checkBranchSelection();' })}
        ${buildReviewDiffResultMessageHandler()}
        ${buildPlantUmlRepairMessageHandler()}

        let selectedSha = null;
        let selectedBranchName = null;
        let branchSearchDebounceHandle = null;
        let latestBranchSearchRequestId = 0;

        function buildBranchItemMarkup(branch) {
            const name = escapeHtml(branch.branch || '');
            const sha = escapeHtml(branch.sha || '');
            const author = escapeHtml(branch.author || '');
            const mergeDateLabel = escapeHtml(branch.mergeDateLabel || '');
            const isSelected = selectedSha && selectedSha === branch.sha ? ' selected' : '';
            return '<div class="branch-item' + isSelected + '" data-sha="' + sha + '" data-branch="' + name + '">' +
                '<span class="branch-item__name">' + name + '</span>' +
                '<span class="branch-item__meta"><span>' + mergeDateLabel + '</span><span>' + author + '</span></span>' +
                '</div>';
        }

        function renderBranchListItems(branches, emptyMessage) {
            if (!branchList) {
                return;
            }

            branchList.innerHTML = branches.length > 0
                ? branches.map(buildBranchItemMarkup).join('')
                : '<div class="branch-empty">' + escapeHtml(emptyMessage) + '</div>';

            const selectedStillVisible = selectedSha && branches.some(function(branch) {
                return branch.sha === selectedSha;
            });

            if (!selectedStillVisible) {
                selectedSha = null;
                selectedBranchName = null;
            }

            checkBranchSelection();
        }

        function restoreInitialBranchList() {
            renderBranchListItems(initialBranches, 'No merged branches found in this repository.');
        }

        function checkBranchSelection() {
            reviewBtn.disabled = !selectedSha;
            if (!selectedSha && statusCard.dataset.state === 'idle') {
                setStatusState('idle', 'Ready to review a merged branch', 'Select a merged branch from the list, then generate a review from its merge commit diff.');
            }
        }

        function selectBranch(item) {
            document.querySelectorAll('.branch-item.selected').forEach(function(el) {
                el.classList.remove('selected');
            });
            item.classList.add('selected');
            selectedSha = item.getAttribute('data-sha');
            selectedBranchName = item.getAttribute('data-branch');
            checkBranchSelection();
        }

        if (branchList) {
            branchList.addEventListener('click', function(e) {
                var item = e.target.closest('.branch-item');
                if (item) {
                    selectBranch(item);
                }
            });
        }

        if (branchSearchInput) {
            branchSearchInput.addEventListener('input', function() {
                var query = branchSearchInput.value.trim();

                if (branchSearchDebounceHandle) {
                    clearTimeout(branchSearchDebounceHandle);
                    branchSearchDebounceHandle = null;
                }

                if (!query) {
                    latestBranchSearchRequestId++;
                    restoreInitialBranchList();
                    return;
                }

                const requestId = ++latestBranchSearchRequestId;
                branchSearchDebounceHandle = setTimeout(function() {
                    branchSearchDebounceHandle = null;
                    selectedSha = null;
                    selectedBranchName = null;
                    checkBranchSelection();
                    if (branchList) {
                        branchList.innerHTML = '<div class="branch-empty">Searching merged branches...</div>';
                    }
                    vscode.postMessage({
                        command: 'searchMergedBranches',
                        query: query,
                        requestId: requestId
                    });
                }, 250);
            });
        }

        function postGenerateRequest() {
            if (!selectedSha) {
                setStatusState('error', 'No branch selected', 'Please select a merged branch from the list before generating a review.');
                return;
            }

            setGeneratingState(true);
            logOutput.textContent = '';
            llmLogCounter = 0;
            var llmCountEl = document.getElementById('llmLogCount');
            if (llmCountEl) { llmCountEl.textContent = '0'; }
            var llmEntriesEl = document.getElementById('llmLogEntries');
            if (llmEntriesEl) { llmEntriesEl.innerHTML = ''; }
            appendLogMessage('Starting merged branch review generation.');
            setResultVisible(false);
            reviewContent.querySelector('.content-wrapper').innerHTML = '';

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

            vscode.postMessage({
                command: 'reviewMergedBranch',
                mergeCommitSha: selectedSha,
                branchName: selectedBranchName,
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
        restoreInitialBranchList();

        providerSelect.addEventListener('change', updateModelOptions);
        modelSelect.addEventListener('change', syncModelInput);
        document.querySelectorAll('.tab-button').forEach(function(button) {
            button.addEventListener('click', function() { switchTab(button.getAttribute('data-tab')); });
        });
        controlsToggleBtn.addEventListener('click', function() { toggleControlsPanel(); });
        logToggleBtn.addEventListener('click', function() { toggleLogPanel(); });
        reviewBtn.addEventListener('click', function() { postGenerateRequest(); });
        cancelBtn.addEventListener('click', function() {
            vscode.postMessage({ command: 'cancel' });
            appendLogMessage('Cancellation requested by user.');
            setGeneratingState(false);
            setStatusState('idle', 'Generation cancelled', 'The request was cancelled. Select a branch and generate again when ready.');
        });
        viewDiffBtn.addEventListener('click', handleViewRawDiffAction);
        openDiffBtn.addEventListener('click', handleViewRawDiffAction);
        copyReviewBtn.addEventListener('click', function() { handleCopyToClipboardAction(copyReviewBtn, currentReview, 'Copy review'); });
        copyDiffBtn.addEventListener('click', function() { handleCopyToClipboardAction(copyDiffBtn, currentRawDiff, 'Copy diff'); });

        window.addEventListener('message', function(event) {
            const message = event.data;
            const markdownRenderer = window.markdownit({ html: true });

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
                case 'updateMergedBranchList':
                    if (message.requestId !== undefined && message.requestId !== latestBranchSearchRequestId) {
                        break;
                    }
                    renderBranchListItems(
                        message.branches || [],
                        message.emptyMessage || ('No merged branches found. Search to narrow the history to the most relevant ' + visibleBranchLimit + ' results.')
                    );
                    break;
                case 'replacePlantUmlContent':
                    handlePlantUmlRepairResult(message, markdownRenderer);
                    break;
            }
        });
    `;
}
