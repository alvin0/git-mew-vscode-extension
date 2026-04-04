import * as vscode from 'vscode';
import * as path from 'path';
import * as crypto from 'crypto';
import { GitOperations } from './gitOperations';
import { getGraphHtml, getGraphStyles, getGraphScript } from './graphWebviewContent';

export class GitMewGraphProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'gitmew-graph';

	private _view?: vscode.WebviewView;
	private _ops: GitOperations;
	private _context: vscode.ExtensionContext;

	constructor(context: vscode.ExtensionContext, ops: GitOperations) {
		this._context = context;
		this._ops = ops;
	}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	): void {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.file(path.join(this._context.extensionPath, 'resources')),
			]
		};
		webviewView.webview.html = this._getHtml();
		webviewView.webview.onDidReceiveMessage((msg) => this._handleMessage(msg));
	}

	get view(): vscode.WebviewView | undefined {
		return this._view;
	}

	private _getHtml(): string {
		const nonce = crypto.randomBytes(16).toString('base64');
		// style-src uses nonce to prevent style injection.
		// script-src uses 'unsafe-inline' because the HTML relies on inline
		// onclick handlers throughout; VS Code webviews are already sandboxed
		// (no network, no external scripts) so the XSS surface is limited to
		// data flowing through postMessage, which we sanitize with escapeHtml.
		const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'unsafe-inline';`;
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Graph</title>
<style nonce="${nonce}">${getGraphStyles()}</style>
</head>
<body>
${getGraphHtml()}
${getGraphScript()}
</body>
</html>`;
	}

	private async _handleMessage(msg: any): Promise<void> {
		switch (msg.command) {
			case 'ready':
				this._ops.pushGraph();
				break;
			case 'refresh':
				this._ops.pushGraph();
				break;
			case 'undo-commit':
				await this._ops.undoCommit(msg.sha);
				break;
			case 'get-commit-files':
				await this._ops.pushCommitFiles(msg.sha);
				break;
			case 'open-commit-diff':
				await this._ops.openCommitFileDiff(msg.sha, msg.filePath);
				break;
			case 'edit-commit':
				await this._ops.editCommitMessage(msg.sha, msg.isPushed, msg.message);
				break;
			case 'get-commit-message':
				await this._ops.pushCommitMessage(msg.sha);
				break;
			case 'generate-edit-msg':
				await this._handleGenerateEditMsg(msg.sha);
				break;
			case 'undo-edit-msg':
				await this._ops.undoEditMessage(msg.backup);
				break;
			case 'dismiss-edit-backup':
				await this._ops.dismissEditBackup(msg.backup);
				break;
			case 'squash-commits':
				await this._ops.squashCommits(msg.count, msg.message);
				break;
			case 'undo-squash':
				await this._ops.undoSquash(msg.backup);
				break;
			case 'dismiss-squash-backup':
				await this._ops.dismissSquashBackup(msg.backup);
				break;
			case 'get-squash-messages':
				await this._ops.pushSquashMessages(msg.count);
				break;
			case 'generate-squash-msg':
				await this._handleGenerateSquashMsg(msg.count);
				break;
			case 'review-selected-commits':
				await vscode.commands.executeCommand('git-mew.review-selected-commits', msg.commits);
				break;
			case 'git-push':
				await vscode.commands.executeCommand('git.push');
				break;
			case 'git-sync':
				await vscode.commands.executeCommand('git.sync');
				break;
		}
	}

	private async _handleGenerateEditMsg(sha: string): Promise<void> {
		if (!this._view) { return; }
		try {
			const msg = await this._ops.generateCommitMessageFromSha(sha);
			this._view.webview.postMessage({ command: 'edit-msg-generated', text: msg || '' });
		} catch {
			this._view.webview.postMessage({ command: 'edit-msg-generated', text: '' });
		}
	}

	private async _handleGenerateSquashMsg(count: number): Promise<void> {
		if (!this._view) { return; }
		try {
			const msg = await this._ops.generateSquashMessage(count);
			this._view.webview.postMessage({ command: 'squash-msg-generated', text: msg || '' });
		} catch {
			this._view.webview.postMessage({ command: 'squash-msg-generated', text: '' });
		}
	}
}
