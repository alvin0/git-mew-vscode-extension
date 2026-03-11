import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';
import { buildPlantUmlSvgUrl } from '../../services/utils/plantUml';

export function getWebviewContent(markdownContent: string): string {
    const md: MarkdownIt = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        highlight: function (str: string, lang: string): string {
            if (lang === 'diff') {
                const lines = str.split('\n');
                const highlightedLines = lines.map(line => {
                    if (line.startsWith('+') && !line.startsWith('+++')) {
                        return `<span class="diff-add">${md.utils.escapeHtml(line)}</span>`;
                    } else if (line.startsWith('-') && !line.startsWith('---')) {
                        return `<span class="diff-remove">${md.utils.escapeHtml(line)}</span>`;
                    } else if (line.startsWith('@@')) {
                        return `<span class="diff-header">${md.utils.escapeHtml(line)}</span>`;
                    } else if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
                        return `<span class="diff-meta">${md.utils.escapeHtml(line)}</span>`;
                    }
                    return md.utils.escapeHtml(line);
                }).join('\n');
                return '<pre class="hljs diff-block"><code class="language-diff">' + highlightedLines + '</code></pre>';
            }

            if (lang === 'plantuml') {
                return '<div class="plantuml-wrapper"><div class="plantuml-frame"><div class="plantuml-toolbar"><button type="button" class="plantuml-expand-btn">View larger</button></div><img class="plantuml-diagram" src="' +
                    buildPlantUmlSvgUrl(str) +
                    '" alt="PlantUML diagram" loading="lazy" /></div></div>';
            }

            if (lang && hljs.getLanguage(lang)) {
                try {
                    return '<pre class="hljs"><code class="language-' +
                        md.utils.escapeHtml(lang) +
                        '">' +
                        hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                        '</code></pre>';
                } catch (__) {}
            }

            const className = lang ? ' class="language-' + md.utils.escapeHtml(lang) + '"' : '';
            return '<pre class="hljs"><code' + className + '>' + md.utils.escapeHtml(str) + '</code></pre>';
        }
    });

    const htmlContent = md.render(markdownContent);

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Markdown Viewer</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
        <style>
            :root {
                color-scheme: light dark;
                --mv-bg: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-sideBar-background) 8%);
                --mv-surface: color-mix(in srgb, var(--vscode-editor-background) 84%, var(--vscode-input-background) 16%);
                --mv-surface-alt: color-mix(in srgb, var(--vscode-editor-background) 68%, var(--vscode-sideBar-background) 32%);
                --mv-border: color-mix(in srgb, var(--vscode-input-border, var(--vscode-panel-border)) 85%, transparent 15%);
                --mv-accent: var(--vscode-focusBorder, var(--vscode-button-background));
                --mv-muted: var(--vscode-descriptionForeground);
            }
            * {
                box-sizing: border-box;
            }
            body {
                margin: 0;
                font-family: var(--vscode-font-family);
                line-height: 1.7;
                color: var(--vscode-foreground);
                background:
                    radial-gradient(circle at top left, color-mix(in srgb, var(--mv-accent) 10%, transparent 90%), transparent 34%),
                    linear-gradient(180deg, color-mix(in srgb, var(--vscode-sideBar-background) 28%, var(--mv-bg) 72%) 0%, var(--mv-bg) 100%);
            }
            .viewer-shell {
                max-width: 1040px;
                margin: 0 auto;
                padding: 24px;
            }
            .viewer-hero {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                padding: 20px 22px;
                margin-bottom: 20px;
                border: 1px solid var(--mv-border);
                border-radius: 20px;
                background: linear-gradient(135deg, color-mix(in srgb, var(--mv-accent) 8%, var(--mv-surface) 92%) 0%, var(--mv-surface) 100%);
            }
            .viewer-hero h1 {
                margin: 0;
                font-size: clamp(24px, 4vw, 32px);
                line-height: 1.15;
            }
            .viewer-hero p {
                margin: 6px 0 0;
                color: var(--mv-muted);
            }
            .viewer-badge {
                padding: 8px 12px;
                border-radius: 999px;
                border: 1px solid color-mix(in srgb, var(--mv-accent) 45%, var(--mv-border) 55%);
                background: color-mix(in srgb, var(--mv-accent) 14%, transparent 86%);
                font-size: 12px;
                font-weight: 700;
                white-space: nowrap;
            }
            .viewer-content {
                padding: 24px;
                border: 1px solid var(--mv-border);
                border-radius: 20px;
                background: linear-gradient(180deg, var(--mv-surface) 0%, var(--mv-surface-alt) 100%);
            }
            h1, h2, h3, h4 {
                line-height: 1.25;
            }
            pre {
                border-radius: 14px;
                padding: 16px;
                overflow-x: auto;
                border: 1px solid var(--mv-border);
                background-color: color-mix(in srgb, var(--vscode-textCodeBlock-background) 92%, #000 8%);
            }
            code {
                font-family: var(--vscode-editor-font-family);
                font-size: 13px;
            }
            :not(pre) > code {
                padding: 0.15em 0.45em;
                border-radius: 6px;
                background: color-mix(in srgb, var(--vscode-textCodeBlock-background) 88%, transparent 12%);
            }
            pre code {
                background: none;
                padding: 0;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin: 1em 0;
            }
            th, td {
                padding: 10px 12px;
                border: 1px solid var(--mv-border);
                text-align: left;
            }
            blockquote {
                margin-left: 0;
                padding-left: 14px;
                border-left: 3px solid color-mix(in srgb, var(--mv-accent) 48%, var(--mv-border) 52%);
                color: var(--mv-muted);
            }
            .diff-block {
                background-color: #0d1117;
                border: 1px solid #30363d;
            }
            .diff-add {
                display: block;
                background-color: #0d4429;
                color: #aff5b4;
            }
            .diff-remove {
                display: block;
                background-color: #5a1e1e;
                color: #ffdcd7;
            }
            .diff-header {
                display: block;
                background-color: #1f2937;
                color: #8b949e;
                font-weight: bold;
            }
            .diff-meta {
                display: block;
                color: #8b949e;
                font-style: italic;
            }
            .diff-block code {
                display: block;
            }
            .plantuml-wrapper {
                margin: 16px 0;
                padding: 16px;
                overflow-x: auto;
                border-radius: 14px;
                border: 1px solid var(--mv-border);
                background: linear-gradient(180deg, color-mix(in srgb, var(--mv-surface-alt) 88%, transparent 12%) 0%, var(--mv-surface) 100%);
            }
            .plantuml-frame {
                position: relative;
            }
            .plantuml-toolbar {
                display: flex;
                justify-content: flex-end;
                margin-bottom: 8px;
            }
            .plantuml-expand-btn {
                min-height: 28px;
                padding: 5px 10px;
                border: 1px solid var(--mv-border);
                border-radius: 999px;
                background: color-mix(in srgb, var(--mv-surface) 88%, transparent 12%);
                color: var(--vscode-foreground);
                font: inherit;
                font-size: 11px;
                font-weight: 700;
                cursor: pointer;
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
                width: min(1240px, 100%);
                max-height: 100%;
                display: flex;
                flex-direction: column;
                border: 1px solid color-mix(in srgb, var(--mv-accent) 45%, var(--mv-border) 55%);
                border-radius: 18px;
                background: linear-gradient(180deg, var(--mv-surface) 0%, var(--mv-surface-alt) 100%);
                overflow: hidden;
            }
            .plantuml-modal__header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 12px 14px;
                border-bottom: 1px solid var(--mv-border);
            }
            .plantuml-modal__title {
                margin: 0;
                font-size: 13px;
                font-weight: 800;
            }
            .plantuml-modal__close {
                min-height: 32px;
                padding: 6px 12px;
                border: 1px solid var(--mv-border);
                border-radius: 999px;
                background: color-mix(in srgb, var(--mv-surface) 88%, transparent 12%);
                color: var(--vscode-foreground);
                font: inherit;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
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
            @media (max-width: 720px) {
                .viewer-shell {
                    padding: 16px;
                }
                .viewer-hero,
                .viewer-content {
                    padding: 18px;
                }
                .viewer-hero {
                    flex-direction: column;
                    align-items: flex-start;
                }
            }
        </style>
    </head>
    <body>
        <div class="viewer-shell">
            <header class="viewer-hero">
                <div>
                    <h1>Git Mew Markdown Viewer</h1>
                    <p>Formatted review output with readable code blocks, diagrams, and diff rendering.</p>
                </div>
                <div class="viewer-badge">Rendered output</div>
            </header>
            <main class="viewer-content">
                ${htmlContent}
            </main>
        </div>
        <div id="plantumlModal" class="plantuml-modal hidden">
            <div class="plantuml-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="plantumlModalTitle">
                <div class="plantuml-modal__header">
                    <h2 id="plantumlModalTitle" class="plantuml-modal__title">PlantUML diagram</h2>
                    <button type="button" id="plantumlModalClose" class="plantuml-modal__close">Close</button>
                </div>
                <div class="plantuml-modal__body">
                    <img id="plantumlModalImage" class="plantuml-modal__image" alt="Expanded PlantUML diagram" />
                </div>
            </div>
        </div>
        <script>
            (function () {
                const modal = document.getElementById('plantumlModal');
                const modalImage = document.getElementById('plantumlModalImage');
                const closeButton = document.getElementById('plantumlModalClose');

                function hideModal() {
                    modal.classList.add('hidden');
                    modalImage.removeAttribute('src');
                }

                document.querySelectorAll('.plantuml-expand-btn').forEach((button) => {
                    button.addEventListener('click', () => {
                        const frame = button.closest('.plantuml-frame');
                        const image = frame ? frame.querySelector('.plantuml-diagram') : null;
                        if (!image) {
                            return;
                        }

                        modalImage.src = image.getAttribute('src') || '';
                        modal.classList.remove('hidden');
                    });
                });

                closeButton.addEventListener('click', hideModal);
                modal.addEventListener('click', (event) => {
                    if (event.target === modal) {
                        hideModal();
                    }
                });
                window.addEventListener('keydown', (event) => {
                    if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
                        hideModal();
                    }
                });
            })();
        </script>
    </body>
    </html>`;
}
