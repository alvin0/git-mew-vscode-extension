import { LLMProvider } from '../../llm-adapter';
import { ReviewCustomModelSettings, ReviewCustomProviderConfig } from '../reviewShared/types';
import { buildEmptyState, buildPanelSection, buildReviewShell } from '../reviewShared/webview/layout';
import { buildLanguageOptionsHtml, buildModelOptionsMap, buildProviderOptionsHtml } from '../reviewShared/webview/options';
import { buildPlantUmlRepairMessageHandler, buildReviewDiffResultMessageHandler, buildSharedClientActions, buildSharedWebviewScriptState } from '../reviewShared/webview/scriptFragments';
import { buildSharedStyles } from '../reviewShared/webview/styles';

export interface SelectedCommitInfo {
    sha: string;
    subject: string;
    author: string;
    date: string;
}

export function generateSelectedCommitsWebviewContent(
    commits: SelectedCommitInfo[],
    providers?: LLMProvider[],
    availableModels?: Record<string, string[]>,
    currentProvider?: LLMProvider,
    currentModel?: string,
    savedLanguage?: string,
    customModelSettings?: ReviewCustomModelSettings,
    customProviderConfig?: ReviewCustomProviderConfig,
): string {
    const providerOptions = buildProviderOptionsHtml(providers, currentProvider);
    const modelOptionsMap = buildModelOptionsMap(providers, availableModels, currentProvider, currentModel);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Selected Commits</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/markdown-it/12.3.2/markdown-it.min.js"></script>
    <style>${buildSharedStyles({ includeTabs: true })}${getSelectedCommitsStyles()}</style>
</head>
<body>
    ${buildReviewShell({
        title: 'Review Selected Commits',
        description: `Reviewing ${commits.length} selected commit${commits.length > 1 ? 's' : ''} from the graph.`,
        heroActions: renderHeroActions(),
        controlPanel: renderControlPanel(commits, providerOptions, savedLanguage),
        outputPanel: renderOutputPanel()
    })}
    <script>${getClientScript(commits, modelOptionsMap, customModelSettings || {}, customProviderConfig || { hasApiKey: false })}</script>
</body>
</html>`;
}

function getSelectedCommitsStyles(): string {
    return `
        .commit-list-review {
            display: flex;
            flex-direction: column;
            gap: var(--gm-space-1);
            max-height: 240px;
            overflow-y: auto;
            padding: var(--gm-space-1);
        }
        .commit-review-item {
            display: flex;
            align-items: center;
            gap: var(--gm-space-3);
            padding: 8px 12px;
            border: 1px solid var(--gm-border);
            border-radius: var(--gm-radius-sm);
            background: var(--gm-surface);
            font-size: 12px;
        }
        .commit-review-item__sha {
            font-family: monospace;
            font-size: 11px;
            color: var(--gm-accent);
            flex-shrink: 0;
        }
        .commit-review-item__subject {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .commit-review-item__meta {
            color: var(--gm-muted);
            font-size: 11px;
            white-space: nowrap;
        }
    `;
}

function renderControlPanel(
    commits: SelectedCommitInfo[],
    providerOptions: string,
    savedLanguage?: string,
): string {
    const commitItems = commits.map(c => {
        const sha = escapeHtmlAttr(c.sha.slice(0, 7));
        const subject = escapeHtmlAttr(c.subject);
        const author = escapeHtmlAttr(c.author);
        const date = escapeHtmlAttr(c.date);
        return `<div class="commit-review-item">
            <span class="commit-review-item__sha">${sha}</span>
            <span class="commit-review-item__subject" title="${subject}">${subject}</span>
            <span class="commit-review-item__meta">${author} · ${date}</span>
        </div>`;
    }).join('');

    return [
        buildPanelSection({
            title: 'Selected commits',
            description: `${commits.length} commit${commits.length > 1 ? 's' : ''} selected for review.`,
            tone: 'accent',
            content: `<div class="commit-list-review">${commitItems}</div>`
        }),
        buildPanelSection({
            title: 'AI setup',
            description: 'Pick the provider and model.',
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
                    <h2 id="statusTitle" class="status-card__title">Ready to review selected commits</h2>
                    <p id="statusDetail" class="status-card__detail">Configure AI settings and generate a review for the selected commits.</p>
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
            description: 'Generate a review to see AI feedback rendered with markdown, diagrams, and the exact diff patch.',
            note: 'Use the Diff tab to inspect the exact patch and open it in the editor when needed.'
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
                            <p>AI feedback for the selected commits.</p>
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
                            <h2>Commit range diff</h2>
                            <p>The combined patch used to generate this review.</p>
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
    commits: SelectedCommitInfo[],
    modelOptionsMap: Record<string, string>,
    customModelSettings: ReviewCustomModelSettings,
    customProviderConfig: ReviewCustomProviderConfig,
): string {
    return `
        const vscode = acquireVsCodeApi();
        const selectedCommits = ${JSON.stringify(commits)};
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
        ${buildSharedClientActions(['reviewBtn'])}
        ${buildReviewDiffResultMessageHandler()}
        ${buildPlantUmlRepairMessageHandler()}

        function postGenerateRequest() {
            setGeneratingState(true);
            logOutput.textContent = '';
            llmLogCounter = 0;
            var llmCountEl = document.getElementById('llmLogCount');
            if (llmCountEl) { llmCountEl.textContent = '0'; }
            var llmEntriesEl = document.getElementById('llmLogEntries');
            if (llmEntriesEl) { llmEntriesEl.innerHTML = ''; }
            appendLogMessage('Starting selected commits review generation.');
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

            // oldest = last in array (bottom of graph), newest = first in array (top/HEAD)
            const oldest = selectedCommits[selectedCommits.length - 1];
            const newest = selectedCommits[0];

            vscode.postMessage({
                command: 'reviewSelectedCommits',
                oldestSha: oldest.sha,
                newestSha: newest.sha,
                commitCount: selectedCommits.length,
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
            setStatusState('idle', 'Generation cancelled', 'The request was cancelled. Generate again when ready.');
        });
        viewDiffBtn.addEventListener('click', handleViewRawDiffAction);
        openDiffBtn.addEventListener('click', handleViewRawDiffAction);
        copyReviewBtn.addEventListener('click', function() { handleCopyToClipboardAction(copyReviewBtn, currentReview, 'Copy review'); });
        copyDiffBtn.addEventListener('click', function() { handleCopyToClipboardAction(copyDiffBtn, currentRawDiff, 'Copy diff'); });

        window.addEventListener('message', function(event) {
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
