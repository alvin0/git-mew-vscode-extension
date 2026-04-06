import { ReviewCustomModelSettings } from '../types';

export function buildSharedWebviewScriptState(
    modelOptionsMap: Record<string, string>,
    customModelSettings: ReviewCustomModelSettings,
    customProviderConfig: { baseUrl?: string; hasApiKey: boolean; },
    options?: { includeDescriptionState?: boolean; }
): string {
    return `
        const modelOptions = ${JSON.stringify(modelOptionsMap)};
        const customSettingsByProvider = ${JSON.stringify(customModelSettings)};
        const customProviderConfig = ${JSON.stringify(customProviderConfig)};
        const CUSTOM_MODEL_SENTINEL = '__custom_model__';
        let currentReview = '';
        ${options?.includeDescriptionState ? "let currentDescription = '';" : ''}
        let currentRawDiff = '';
        let currentErrorReport = null;
        const plantUmlRepairAttempts = { review: 0, description: 0 };
    `;
}

export function buildSharedClientActions(actionButtonIds: string[], options?: { idleHook?: string; }): string {
    const buttonRefs = actionButtonIds.join(', ');

    return `
        let llmLogCounter = 0;

        function appendLogMessage(message) {
            const timestamp = new Date().toLocaleTimeString();
            const line = '[' + timestamp + '] ' + message;
            logOutput.textContent += (logOutput.textContent ? '\\n' : '') + line;
            logOutput.scrollTop = logOutput.scrollHeight;
        }

        function appendLlmLogEntry(entry) {
            llmLogCounter++;
            const countEl = document.getElementById('llmLogCount');
            if (countEl) {
                countEl.textContent = String(llmLogCounter);
            }

            const container = document.getElementById('llmLogEntries');
            if (!container) { return; }

            const entryEl = document.createElement('div');
            entryEl.className = 'llm-entry';

            const ts = new Date(entry.timestamp).toLocaleTimeString();
            const duration = entry.durationMs ? (entry.durationMs / 1000).toFixed(1) + 's' : '?';
            const tokens = [
                entry.promptTokens ? 'in:' + entry.promptTokens : '',
                entry.completionTokens ? 'out:' + entry.completionTokens : '',
            ].filter(Boolean).join(' / ') || '?';

            const headerEl = document.createElement('div');
            headerEl.className = 'llm-entry__header';
            headerEl.innerHTML =
                '<span>' + escapeHtml(entry.stage) + ' — ' + escapeHtml(entry.provider) + '/' + escapeHtml(entry.model) + '</span>' +
                '<span class="llm-entry__meta">' +
                '<span>' + ts + '</span>' +
                '<span>' + duration + '</span>' +
                '<span>' + tokens + '</span>' +
                '</span>';
            headerEl.addEventListener('click', function() {
                entryEl.classList.toggle('is-expanded');
            });

            const bodyEl = document.createElement('div');
            bodyEl.className = 'llm-entry__body';

            function makeSection(label, text) {
                const section = document.createElement('div');
                section.className = 'llm-entry__section';
                const labelEl = document.createElement('span');
                labelEl.className = 'llm-entry__section-label';
                labelEl.textContent = label;
                const pre = document.createElement('pre');
                pre.textContent = text || '(empty)';
                section.appendChild(labelEl);
                section.appendChild(pre);
                return section;
            }

            bodyEl.appendChild(makeSection('System message', entry.systemMessage));
            bodyEl.appendChild(makeSection('Prompt', entry.prompt));
            bodyEl.appendChild(makeSection('Response', entry.response));

            entryEl.appendChild(headerEl);
            entryEl.appendChild(bodyEl);
            container.appendChild(entryEl);
            container.scrollTop = container.scrollHeight;
        }

        function switchLogTab(targetTab) {
            document.querySelectorAll('.log-tab-btn').forEach(function(btn) {
                var isActive = btn.getAttribute('data-log-tab') === targetTab;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-selected', String(isActive));
            });
            var execPane = document.getElementById('executionLogPane');
            var llmPane = document.getElementById('llmLogPane');
            if (execPane) { execPane.classList.toggle('active', targetTab === 'execution'); }
            if (llmPane) { llmPane.classList.toggle('active', targetTab === 'llm'); }
        }

        (function initLogTabs() {
            document.querySelectorAll('.log-tab-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    switchLogTab(btn.getAttribute('data-log-tab'));
                });
            });
        })();

        function setStatusState(state, title, detail) {
            statusCard.dataset.state = state;
            statusBadge.textContent = state === 'running'
                ? 'Running'
                : state === 'success'
                    ? 'Ready'
                    : state === 'error'
                        ? 'Attention'
                        : 'Waiting';
            statusTitle.textContent = title;
            statusDetail.textContent = detail;
        }

        function setEmptyStateVisible(isVisible) {
            if (emptyState) {
                emptyState.classList.toggle('hidden', !isVisible);
            }
        }

        function setResultVisible(isVisible) {
            resultContainer.classList.toggle('hidden', !isVisible);
            setEmptyStateVisible(!isVisible);
        }

        function clearErrorReport() {
            currentErrorReport = null;
            if (!errorReportContainer) {
                return;
            }

            errorReportContainer.classList.add('hidden');
            errorReportContainer.innerHTML = '';
        }

        function buildErrorField(label, value) {
            if (!value) {
                return '';
            }

            return '<div class="error-report__field"><span class="error-report__label">' + label + '</span><code class="error-report__value">' + escapeHtml(String(value)) + '</code></div>';
        }

        function escapeHtml(value) {
            return value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function renderErrorReport(error) {
            currentErrorReport = error;
            if (!errorReportContainer) {
                return;
            }

            const metadata = [
                buildErrorField('Operation', error.operation),
                buildErrorField('Provider', error.provider),
                buildErrorField('Model', error.model),
                buildErrorField('Base branch', error.baseBranch),
                buildErrorField('Compare branch', error.compareBranch),
                buildErrorField('Command', error.command),
                buildErrorField('Target', error.target),
                buildErrorField('Timestamp', error.timestamp)
            ].filter(Boolean).join('');

            const hint = error.hint
                ? '<p class="error-report__hint">' + escapeHtml(error.hint) + '</p>'
                : '';

            errorReportContainer.innerHTML = [
                '<div class="error-report__header">',
                '<div>',
                '<p class="error-report__eyebrow">Failure report</p>',
                '<h3 class="error-report__title">' + escapeHtml(error.title || 'Review workflow failed') + '</h3>',
                '<p class="error-report__summary">' + escapeHtml(error.summary || 'Unknown error occurred.') + '</p>',
                '</div>',
                '<button type="button" id="copyErrorReportBtn" class="btn-secondary">Copy error report</button>',
                '</div>',
                metadata ? '<div class="error-report__meta">' + metadata + '</div>' : '',
                hint,
                '<div class="error-report__details">',
                '<div class="error-report__label">Raw error</div>',
                '<pre class="error-report__pre">' + escapeHtml(error.rawError || error.summary || 'Unknown error occurred.') + '</pre>',
                '</div>'
            ].join('');

            errorReportContainer.classList.remove('hidden');
            const copyErrorReportBtn = document.getElementById('copyErrorReportBtn');
            if (copyErrorReportBtn) {
                copyErrorReportBtn.addEventListener('click', () => {
                    handleCopyToClipboardAction(
                        copyErrorReportBtn,
                        JSON.stringify(currentErrorReport, null, 2),
                        'Copy error report'
                    );
                });
            }
        }

        function setGeneratingState(isGenerating) {
            cancelBtn.classList.toggle('hidden', !isGenerating);
            const actionButtons = [${buttonRefs}];
            actionButtons.forEach((button) => {
                button.disabled = isGenerating;
            });
            if (isGenerating) {
                clearErrorReport();
                setStatusState('running', 'Generating output', 'Git Mew is collecting context, sending the request, and preparing the result.');
                logToggleBtn.classList.remove('hidden');
            } else {
                ${options?.idleHook || ''}
            }
        }

        function toggleControlsPanel(forceCollapsed) {
            if (!dashboard || !controlsPanel || !controlsToggleBtn) {
                return;
            }

            const shouldCollapse = typeof forceCollapsed === 'boolean'
                ? forceCollapsed
                : !dashboard.classList.contains('controls-collapsed');
            dashboard.classList.toggle('controls-collapsed', shouldCollapse);
            controlsToggleBtn.textContent = shouldCollapse ? 'Show AI setup' : 'Hide AI setup';
            controlsToggleBtn.setAttribute('aria-expanded', String(!shouldCollapse));
        }

        function toggleLogPanel(forceVisible) {
            const shouldShow = typeof forceVisible === 'boolean'
                ? forceVisible
                : logPanel.classList.contains('is-collapsed');
            logPanel.classList.toggle('is-collapsed', !shouldShow);
            logPanel.classList.toggle('hidden', !shouldShow);
            logPanel.open = shouldShow;
            logToggleBtn.textContent = shouldShow ? 'Hide activity log' : 'Show activity log';
        }

        function updateModelOptions() {
            const provider = providerSelect.value;
            const options = modelOptions[provider] || '';
            modelSelect.innerHTML = options + '<option value="' + CUSTOM_MODEL_SENTINEL + '">Custom model...</option>';
            const selectedOption = modelSelect.querySelector('option[selected]');
            if (!selectedOption) {
                modelSelect.value = provider === 'custom' ? CUSTOM_MODEL_SENTINEL : modelSelect.value;
            }
            syncModelInput();
        }

        function syncModelInput() {
            const forceCustomInput = providerSelect.value === 'custom' || modelSelect.value === CUSTOM_MODEL_SENTINEL;
            customModelInput.classList.toggle('hidden', !forceCustomInput);
            modelSelect.classList.toggle('hidden', providerSelect.value === 'custom');
            advancedSettings.classList.toggle('hidden', !forceCustomInput);
            customModelSettingsContainer.classList.toggle('hidden', !forceCustomInput);
            customProviderSettingsContainer.classList.toggle('hidden', providerSelect.value !== 'custom');

            const providerSettings = customSettingsByProvider[providerSelect.value] || {
                contextWindow: 128000,
                maxOutputTokens: 16384
            };

            contextWindowInput.value = String(providerSettings.contextWindow);
            maxOutputTokensInput.value = String(providerSettings.maxOutputTokens);

            if (providerSelect.value === 'custom' && !customModelInput.value.trim()) {
                const selectedPreset = modelSelect.value && modelSelect.value !== CUSTOM_MODEL_SENTINEL
                    ? modelSelect.value
                    : '';
                customModelInput.value = selectedPreset;
            }

            if (providerSelect.value === 'custom') {
                customBaseUrlInput.value = customProviderConfig.baseUrl || '';
                customApiKeyInput.placeholder = customProviderConfig.hasApiKey
                    ? 'Leave blank to use saved API key'
                    : 'Custom provider API key';
                advancedSettings.open = true;
            } else {
                customBaseUrlInput.value = '';
                customApiKeyInput.value = '';
                customApiKeyInput.placeholder = 'Custom provider API key';
                if (!forceCustomInput) {
                    advancedSettings.open = false;
                }
            }
        }

        function getSelectedModel() {
            if (providerSelect.value === 'custom' || modelSelect.value === CUSTOM_MODEL_SENTINEL) {
                return customModelInput.value.trim();
            }

            return modelSelect.value;
        }

        function getCustomCapabilities() {
            return {
                contextWindow: Number(contextWindowInput.value),
                maxOutputTokens: Number(maxOutputTokensInput.value)
            };
        }

        function getReviewContentWrapper() {
            return reviewContent ? reviewContent.querySelector('.content-wrapper') : null;
        }

        function getDescriptionContentWrapper() {
            return typeof descriptionContent !== 'undefined' && descriptionContent
                ? descriptionContent.querySelector('.content-wrapper')
                : null;
        }

        function getDiffContentWrapper() {
            return typeof diffContent !== 'undefined' && diffContent
                ? diffContent.querySelector('.content-wrapper')
                : null;
        }

        function handleWebviewErrorMessage(message) {
            setGeneratingState(false);
            const error = message.error || {
                title: 'Review workflow failed',
                summary: message.message || 'Unknown error occurred.',
                rawError: message.message || 'Unknown error occurred.',
                operation: 'unknown',
                timestamp: new Date().toISOString()
            };
            setStatusState('error', error.title || 'Generation failed', error.summary || error.rawError);
            appendLogMessage('Generation failed: ' + (error.summary || error.rawError));
            logToggleBtn.classList.remove('hidden');
            setResultVisible(true);
            renderErrorReport(error);
            const reviewWrapper = getReviewContentWrapper();
            if (reviewWrapper) {
                reviewWrapper.innerHTML = '';
            }
            const descriptionWrapper = typeof getDescriptionContentWrapper === 'function'
                ? getDescriptionContentWrapper()
                : null;
            if (descriptionWrapper) {
                descriptionWrapper.innerHTML = '';
            }
        }

        function handleViewRawDiffAction() {
            if (currentRawDiff) {
                vscode.postMessage({
                    command: 'viewRawDiff',
                    diff: currentRawDiff
                });
            }
        }

        function handleCopyToClipboardAction(button, value, defaultLabel) {
            navigator.clipboard.writeText(value).then(() => {
                button.textContent = 'Copied';
                setTimeout(() => {
                    button.textContent = defaultLabel;
                }, 1800);
            });
        }

        function encodePlantUmlSource(source) {
            const bytes = new TextEncoder().encode(source);
            let hex = '';
            for (const byte of bytes) {
                hex += byte.toString(16).padStart(2, '0');
            }
            return '~h' + hex;
        }

        function buildPlantUmlImageUrl(source) {
            return 'https://www.plantuml.com/plantuml/svg/' + encodePlantUmlSource(source);
        }

        function extractPlantUmlErrorMessage(svgText) {
            if (!svgText) {
                return '';
            }

            const normalized = svgText
                .replace(/<br\\s*\\/?>/gi, '\\n')
                .replace(/<[^>]+>/g, ' ')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/\\s+/g, ' ')
                .trim();

            const markers = [
                /Syntax Error\\??.*?(?= PlantUML|If you like PlantUML|$)/i,
                /Assumed diagram type:.*?(?= PlantUML|If you like PlantUML|$)/i,
                /From string \\(line \\d+\\).*?(?=@startuml|PlantUML|If you like PlantUML|$)/i
            ];
            const parts = [];
            for (const marker of markers) {
                const match = normalized.match(marker);
                if (match && match[0]) {
                    parts.push(match[0].trim());
                }
            }

            if (parts.length > 0) {
                return Array.from(new Set(parts)).join('\\n');
            }

            return /Syntax Error|Assumed diagram type|From string \\(line/i.test(normalized)
                ? normalized.slice(0, 260)
                : '';
        }

        function setPlantUmlErrorState(wrapper, errorMessage) {
            wrapper.classList.toggle('has-error', Boolean(errorMessage));
            let errorNode = wrapper.querySelector('.plantuml-error');
            if (!errorMessage) {
                if (errorNode) {
                    errorNode.remove();
                }
                return;
            }

            if (!errorNode) {
                errorNode = document.createElement('div');
                errorNode.className = 'plantuml-error';
                wrapper.appendChild(errorNode);
            }

            errorNode.textContent = errorMessage;
        }

        async function inspectPlantUmlImage(wrapper, image) {
            try {
                const response = await fetch(image.src);
                if (!response.ok) {
                    setPlantUmlErrorState(wrapper, 'PlantUML server returned HTTP ' + response.status + '.');
                    return;
                }

                const svgText = await response.text();
                const errorMessage = extractPlantUmlErrorMessage(svgText);
                setPlantUmlErrorState(wrapper, errorMessage);
                if (errorMessage) {
                    appendLogMessage('PlantUML server reported a diagram issue: ' + errorMessage.replace(/\\n/g, ' | '));
                }
            } catch (error) {
                appendLogMessage('Could not inspect PlantUML SVG for detailed errors: ' + error);
            }
        }

        function ensurePlantUmlModal() {
            let modal = document.getElementById('plantumlModal');
            if (modal) {
                return modal;
            }

            modal = document.createElement('div');
            modal.id = 'plantumlModal';
            modal.className = 'plantuml-modal hidden';
            modal.innerHTML = [
                '<div class="plantuml-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="plantumlModalTitle">',
                '<div class="plantuml-modal__header">',
                '<h3 id="plantumlModalTitle" class="plantuml-modal__title">PlantUML diagram</h3>',
                '<button type="button" id="plantumlModalClose" class="btn-secondary">Close</button>',
                '</div>',
                '<div class="plantuml-modal__body">',
                '<img id="plantumlModalImage" class="plantuml-modal__image" alt="Expanded PlantUML diagram" />',
                '</div>',
                '</div>'
            ].join('');
            document.body.appendChild(modal);

            const closeBtn = document.getElementById('plantumlModalClose');
            closeBtn.addEventListener('click', hidePlantUmlModal);
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    hidePlantUmlModal();
                }
            });
            window.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
                    hidePlantUmlModal();
                }
            });

            return modal;
        }

        function showPlantUmlModal(imageUrl) {
            const modal = ensurePlantUmlModal();
            const modalImage = document.getElementById('plantumlModalImage');
            modalImage.src = imageUrl;
            modal.classList.remove('hidden');
        }

        function hidePlantUmlModal() {
            const modal = document.getElementById('plantumlModal');
            if (!modal) {
                return;
            }

            modal.classList.add('hidden');
        }

        function renderMarkdownWithDiagrams(container, markdownText, markdownRenderer, targetKey) {
            container.innerHTML = markdownRenderer.render(markdownText || '');
            renderPlantUmlDiagrams(container, markdownText || '', targetKey);
        }

        function renderPlantUmlDiagrams(scope, markdownText, targetKey) {
            const blocks = Array.from(scope.querySelectorAll('pre code.language-plantuml'));
            if (blocks.length === 0) {
                return;
            }

            let repairRequested = false;
            for (const block of blocks) {
                const pre = block.closest('pre');
                if (!pre) {
                    continue;
                }

                const source = block.textContent || '';
                const wrapper = document.createElement('div');
                wrapper.className = 'plantuml-wrapper';
                const frame = document.createElement('div');
                frame.className = 'plantuml-frame';
                const toolbar = document.createElement('div');
                toolbar.className = 'plantuml-toolbar';
                const expandButton = document.createElement('button');
                expandButton.type = 'button';
                expandButton.className = 'plantuml-expand-btn';
                expandButton.textContent = 'View larger';
                const fixButton = document.createElement('button');
                fixButton.type = 'button';
                fixButton.className = 'plantuml-fix-btn';
                fixButton.textContent = 'Fix with AI';
                const image = document.createElement('img');
                image.className = 'plantuml-diagram';
                image.alt = 'PlantUML diagram';
                image.loading = 'lazy';
                expandButton.addEventListener('click', () => showPlantUmlModal(image.src));
                fixButton.addEventListener('click', () => {
                    const errorMessageNode = wrapper.querySelector('.plantuml-error');
                    const detailedMessage = errorMessageNode && errorMessageNode.textContent
                        ? errorMessageNode.textContent
                        : 'User requested PlantUML repair after a visible diagram issue or readability problem.';
                    requestPlantUmlRepair(targetKey, markdownText, detailedMessage);
                });
                image.addEventListener('error', () => {
                    if (repairRequested || !targetKey) {
                        return;
                    }

                    setPlantUmlErrorState(wrapper, 'PlantUML image load failed.');
                    repairRequested = true;
                    requestPlantUmlRepair(targetKey, markdownText, 'PlantUML image load failed.');
                }, { once: true });
                image.addEventListener('load', () => {
                    inspectPlantUmlImage(wrapper, image);
                }, { once: true });
                image.src = buildPlantUmlImageUrl(source);
                toolbar.appendChild(expandButton);
                toolbar.appendChild(fixButton);
                frame.appendChild(toolbar);
                frame.appendChild(image);
                wrapper.appendChild(frame);
                pre.replaceWith(wrapper);
            }
        }

        function requestPlantUmlRepair(target, content, errorMessage) {
            if (plantUmlRepairAttempts[target] >= 3) {
                appendLogMessage('PlantUML repair stopped after 3 attempts for ' + target + '.');
                return;
            }

            plantUmlRepairAttempts[target] += 1;
            appendLogMessage('PlantUML render failed for ' + target + '. Requesting repair attempt ' + plantUmlRepairAttempts[target] + '/3.');
            vscode.postMessage({
                command: 'repairPlantUml',
                target,
                content,
                errorMessage,
                attempt: plantUmlRepairAttempts[target],
                provider: providerSelect.value,
                model: getSelectedModel(),
                baseURL: providerSelect.value === 'custom' ? customBaseUrlInput.value.trim() : undefined,
                apiKey: providerSelect.value === 'custom' ? customApiKeyInput.value.trim() : undefined,
                contextWindow: (providerSelect.value === 'custom' || modelSelect.value === CUSTOM_MODEL_SENTINEL) ? getCustomCapabilities().contextWindow : undefined,
                maxOutputTokens: (providerSelect.value === 'custom' || modelSelect.value === CUSTOM_MODEL_SENTINEL) ? getCustomCapabilities().maxOutputTokens : undefined,
                language: languageSelect.value,
                contextStrategy: 'auto',
                ${options?.idleHook?.includes('checkBranchSelection') ? "baseBranch: typeof baseBranchSelect !== 'undefined' ? baseBranchSelect.value : undefined,\n                compareBranch: typeof compareBranchSelect !== 'undefined' ? compareBranchSelect.value : undefined," : ''}
            });
        }
    `;
}

