import hljs from 'highlight.js';
import MarkdownIt from 'markdown-it';

export function getWebviewContent(markdownContent: string): string {
    const md: MarkdownIt = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        highlight: function (str: string, lang: string): string {
            // Handle diff syntax highlighting
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
                return '<pre class="hljs diff-block"><code>' + highlightedLines + '</code></pre>';
            }
            
            // Handle regular code syntax highlighting
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return '<pre class="hljs"><code>' +
                           hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                           '</code></pre>';
                } catch (__) {}
            }
            return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
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
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                line-height: 1.6;
                padding: 20px;
                max-width: 900px;
                margin: 0 auto;
            }
            pre {
                background-color: #1e1e1e;
                border-radius: 6px;
                padding: 16px;
                overflow-x: auto;
            }
            code {
                font-family: 'Courier New', Courier, monospace;
                font-size: 14px;
            }
            pre code {
                background: none;
                padding: 0;
            }
            /* Diff highlighting styles */
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
        </style>
    </head>
    <body>
        ${htmlContent}
    </body>
    </html>`;
}