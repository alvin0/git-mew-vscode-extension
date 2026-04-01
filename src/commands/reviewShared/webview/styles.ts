export function buildSharedStyles(options?: { includeTabs?: boolean; }): string {
    const includeTabs = options?.includeTabs ?? false;

    return `
        :root {
            color-scheme: light dark;
            --gm-bg: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-sideBar-background) 8%);
            --gm-surface: color-mix(in srgb, var(--vscode-editor-background) 84%, var(--vscode-input-background) 16%);
            --gm-surface-alt: color-mix(in srgb, var(--vscode-editor-background) 68%, var(--vscode-sideBar-background) 32%);
            --gm-surface-strong: color-mix(in srgb, var(--vscode-editor-background) 58%, var(--vscode-sideBar-background) 42%);
            --gm-border: color-mix(in srgb, var(--vscode-input-border, var(--vscode-panel-border)) 85%, transparent 15%);
            --gm-border-strong: color-mix(in srgb, var(--vscode-focusBorder) 44%, var(--gm-border) 56%);
            --gm-muted: var(--vscode-descriptionForeground);
            --gm-accent: var(--vscode-focusBorder, var(--vscode-button-background));
            --gm-accent-soft: color-mix(in srgb, var(--gm-accent) 18%, transparent 82%);
            --gm-shadow: 0 10px 30px color-mix(in srgb, var(--vscode-editor-foreground) 10%, transparent 90%);
            --gm-radius-lg: 14px;
            --gm-radius-md: 10px;
            --gm-radius-sm: 8px;
            --gm-space-1: 4px;
            --gm-space-2: 6px;
            --gm-space-3: 10px;
            --gm-space-4: 12px;
            --gm-space-5: 16px;
            --gm-space-6: 20px;
            --gm-space-7: 24px;
        }

        * {
            box-sizing: border-box;
        }

        html, body {
            min-height: 100%;
        }

        body {
            margin: 0;
            padding: 16px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background:
                radial-gradient(circle at top left, color-mix(in srgb, var(--gm-accent) 12%, transparent 88%), transparent 34%),
                linear-gradient(180deg, color-mix(in srgb, var(--vscode-sideBar-background) 32%, var(--gm-bg) 68%) 0%, var(--gm-bg) 100%);
        }

        button,
        input,
        select,
        textarea {
            font: inherit;
        }

        button,
        input,
        select,
        textarea,
        summary {
            transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease, box-shadow 140ms ease, opacity 140ms ease, transform 140ms ease;
        }

        button:focus-visible,
        input:focus-visible,
        select:focus-visible,
        textarea:focus-visible,
        summary:focus-visible {
            outline: none;
            box-shadow: 0 0 0 1px var(--gm-accent), 0 0 0 4px var(--gm-accent-soft);
        }

        .shell {
            max-width: 1280px;
            margin: 0 auto;
        }

        .hero {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: var(--gm-space-4);
            padding: var(--gm-space-5);
            margin-bottom: var(--gm-space-5);
            border: 1px solid var(--gm-border);
            border-radius: calc(var(--gm-radius-lg) + 2px);
            background:
                linear-gradient(135deg, color-mix(in srgb, var(--gm-accent) 10%, var(--gm-surface) 90%) 0%, var(--gm-surface) 62%, var(--gm-surface-alt) 100%);
            box-shadow: var(--gm-shadow);
        }

        .hero__identity {
            display: flex;
            align-items: flex-start;
            gap: var(--gm-space-4);
        }

        .hero__icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            display: grid;
            place-items: center;
            font-size: 20px;
            color: var(--vscode-button-foreground);
            background: linear-gradient(135deg, var(--vscode-button-background), color-mix(in srgb, var(--vscode-button-background) 62%, white 38%));
            box-shadow: inset 0 1px 0 color-mix(in srgb, white 30%, transparent 70%);
        }

        .hero__eyebrow {
            margin: 0 0 var(--gm-space-2);
            color: var(--gm-muted);
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .hero h1 {
            margin: 0;
            font-size: clamp(22px, 3vw, 30px);
            line-height: 1.1;
            font-weight: 800;
        }

        .hero__description {
            margin: var(--gm-space-1) 0 0;
            max-width: 680px;
            color: var(--gm-muted);
            line-height: 1.45;
            font-size: 13px;
        }

        .hero__aside {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: var(--gm-space-3);
        }

        .hero__badge {
            align-self: flex-start;
            padding: 8px 12px;
            border: 1px solid var(--gm-border-strong);
            border-radius: 999px;
            background: var(--gm-accent-soft);
            color: var(--vscode-foreground);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.03em;
            white-space: nowrap;
        }

        .hero__actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: var(--gm-space-2);
            max-width: 520px;
        }

        .dashboard {
            display: grid;
            gap: var(--gm-space-5);
            grid-template-columns: minmax(320px, 430px) minmax(0, 1fr);
            align-items: start;
        }

        .dashboard.controls-collapsed {
            grid-template-columns: minmax(0, 1fr);
        }

        .dashboard.controls-collapsed .dashboard__panel--controls {
            display: none;
        }

        .dashboard__panel {
            display: flex;
            flex-direction: column;
            gap: var(--gm-space-4);
            min-width: 0;
        }

        .panel-section {
            position: relative;
            border: 1px solid var(--gm-border);
            border-radius: var(--gm-radius-lg);
            background: linear-gradient(180deg, color-mix(in srgb, var(--gm-surface) 92%, white 8%) 0%, var(--gm-surface) 100%);
            box-shadow: var(--gm-shadow);
            overflow: hidden;
        }

        .panel-section--accent {
            border-color: var(--gm-border-strong);
            background:
                linear-gradient(180deg, color-mix(in srgb, var(--gm-accent) 7%, var(--gm-surface) 93%) 0%, var(--gm-surface) 100%);
        }

        .panel-section__header {
            padding: var(--gm-space-4) var(--gm-space-4) 0;
        }

        .panel-section__header h2 {
            margin: 0;
            font-size: 14px;
            line-height: 1.3;
            font-weight: 800;
            letter-spacing: 0.01em;
        }

        .panel-section__description {
            margin: var(--gm-space-2) 0 0;
            color: var(--gm-muted);
            line-height: 1.5;
            font-size: 12px;
        }

        .panel-section__body {
            padding: var(--gm-space-4);
        }

        .stack {
            display: flex;
            flex-direction: column;
            gap: var(--gm-space-3);
        }

        .form-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: var(--gm-space-3);
        }

        .field {
            display: flex;
            flex-direction: column;
            gap: var(--gm-space-2);
            min-width: 0;
        }

        .field--full {
            grid-column: 1 / -1;
        }

        .field label {
            font-size: 12px;
            font-weight: 700;
            color: var(--vscode-foreground);
            letter-spacing: 0.02em;
        }

        .field__hint {
            color: var(--gm-muted);
            font-size: 12px;
            line-height: 1.45;
        }

        .field__feedback {
            display: none;
            padding: 10px 12px;
            border: 1px solid transparent;
            border-radius: var(--gm-radius-sm);
            font-size: 12px;
            line-height: 1.45;
        }

        .field__feedback.is-visible {
            display: block;
        }

        .field__feedback--warning {
            background: color-mix(in srgb, var(--vscode-inputValidation-warningBackground, #9a6700) 18%, transparent 82%);
            border-color: color-mix(in srgb, var(--vscode-inputValidation-warningBorder, #bf8700) 70%, transparent 30%);
            color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
        }

        input,
        select,
        textarea {
            width: 100%;
            min-height: 38px;
            padding: 8px 10px;
            border: 1px solid var(--gm-border);
            border-radius: var(--gm-radius-sm);
            background: color-mix(in srgb, var(--vscode-input-background) 88%, var(--gm-surface-alt) 12%);
            color: var(--vscode-input-foreground);
        }

        input:hover,
        select:hover,
        textarea:hover {
            border-color: var(--gm-border-strong);
        }

        textarea {
            min-height: 84px;
            resize: vertical;
            line-height: 1.45;
        }

        input.hidden,
        select.hidden,
        textarea.hidden,
        .hidden {
            display: none !important;
        }

        .details-card {
            border: 1px solid var(--gm-border);
            border-radius: var(--gm-radius-md);
            background: var(--gm-surface-alt);
            overflow: hidden;
        }

        .details-card summary {
            list-style: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--gm-space-3);
            padding: 10px 12px;
            color: var(--vscode-foreground);
            font-weight: 700;
            font-size: 12px;
        }

        .details-card summary::-webkit-details-marker {
            display: none;
        }

        .details-card summary::after {
            content: 'Show';
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--gm-muted);
        }

        .details-card[open] summary::after {
            content: 'Hide';
        }

        .details-card__body {
            padding: 0 12px 12px;
        }

        .status-card {
            border: 1px solid var(--gm-border);
            border-radius: var(--gm-radius-md);
            background: linear-gradient(180deg, var(--gm-surface) 0%, var(--gm-surface-alt) 100%);
            box-shadow: var(--gm-shadow);
            overflow: hidden;
        }

        .status-card__main {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--gm-space-3);
            padding: var(--gm-space-4);
        }

        .status-card__copy {
            min-width: 0;
        }

        .status-card__eyebrow {
            margin: 0 0 var(--gm-space-2);
            color: var(--gm-muted);
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .status-card__title {
            margin: 0;
            font-size: 15px;
            font-weight: 800;
            line-height: 1.25;
        }

        .status-card__detail {
            margin: var(--gm-space-2) 0 0;
            color: var(--gm-muted);
            line-height: 1.5;
            font-size: 12px;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px 10px;
            border-radius: 999px;
            border: 1px solid var(--gm-border);
            background: var(--gm-surface-alt);
            color: var(--vscode-foreground);
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
        }

        .status-badge::before {
            content: '';
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: currentColor;
            opacity: 0.85;
        }

        .status-card[data-state="idle"] .status-badge {
            color: var(--gm-muted);
        }

        .status-card[data-state="running"] .status-badge {
            color: var(--vscode-button-background);
        }

        .status-card[data-state="success"] .status-badge {
            color: var(--vscode-testing-iconPassed, #2ea043);
        }

        .status-card[data-state="error"] .status-badge {
            color: var(--vscode-errorForeground, #f85149);
        }

        .loader {
            width: 18px;
            height: 18px;
            border-radius: 999px;
            border: 2px solid color-mix(in srgb, var(--vscode-button-background) 18%, transparent 82%);
            border-top-color: var(--vscode-button-background);
            animation: spin 800ms linear infinite;
        }

        .status-card[data-state="idle"] .loader,
        .status-card[data-state="success"] .loader,
        .status-card[data-state="error"] .loader {
            display: none;
        }

        .status-log {
            margin: 0 var(--gm-space-4) var(--gm-space-4);
            border: 1px solid var(--gm-border);
            border-radius: var(--gm-radius-md);
            background: var(--vscode-textCodeBlock-background);
            overflow: hidden;
        }

        .status-log summary {
            list-style: none;
            cursor: pointer;
            padding: 12px 14px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--gm-muted);
        }

        .status-log summary::-webkit-details-marker {
            display: none;
        }

        .log-output {
            margin: 0;
            padding: 0 14px 14px;
            max-height: 260px;
            overflow: auto;
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 12px;
            line-height: 1.55;
            font-family: var(--vscode-editor-font-family);
        }

        .status-log.is-collapsed {
            display: none;
        }

        .log-tabs {
            display: flex;
            gap: 0;
            border-bottom: 1px solid var(--gm-border);
        }

        .log-tab-btn {
            min-height: 0;
            padding: 8px 14px;
            border: none;
            border-bottom: 2px solid transparent;
            border-radius: 0;
            background: transparent;
            color: var(--gm-muted);
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            cursor: pointer;
        }

        .log-tab-btn:hover:not(:disabled) {
            color: var(--vscode-foreground);
            background: transparent;
            transform: none;
        }

        .log-tab-btn.active {
            color: var(--vscode-foreground);
            border-bottom-color: var(--gm-accent);
        }

        .log-tab-btn .log-tab-count {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 18px;
            height: 18px;
            margin-left: 6px;
            padding: 0 5px;
            border-radius: 999px;
            background: var(--gm-surface-alt);
            font-size: 10px;
            font-weight: 800;
        }

        .log-tab-pane {
            display: none;
        }

        .log-tab-pane.active {
            display: block;
        }

        .llm-entries {
            padding: 0 14px 14px;
            max-height: 400px;
            overflow: auto;
        }

        .llm-entry {
            margin-bottom: 10px;
            border: 1px solid var(--gm-border);
            border-radius: var(--gm-radius-sm);
            background: var(--gm-surface);
            overflow: hidden;
        }

        .llm-entry__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--gm-space-3);
            padding: 8px 10px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 700;
        }

        .llm-entry__header:hover {
            background: var(--gm-surface-alt);
        }

        .llm-entry__meta {
            display: flex;
            gap: var(--gm-space-3);
            color: var(--gm-muted);
            font-size: 11px;
            font-weight: 400;
        }

        .llm-entry__meta span {
            white-space: nowrap;
        }

        .llm-entry__body {
            display: none;
            border-top: 1px solid var(--gm-border);
        }

        .llm-entry.is-expanded .llm-entry__body {
            display: block;
        }

        .llm-entry__section {
            padding: 8px 10px;
            border-bottom: 1px solid var(--gm-border);
        }

        .llm-entry__section:last-child {
            border-bottom: none;
        }

        .llm-entry__section-label {
            display: block;
            margin-bottom: 4px;
            color: var(--gm-muted);
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }

        .llm-entry__section pre {
            margin: 0;
            padding: 8px;
            max-height: 200px;
            overflow: auto;
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 11px;
            line-height: 1.5;
            font-family: var(--vscode-editor-font-family);
            background: var(--vscode-textCodeBlock-background);
            border-radius: 4px;
        }

        .action-bar {
            display: flex;
            flex-wrap: wrap;
            gap: var(--gm-space-2);
        }

        button {
            min-height: 36px;
            padding: 8px 12px;
            border-radius: var(--gm-radius-sm);
            border: 1px solid transparent;
            cursor: pointer;
            font-weight: 700;
            font-size: 12px;
        }

        button:hover:not(:disabled) {
            transform: translateY(-1px);
        }

        button:disabled {
            cursor: not-allowed;
            opacity: 0.52;
            transform: none;
        }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            box-shadow: inset 0 1px 0 color-mix(in srgb, white 18%, transparent 82%);
        }

        .btn-primary:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border-color: color-mix(in srgb, var(--vscode-button-secondaryBackground) 55%, var(--gm-border) 45%);
        }

        .btn-secondary:hover:not(:disabled) {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .btn-ghost {
            background: transparent;
            color: var(--vscode-foreground);
            border-color: var(--gm-border);
        }

        .btn-ghost:hover:not(:disabled) {
            background: var(--gm-surface-alt);
        }

        .button-note {
            color: var(--gm-muted);
            font-size: 12px;
            line-height: 1.45;
        }

        .result-workspace {
            border: 1px solid var(--gm-border);
            border-radius: var(--gm-radius-md);
            background: linear-gradient(180deg, var(--gm-surface) 0%, color-mix(in srgb, var(--gm-surface-alt) 70%, var(--gm-surface) 30%) 100%);
            box-shadow: var(--gm-shadow);
            overflow: hidden;
        }

        .result-workspace.hidden {
            display: none !important;
        }

        .error-report {
            margin: var(--gm-space-4);
            padding: var(--gm-space-4);
            border: 1px solid color-mix(in srgb, var(--vscode-errorForeground, #f85149) 58%, var(--gm-border) 42%);
            border-radius: var(--gm-radius-md);
            background: color-mix(in srgb, var(--vscode-inputValidation-errorBackground, #5a1d1d) 22%, var(--gm-surface) 78%);
        }

        .error-report__header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: var(--gm-space-3);
            margin-bottom: var(--gm-space-4);
        }

        .error-report__eyebrow {
            margin: 0 0 var(--gm-space-1);
            color: var(--vscode-errorForeground, #f85149);
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .error-report__title {
            margin: 0;
            font-size: 15px;
            font-weight: 800;
            line-height: 1.25;
        }

        .error-report__summary {
            margin: var(--gm-space-2) 0 0;
            color: var(--vscode-foreground);
            font-size: 12px;
            line-height: 1.5;
        }

        .error-report__meta {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: var(--gm-space-3);
            margin-bottom: var(--gm-space-4);
        }

        .error-report__field {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .error-report__label {
            color: var(--gm-muted);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.03em;
            text-transform: uppercase;
        }

        .error-report__value {
            padding: 7px 9px;
            border: 1px solid var(--gm-border);
            border-radius: var(--gm-radius-sm);
            background: color-mix(in srgb, var(--vscode-textCodeBlock-background) 84%, transparent 16%);
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            word-break: break-word;
        }

        .error-report__hint {
            margin: 0 0 var(--gm-space-4);
            color: var(--gm-muted);
            font-size: 12px;
            line-height: 1.5;
        }

        .error-report__details {
            display: flex;
            flex-direction: column;
            gap: var(--gm-space-2);
        }

        .error-report__pre {
            margin: 0;
            padding: 12px 14px;
            border: 1px solid var(--gm-border);
            border-radius: var(--gm-radius-sm);
            background: var(--vscode-textCodeBlock-background);
            overflow: auto;
            white-space: pre-wrap;
            word-break: break-word;
            font-size: 12px;
            line-height: 1.55;
            font-family: var(--vscode-editor-font-family);
        }

        .sticky-result-header {
            position: sticky;
            top: 0;
            z-index: 1;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: var(--gm-space-4);
            padding: var(--gm-space-4);
            border-bottom: 1px solid var(--gm-border);
            background: color-mix(in srgb, var(--gm-surface) 92%, transparent 8%);
            backdrop-filter: blur(8px);
        }

        .sticky-result-header h2 {
            margin: 0;
            font-size: 16px;
            font-weight: 800;
        }

        .sticky-result-header p {
            margin: var(--gm-space-1) 0 0;
            color: var(--gm-muted);
            font-size: 12px;
            line-height: 1.45;
        }

        .action-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: var(--gm-space-2);
            justify-content: flex-end;
        }

        ${includeTabs ? `
        .tabs {
            display: flex;
            gap: var(--gm-space-2);
            padding: var(--gm-space-3) var(--gm-space-4) 0;
            border-bottom: 1px solid var(--gm-border);
            background: color-mix(in srgb, var(--gm-surface-alt) 72%, transparent 28%);
        }

        .tab-button {
            min-height: 0;
            padding: 8px 12px;
            border-radius: 999px;
            border: 1px solid transparent;
            background: transparent;
            color: var(--gm-muted);
            font-size: 13px;
            font-weight: 700;
        }

        .tab-button:hover:not(:disabled) {
            background: var(--gm-surface-alt);
        }

        .tab-button.active {
            background: var(--gm-accent-soft);
            border-color: var(--gm-border-strong);
            color: var(--vscode-foreground);
        }

        .tab-content {
            padding: 0;
        }

        .tab-pane {
            display: none;
        }

        .tab-pane.active {
            display: block;
        }` : ''}

        .review-content {
            padding: var(--gm-space-4);
        }

        .content-wrapper {
            max-width: 78ch;
            line-height: 1.62;
        }

        .content-wrapper > :first-child {
            margin-top: 0;
        }

        .content-wrapper h1,
        .content-wrapper h2,
        .content-wrapper h3,
        .content-wrapper h4 {
            line-height: 1.25;
            margin-top: 1.5em;
            margin-bottom: 0.55em;
        }

        .content-wrapper p,
        .content-wrapper ul,
        .content-wrapper ol,
        .content-wrapper blockquote {
            margin: 0 0 1em;
        }

        .content-wrapper code {
            font-family: var(--vscode-editor-font-family);
            font-size: 0.95em;
        }

        .content-wrapper :not(pre) > code {
            padding: 0.15em 0.45em;
            border-radius: 6px;
            background: color-mix(in srgb, var(--vscode-textCodeBlock-background) 88%, transparent 12%);
        }

        .content-wrapper pre {
            margin: 1em 0;
            padding: 12px 14px;
            border: 1px solid var(--gm-border);
            border-radius: var(--gm-radius-md);
            background: var(--vscode-textCodeBlock-background);
            overflow-x: auto;
        }

        .content-wrapper table {
            width: 100%;
            border-collapse: collapse;
            margin: 1em 0;
        }

        .content-wrapper th,
        .content-wrapper td {
            padding: 10px 12px;
            border: 1px solid var(--gm-border);
            text-align: left;
        }

        .content-wrapper blockquote {
            padding-left: 14px;
            border-left: 3px solid var(--gm-border-strong);
            color: var(--gm-muted);
        }

        .plantuml-wrapper {
            margin: 16px 0;
            padding: 12px;
            overflow-x: auto;
            border: 1px solid var(--gm-border);
            border-radius: var(--gm-radius-md);
            background: linear-gradient(180deg, color-mix(in srgb, var(--gm-surface-alt) 88%, transparent 12%) 0%, var(--gm-surface) 100%);
        }

        .plantuml-frame {
            position: relative;
        }

        .plantuml-toolbar {
            display: flex;
            justify-content: flex-end;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 8px;
        }

        .plantuml-expand-btn {
            min-height: 28px;
            padding: 5px 10px;
            border: 1px solid var(--gm-border);
            border-radius: 999px;
            background: color-mix(in srgb, var(--gm-surface) 88%, transparent 12%);
            color: var(--vscode-foreground);
            font-size: 11px;
            font-weight: 700;
        }

        .plantuml-expand-btn:hover:not(:disabled) {
            background: var(--gm-surface-alt);
        }

        .plantuml-fix-btn {
            min-height: 28px;
            padding: 5px 10px;
            border: 1px solid color-mix(in srgb, var(--gm-accent) 45%, var(--gm-border) 55%);
            border-radius: 999px;
            background: var(--gm-accent-soft);
            color: var(--vscode-foreground);
            font-size: 11px;
            font-weight: 700;
        }

        .plantuml-fix-btn:hover:not(:disabled) {
            background: color-mix(in srgb, var(--gm-accent) 24%, var(--gm-surface) 76%);
        }

        .plantuml-error {
            margin-top: 10px;
            padding: 10px 12px;
            border: 1px solid color-mix(in srgb, var(--vscode-inputValidation-warningBorder, #bf8700) 70%, transparent 30%);
            border-radius: var(--gm-radius-sm);
            background: color-mix(in srgb, var(--vscode-inputValidation-warningBackground, #9a6700) 18%, transparent 82%);
            color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
            font-size: 12px;
            line-height: 1.45;
            white-space: pre-wrap;
        }

        .plantuml-wrapper.has-error {
            border-color: color-mix(in srgb, var(--vscode-inputValidation-warningBorder, #bf8700) 70%, var(--gm-border) 30%);
        }

        .plantuml-diagram {
            min-width: 320px;
            width: 100%;
            height: auto;
            display: block;
        }

        .plantuml-modal {
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: color-mix(in srgb, var(--vscode-editor-background) 56%, black 44%);
        }

        .plantuml-modal.hidden {
            display: none !important;
        }

        .plantuml-modal__dialog {
            width: min(1200px, 100%);
            max-height: 100%;
            display: flex;
            flex-direction: column;
            border: 1px solid var(--gm-border-strong);
            border-radius: var(--gm-radius-lg);
            background: linear-gradient(180deg, var(--gm-surface) 0%, var(--gm-surface-alt) 100%);
            box-shadow: var(--gm-shadow);
            overflow: hidden;
        }

        .plantuml-modal__header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: var(--gm-space-3);
            padding: 12px 14px;
            border-bottom: 1px solid var(--gm-border);
        }

        .plantuml-modal__title {
            margin: 0;
            font-size: 13px;
            font-weight: 800;
        }

        .plantuml-modal__body {
            padding: 14px;
            overflow: auto;
        }

        .plantuml-modal__image {
            display: block;
            width: auto;
            min-width: min(960px, 100%);
            max-width: none;
            height: auto;
            margin: 0 auto;
        }

        .empty-state {
            display: grid;
            justify-items: start;
            gap: var(--gm-space-2);
            padding: var(--gm-space-5);
            border: 1px dashed var(--gm-border-strong);
            border-radius: var(--gm-radius-lg);
            background: color-mix(in srgb, var(--gm-accent) 6%, var(--gm-surface) 94%);
        }

        .empty-state__icon {
            width: 34px;
            height: 34px;
            display: grid;
            place-items: center;
            border-radius: 12px;
            background: var(--gm-accent-soft);
            color: var(--vscode-foreground);
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.08em;
        }

        .empty-state h2 {
            margin: 0;
            font-size: 17px;
            font-weight: 800;
        }

        .empty-state p {
            margin: 0;
            max-width: 58ch;
            color: var(--gm-muted);
            line-height: 1.6;
        }

        .empty-state__note {
            padding: 10px 12px;
            border-radius: var(--gm-radius-sm);
            background: var(--gm-surface-alt);
            color: var(--vscode-foreground);
            font-size: 11px;
            line-height: 1.45;
        }

        .inline-kbd {
            padding: 2px 6px;
            border: 1px solid var(--gm-border);
            border-radius: 6px;
            background: var(--gm-surface-alt);
            font-size: 11px;
            font-weight: 700;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        @media (max-width: 1040px) {
            .dashboard {
                grid-template-columns: 1fr;
            }
        }

        @media (max-width: 720px) {
            body {
                    padding: 12px;
                }

            .hero,
            .sticky-result-header,
            .status-card__main {
                flex-direction: column;
                align-items: flex-start;
            }

            .hero__aside,
            .hero__actions {
                width: 100%;
                align-items: flex-start;
                justify-content: flex-start;
            }

            .form-grid {
                grid-template-columns: 1fr;
            }

            .action-buttons {
                width: 100%;
                justify-content: flex-start;
            }
        }
    `;
}