export function buildSingleResultMessageHandler(): string {
    return `
        async function handleWebviewResultMessage(message, markdownRenderer) {
            setGeneratingState(false);
            setStatusState('success', 'Review ready', 'The review is available below. Copy it or open the raw diff in the editor.');
            appendLogMessage('Generation completed successfully.');
            clearErrorReport();
            currentRawDiff = message.rawDiff;
            plantUmlRepairAttempts.review = 0;
            currentReview = message.review;
            const reviewWrapper = getReviewContentWrapper();
            if (!reviewWrapper) {
                appendLogMessage('Review content container is unavailable.');
                return;
            }
            await renderMarkdownWithDiagrams(
                reviewWrapper,
                message.review,
                markdownRenderer,
                'review'
            );
            setResultVisible(true);
        }
    `;
}

export function buildReviewDiffResultMessageHandler(): string {
    return `
        function switchTab(targetTab) {
            document.querySelectorAll('.tab-button').forEach((button) => {
                const isActive = button.getAttribute('data-tab') === targetTab;
                button.classList.toggle('active', isActive);
                button.setAttribute('aria-selected', String(isActive));
            });
            document.querySelectorAll('.tab-pane').forEach((pane) => {
                pane.classList.toggle('active', pane.id === targetTab + '-tab');
            });
        }

        function renderRawDiff(container, diffText) {
            var CHUNK_LINES = 200;
            var text = diffText || 'No diff available.';
            var lines = text.split('\\n');

            if (lines.length <= CHUNK_LINES) {
                container.innerHTML = '<pre><code class="language-diff">' + escapeHtml(text) + '</code></pre>';
                return;
            }

            container.innerHTML = '';
            var pre = document.createElement('pre');
            var code = document.createElement('code');
            code.className = 'language-diff';
            pre.appendChild(code);
            container.appendChild(pre);

            var rendered = 0;

            function renderNextChunk() {
                if (rendered >= lines.length) {
                    if (sentinel) {
                        sentinel.remove();
                        sentinel = null;
                    }
                    return;
                }
                var end = Math.min(rendered + CHUNK_LINES, lines.length);
                var chunk = lines.slice(rendered, end).join('\\n');
                if (rendered > 0) {
                    chunk = '\\n' + chunk;
                }
                var span = document.createElement('span');
                span.textContent = chunk;
                code.appendChild(span);
                rendered = end;

                if (rendered >= lines.length && sentinel) {
                    sentinel.remove();
                    sentinel = null;
                }
            }

            var sentinel = document.createElement('div');
            sentinel.style.height = '1px';
            container.appendChild(sentinel);

            var observer = new IntersectionObserver(function(entries) {
                if (entries[0].isIntersecting) {
                    renderNextChunk();
                    if (rendered >= lines.length) {
                        observer.disconnect();
                    }
                }
            }, { root: null, rootMargin: '400px' });

            renderNextChunk();
            if (sentinel && rendered < lines.length) {
                observer.observe(sentinel);
            }
        }

        async function handleWebviewResultMessage(message, markdownRenderer) {
            setGeneratingState(false);
            setStatusState('success', 'Review ready', 'The review and merge diff are available below. Copy the review, inspect the diff tab, or open the patch in the editor.');
            appendLogMessage('Generation completed successfully.');
            clearErrorReport();
            currentRawDiff = message.rawDiff || '';
            plantUmlRepairAttempts.review = 0;
            currentReview = message.review;
            const reviewWrapper = getReviewContentWrapper();
            const diffWrapper = getDiffContentWrapper();
            if (!reviewWrapper) {
                appendLogMessage('Review content container is unavailable.');
                return;
            }
            await renderMarkdownWithDiagrams(
                reviewWrapper,
                message.review,
                markdownRenderer,
                'review'
            );
            if (diffWrapper) {
                renderRawDiff(diffWrapper, currentRawDiff);
            } else {
                appendLogMessage('Diff content container is unavailable.');
            }
            switchTab('review');
            setResultVisible(true);
        }
    `;
}

