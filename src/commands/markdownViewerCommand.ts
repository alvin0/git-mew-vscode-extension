import * as vscode from 'vscode';
import { getWebviewContent } from './markdownViewer/webviewContentGenerator';

export function registerMarkdownViewerCommand(context: vscode.ExtensionContext): vscode.Disposable {
    const command = 'commit-generate.showMarkdown';

    const commandHandler = (uri: vscode.Uri) => {
        const panel = vscode.window.createWebviewPanel(
            'markdownViewer',
            'Markdown Viewer',
            vscode.ViewColumn.One,
            {
                enableScripts: true
            }
        );

        vscode.workspace.fs.readFile(uri).then(content => {
            panel.webview.html = getWebviewContent(content.toString());
        });
    };

    return vscode.commands.registerCommand(command, commandHandler);
}