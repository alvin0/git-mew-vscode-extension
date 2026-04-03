import * as vscode from 'vscode';
import { captureFeedback } from '../services/sentry';

export function registerSendFeedbackCommand(context: vscode.ExtensionContext) {
    return vscode.commands.registerCommand('git-mew.send-feedback', () => {
        const panel = vscode.window.createWebviewPanel(
            'git-mew-feedback',
            'Git Mew — Feedback',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = getFeedbackWebviewContent();

        panel.webview.onDidReceiveMessage((message) => {
            if (message.command === 'submit') {
                captureFeedback(
                    message.message,
                    message.email || undefined,
                    message.name || undefined
                );
                vscode.window.showInformationMessage('Thank you for your feedback!');
                panel.dispose();
            }
        }, undefined, context.subscriptions);
    });
}

function getFeedbackWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Git Mew Feedback</title>
<style>
    :root {
        color-scheme: light dark;
        --gm-bg: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-sideBar-background) 8%);
        --gm-surface: color-mix(in srgb, var(--vscode-editor-background) 84%, var(--vscode-input-background) 16%);
        --gm-surface-alt: color-mix(in srgb, var(--vscode-editor-background) 68%, var(--vscode-sideBar-background) 32%);
        --gm-border: color-mix(in srgb, var(--vscode-input-border, var(--vscode-panel-border)) 85%, transparent 15%);
        --gm-border-strong: color-mix(in srgb, var(--vscode-focusBorder) 44%, var(--gm-border) 56%);
        --gm-muted: var(--vscode-descriptionForeground);
        --gm-accent: var(--vscode-focusBorder, var(--vscode-button-background));
        --gm-accent-soft: color-mix(in srgb, var(--gm-accent) 18%, transparent 82%);
        --gm-shadow: 0 10px 30px color-mix(in srgb, var(--vscode-editor-foreground) 10%, transparent 90%);
        --gm-radius-lg: 14px;
        --gm-radius-md: 10px;
        --gm-radius-sm: 8px;
        --gm-space-2: 6px;
        --gm-space-3: 10px;
        --gm-space-4: 12px;
        --gm-space-5: 16px;
    }
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body {
        margin: 0; padding: 16px;
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        background:
            radial-gradient(circle at top left, color-mix(in srgb, var(--gm-accent) 12%, transparent 88%), transparent 34%),
            linear-gradient(180deg, color-mix(in srgb, var(--vscode-sideBar-background) 32%, var(--gm-bg) 68%) 0%, var(--gm-bg) 100%);
    }
    button, input, select, textarea { font: inherit; }
    button, input, select, textarea {
        transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease, opacity 140ms ease, transform 140ms ease;
    }
    button:focus-visible, input:focus-visible, textarea:focus-visible {
        outline: none;
        box-shadow: 0 0 0 1px var(--gm-accent), 0 0 0 4px var(--gm-accent-soft);
    }

    .shell { max-width: 640px; margin: 0 auto; }

    .hero {
        display: flex; align-items: flex-start; gap: var(--gm-space-4);
        padding: var(--gm-space-5); margin-bottom: var(--gm-space-5);
        border: 1px solid var(--gm-border); border-radius: calc(var(--gm-radius-lg) + 2px);
        background: linear-gradient(135deg, color-mix(in srgb, var(--gm-accent) 10%, var(--gm-surface) 90%) 0%, var(--gm-surface) 62%, var(--gm-surface-alt) 100%);
        box-shadow: var(--gm-shadow);
    }
    .hero__icon {
        width: 44px; height: 44px; border-radius: 12px;
        display: grid; place-items: center; font-size: 20px; flex-shrink: 0;
        color: var(--vscode-button-foreground);
        background: linear-gradient(135deg, var(--vscode-button-background), color-mix(in srgb, var(--vscode-button-background) 62%, white 38%));
        box-shadow: inset 0 1px 0 color-mix(in srgb, white 30%, transparent 70%);
    }
    .hero__eyebrow {
        margin: 0 0 var(--gm-space-2); color: var(--gm-muted);
        font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    }
    .hero h1 { margin: 0; font-size: 24px; line-height: 1.1; font-weight: 800; }
    .hero__description { margin: var(--gm-space-2) 0 0; max-width: 680px; color: var(--gm-muted); line-height: 1.45; font-size: 13px; }

    .panel-section {
        border: 1px solid var(--gm-border); border-radius: var(--gm-radius-lg);
        background: linear-gradient(180deg, color-mix(in srgb, var(--gm-surface) 92%, white 8%) 0%, var(--gm-surface) 100%);
        box-shadow: var(--gm-shadow); overflow: hidden;
    }
    .panel-section__header { padding: var(--gm-space-4) var(--gm-space-4) 0; }
    .panel-section__header h2 { margin: 0; font-size: 14px; font-weight: 800; letter-spacing: 0.01em; }
    .panel-section__description { margin: var(--gm-space-2) 0 0; color: var(--gm-muted); line-height: 1.5; font-size: 12px; }
    .panel-section__body { padding: var(--gm-space-4); }

    .stack { display: flex; flex-direction: column; gap: var(--gm-space-3); }
    .field { display: flex; flex-direction: column; gap: var(--gm-space-2); }
    .field label { font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }
    .field__hint { color: var(--gm-muted); font-size: 11px; line-height: 1.45; }

    input, textarea {
        width: 100%; min-height: 38px; padding: 8px 10px;
        border: 1px solid var(--gm-border); border-radius: var(--gm-radius-sm);
        background: color-mix(in srgb, var(--vscode-input-background) 88%, var(--gm-surface-alt) 12%);
        color: var(--vscode-input-foreground);
    }
    input:hover, textarea:hover { border-color: var(--gm-border-strong); }
    textarea { min-height: 140px; resize: vertical; line-height: 1.55; }

    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gm-space-3); }

    .category-group { display: flex; flex-wrap: wrap; gap: var(--gm-space-2); }
    .category-chip {
        padding: 6px 12px; border: 1px solid var(--gm-border); border-radius: 999px;
        background: var(--gm-surface-alt); color: var(--vscode-foreground);
        font-size: 12px; font-weight: 600; cursor: pointer; user-select: none;
    }
    .category-chip:hover { border-color: var(--gm-border-strong); background: var(--gm-surface); }
    .category-chip.selected {
        background: var(--gm-accent-soft); border-color: var(--gm-border-strong); font-weight: 700;
    }

    button {
        min-height: 36px; padding: 8px 12px; border-radius: var(--gm-radius-sm);
        border: 1px solid transparent; cursor: pointer; font-weight: 700; font-size: 12px;
    }
    button:hover:not(:disabled) { transform: translateY(-1px); }
    button:disabled { cursor: not-allowed; opacity: 0.52; }
    .btn-primary {
        background: var(--vscode-button-background); color: var(--vscode-button-foreground);
        box-shadow: inset 0 1px 0 color-mix(in srgb, white 18%, transparent 82%);
    }
    .btn-primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }

    .actions { display: flex; justify-content: flex-end; gap: var(--gm-space-3); padding-top: var(--gm-space-3); }

    .char-count { text-align: right; color: var(--gm-muted); font-size: 11px; }
    .char-count.warn { color: var(--vscode-errorForeground, #f85149); }
</style>
</head>
<body>
<div class="shell">
    <div class="hero">
        <div class="hero__icon">?</div>
        <div>
            <p class="hero__eyebrow">Feedback</p>
            <h1>Send Feedback</h1>
            <p class="hero__description">Report a bug, suggest a feature, or share your experience. Every bit of feedback helps make Git Mew better.</p>
        </div>
    </div>

    <div class="panel-section">
        <div class="panel-section__header">
            <h2>Your feedback</h2>
            <p class="panel-section__description">Pick a category and describe your feedback in detail so we can act on it faster.</p>
        </div>
        <div class="panel-section__body">
            <form id="feedbackForm" class="stack">
                <div class="field">
                    <label>Category</label>
                    <div class="category-group" id="categoryGroup">
                        <span class="category-chip selected" data-value="suggestion">Suggestion</span>
                        <span class="category-chip" data-value="bug">Bug Report</span>
                        <span class="category-chip" data-value="ux">Experience</span>
                        <span class="category-chip" data-value="other">Other</span>
                    </div>
                </div>

                <div class="field">
                    <label for="message">Message <span style="color:var(--vscode-errorForeground)">*</span></label>
                    <textarea id="message" placeholder="Describe your feedback, the issue you encountered, or the feature you'd like..." maxlength="2000" required></textarea>
                    <div class="char-count" id="charCount">0 / 2000</div>
                </div>

                <div class="form-row">
                    <div class="field">
                        <label for="name">Name (optional)</label>
                        <input type="text" id="name" placeholder="Your name">
                    </div>
                    <div class="field">
                        <label for="email">Email (optional)</label>
                        <input type="email" id="email" placeholder="your@email.com">
                        <span class="field__hint">So we can follow up with you</span>
                    </div>
                </div>

                <div class="actions">
                    <button type="submit" class="btn-primary" id="submitBtn" disabled>Send feedback</button>
                </div>
            </form>
        </div>
    </div>
</div>

<script>
    const vscode = acquireVsCodeApi();
    const form = document.getElementById('feedbackForm');
    const messageEl = document.getElementById('message');
    const nameEl = document.getElementById('name');
    const emailEl = document.getElementById('email');
    const submitBtn = document.getElementById('submitBtn');
    const charCount = document.getElementById('charCount');
    const chips = document.querySelectorAll('.category-chip');
    let selectedCategory = 'suggestion';

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            selectedCategory = chip.dataset.value;
        });
    });

    messageEl.addEventListener('input', () => {
        const len = messageEl.value.length;
        charCount.textContent = len + ' / 2000';
        charCount.classList.toggle('warn', len > 1800);
        submitBtn.disabled = !messageEl.value.trim();
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const msg = messageEl.value.trim();
        if (!msg) return;

        const prefix = '[' + selectedCategory + '] ';
        vscode.postMessage({
            command: 'submit',
            message: prefix + msg,
            name: nameEl.value.trim(),
            email: emailEl.value.trim()
        });

        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
    });
</script>
</body>
</html>`;
}