export function buildTabbedResultMessageHandler(): string {
    return `
        function switchTab(targetTab) {
            document.querySelectorAll('.tab-button').forEach((button) => {
                const isActive = button.getAttribute('data-tab') === targetTab;
                button.classList.toggle('active', isActive);
                button.setAttribute('aria-selected', String(isActive));
            });
            document.querySelectorAll('.tab-pane').forEach((pane) => {
                pane.classList.toggle('active', pane.id === targetTab + '-tab');
            });
        }

        async function handleWebviewResultMessage(message, markdownRenderer) {
            setGeneratingState(false);
            setStatusState('success', 'Output ready', 'Review output has been generated. Switch tabs to inspect the review and MR description.');
            appendLogMessage('Generation completed successfully.');
            clearErrorReport();
            currentRawDiff = message.rawDiff;

            if (message.review) {
                plantUmlRepairAttempts.review = 0;
                currentReview = message.review;
                const reviewWrapper = getReviewContentWrapper();
                if (reviewWrapper) {
                await renderMarkdownWithDiagrams(
                    reviewWrapper,
                    message.review,
                    markdownRenderer,
                    'review'
                );
                } else {
                    appendLogMessage('Review content container is unavailable.');
                }
            }

            if (message.description) {
                plantUmlRepairAttempts.description = 0;
                currentDescription = message.description;
                const descriptionWrapper = getDescriptionContentWrapper();
                if (descriptionWrapper) {
                await renderMarkdownWithDiagrams(
                    descriptionWrapper,
                    message.description,
                    markdownRenderer,
                    'description'
                );
                } else {
                    appendLogMessage('Description content container is unavailable.');
                }
                descriptionTab.classList.remove('hidden');
            } else {
                currentDescription = '';
                const descriptionWrapper = getDescriptionContentWrapper();
                if (descriptionWrapper) {
                    descriptionWrapper.innerHTML = '';
                }
                descriptionTab.classList.add('hidden');
            }

            if (!message.review && message.description) {
                switchTab('description');
            } else {
                switchTab('review');
            }

            setResultVisible(true);
        }
    `;
}

export function buildPlantUmlRepairMessageHandler(options?: { includeDescription?: boolean; }): string {
    return `
        async function handlePlantUmlRepairResult(message, markdownRenderer) {
            appendLogMessage('Applied PlantUML repair attempt ' + message.attempt + ' for ' + message.target + '.');

            if (message.target === 'review') {
                currentReview = message.content;
                const reviewWrapper = getReviewContentWrapper();
                if (!reviewWrapper) {
                    appendLogMessage('Review content container is unavailable.');
                    return;
                }
                await renderMarkdownWithDiagrams(
                    reviewWrapper,
                    currentReview,
                    markdownRenderer,
                    'review'
                );
                return;
            }

            ${options?.includeDescription ? `
            if (message.target === 'description') {
                currentDescription = message.content;
                const descriptionWrapper = getDescriptionContentWrapper();
                if (!descriptionWrapper) {
                    appendLogMessage('Description content container is unavailable.');
                    return;
                }
                await renderMarkdownWithDiagrams(
                    descriptionWrapper,
                    currentDescription,
                    markdownRenderer,
                    'description'
                );
            }` : ''}
        }
    `;
}
