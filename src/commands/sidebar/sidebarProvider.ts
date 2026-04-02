import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../../services/utils/gitService';
import { LLMService } from '../../services/llm';
import { GitOperations } from './gitOperations';
import { getGitApi } from './gitHelpers';
import { getWebviewHtml } from './webviewContent';
import { resolveFileIconTheme } from './fileIconResolver';

export class GitMewSidebarProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'git-mew-commands';

	private _view?: vscode.WebviewView;
	private _context: vscode.ExtensionContext;
	private _ops: GitOperations;
	private _stateDisposable?: vscode.Disposable;

	constructor(context: vscode.ExtensionContext, gitService: GitService, llmService: LLMService) {
		this._context = context;
		this._ops = new GitOperations(gitService, llmService, () =>
			this._view ? { postMessage: (msg: any) => this._view!.webview.postMessage(msg) } : undefined
		);
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
				...vscode.extensions.all.map(e => vscode.Uri.file(e.extensionPath))
			]
		};
		webviewView.webview.html = getWebviewHtml();

		setTimeout(() => this._subscribeToGitState(), 500);

		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) this._ops.pushState();
		});
		webviewView.onDidDispose(() => this._stateDisposable?.dispose());
		webviewView.webview.onDidReceiveMessage((msg) => this._handleMessage(msg));
	}

	private async _handleMessage(msg: any): Promise<void> {
		switch (msg.command) {
			case 'ready':
				this._subscribeToGitState();
				this._ops.pushState();
				this._ops.pushGraph();
				this._pushIconTheme();
				break;
			case 'generate-commit':
				await vscode.commands.executeCommand('git-mew.generate-commit');
				this._ops.pushState();
				setTimeout(() => this._ops.pushState(), 2500);
				break;
			case 'commit': await this._ops.doCommit(msg.message); break;
			case 'commit-msg-change': this._ops.setRepoInputBox(msg.message); break;
			case 'stage-all': await vscode.commands.executeCommand('git.stageAll'); break;
			case 'unstage-all': await this._ops.unstageAll(); break;
			case 'discard-all': await this._ops.discardAll(); break;
			case 'stage-file': await this._ops.stageFile(msg.filePath); break;
			case 'unstage-file': await this._ops.unstageFile(msg.filePath); break;
			case 'stage-files': await this._ops.stageFiles(msg.filePaths); break;
			case 'unstage-files': await this._ops.unstageFiles(msg.filePaths); break;
			case 'discard-files': await this._ops.discardFiles(msg.filePaths); break;
			case 'open-diff': await this._ops.openDiff(msg.filePath, msg.isStaged); break;
			case 'open-commit-diff': await this._ops.openCommitFileDiff(msg.sha, msg.filePath); break;
			case 'get-commit-files': await this._ops.pushCommitFiles(msg.sha); break;
			case 'discard-file': await this._ops.discardFile(msg.filePath); break;
			case 'refresh': this._ops.pushState(); this._ops.pushGraph(); break;
			case 'git-push': await vscode.commands.executeCommand('git.push'); break;
			case 'git-sync': await vscode.commands.executeCommand('git.sync'); break;
			case 'undo-commit': await this._ops.undoCommit(msg.sha); break;
			case 'edit-commit': await this._ops.editCommitMessage(msg.sha, msg.isPushed, msg.message); break;
			case 'get-commit-message': await this._ops.pushCommitMessage(msg.sha); break;
			case 'generate-edit-msg': await this._handleGenerateEditMsg(msg.sha); break;
			case 'undo-edit-msg': await this._ops.undoEditMessage(msg.backup); break;
			case 'dismiss-edit-backup': await this._ops.dismissEditBackup(msg.backup); break;
			case 'squash-commits': await this._ops.squashCommits(msg.count, msg.message); break;
			case 'undo-squash': await this._ops.undoSquash(msg.backup); break;
			case 'dismiss-squash-backup': await this._ops.dismissSquashBackup(msg.backup); break;
			case 'get-squash-messages': await this._ops.pushSquashMessages(msg.count); break;
			case 'generate-squash-msg': await this._handleGenerateSquashMsg(msg.count); break;
			case 'review-staged': await vscode.commands.executeCommand('git-mew.review-staged-changes'); break;
			case 'review-merge': await vscode.commands.executeCommand('git-mew.review-merge'); break;
			case 'review-merged-branch': await vscode.commands.executeCommand('git-mew.review-merged-branch'); break;
			case 'manage-api-keys': await vscode.commands.executeCommand('git-mew.manage-api-keys'); break;
			case 'setup-model': await vscode.commands.executeCommand('git-mew.setupModelGenerateCommit'); break;
		}
	}

	private async _handleGenerateSquashMsg(count: number): Promise<void> {
		if (!this._view) return;
		try {
			const msg = await this._ops.generateSquashMessage(count);
			this._view.webview.postMessage({ command: 'squash-msg-generated', text: msg || '' });
		} catch {
			this._view.webview.postMessage({ command: 'squash-msg-generated', text: '' });
		}
	}

	private async _handleGenerateEditMsg(sha: string): Promise<void> {
		if (!this._view) return;
		try {
			const msg = await this._ops.generateCommitMessageFromSha(sha);
			this._view.webview.postMessage({ command: 'edit-msg-generated', text: msg || '' });
		} catch {
			this._view.webview.postMessage({ command: 'edit-msg-generated', text: '' });
		}
	}

	private async _pushIconTheme(): Promise<void> {
		if (!this._view) return;
		try {
			const theme = await resolveFileIconTheme(this._view.webview);
			if (theme) {
				this._view.webview.postMessage({ command: 'icon-theme', theme });
			}
		} catch { /* ignore */ }
	}

	private _subscribeToGitState(): void {
		this._stateDisposable?.dispose();
		try {
			const git = getGitApi();
			if (!git) return;
			const disposables: vscode.Disposable[] = [];
			const refresh = () => { 
				this._ops.pushState(); 
				this._ops.pushGraph();
				this._updateBadge();
			};
			for (const repo of git.repositories) {
				disposables.push(repo.state.onDidChange(refresh));
				disposables.push(repo.inputBox.onDidChange(() => this._ops.pushState()));
			}
			this._stateDisposable = { dispose: () => disposables.forEach(d => d.dispose()) };
			refresh();
			git.onDidOpenRepository((repo: any) => {
				disposables.push(repo.state.onDidChange(refresh));
				disposables.push(repo.inputBox.onDidChange(() => this._ops.pushState()));
				refresh();
			});
		} catch { /* Git not available */ }
	}

	private _updateBadge(): void {
		if (!this._view) return;
		try {
			const git = getGitApi();
			if (!git) return;
			let totalChanges = 0;
			for (const repo of git.repositories) {
				totalChanges += repo.state.indexChanges.length + repo.state.workingTreeChanges.length;
			}
			this._view.badge = totalChanges > 0 ? { value: totalChanges, tooltip: `${totalChanges} file(s) changed` } : undefined;
		} catch { /* ignore */ }
	}
}
