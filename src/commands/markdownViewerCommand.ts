import * as vscode from 'vscode';
import { getWebviewContent } from './markdownViewer/webviewContentGenerator';

export function registerMarkdownViewerCommand(context: vscode.ExtensionContext): vscode.Disposable {
    const command = 'commit-generate.showMarkdown';

    const commandHandler = async (uri: vscode.Uri) => {
        const panel = vscode.window.createWebviewPanel(
            'markdownViewer',
            'Markdown Viewer',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        try {
            const content = await vscode.workspace.fs.readFile(uri);
            panel.webview.html = getWebviewContent(content.toString());
        } catch (error: unknown) {
            vscode.window.showErrorMessage(`Failed to open markdown viewer: ${error}`);
            console.error('Markdown viewer read error:', error);
        }
    };

    return vscode.commands.registerCommand(command, commandHandler);
}
