import * as vscode from 'vscode';
import * as path from 'path';
import { GitService } from '../../services/utils/gitService';
import { LLMService } from '../../services/llm';
import { GitOperations } from './gitOperations';
import { getGitApi, getActiveRepo, execGitInRepo } from './gitHelpers';
import { getWebviewHtml } from './webviewContent';
import { resolveFileIconTheme } from './fileIconResolver';
import { GitMewGraphProvider } from './graphProvider';

export class GitMewSidebarProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'git-mew-commands';

	private _view?: vscode.WebviewView;
	private _context: vscode.ExtensionContext;
	private _ops: GitOperations;
	private _stateDisposable?: vscode.Disposable;
	private _graphProvider?: GitMewGraphProvider;
	private _syncStatusBar?: vscode.StatusBarItem;
	private _forcePushActive = false;

	constructor(context: vscode.ExtensionContext, gitService: GitService, llmService: LLMService) {
		this._context = context;
		this._ops = new GitOperations(gitService, llmService, () =>
			this._view ? { postMessage: (msg: any) => this._view!.webview.postMessage(msg) } : undefined
		);
		this._syncStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 200);
		this._syncStatusBar.name = 'Git Mew Sync';
		context.subscriptions.push(this._syncStatusBar);
		// Subscribe to git state immediately
		this._subscribeToGitState();
	}

	get ops(): GitOperations {
		return this._ops;
	}

	setGraphProvider(graphProvider: GitMewGraphProvider): void {
		this._graphProvider = graphProvider;
		graphProvider.setSidebarProvider(this);
		this._ops.setGraphView(() =>
			this._graphProvider?.view ? { postMessage: (msg: any) => this._graphProvider!.view!.webview.postMessage(msg) } : undefined
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
		this._subscribeToGitState();

		webviewView.onDidChangeVisibility(() => {
			if (webviewView.visible) this._ops.pushState();
		});
		webviewView.onDidDispose(() => {
			if (this._inputBoxDebounce) {
				clearTimeout(this._inputBoxDebounce);
				this._inputBoxDebounce = undefined;
			}
			this._stateDisposable?.dispose();
		});
		webviewView.webview.onDidReceiveMessage((msg) => this._handleMessage(msg));
	}

	private async _handleMessage(msg: any): Promise<void> {
		switch (msg.command) {
			case 'ready':
				this._subscribeToGitState();
				this._ops.pushState();
				this._ops.pushGraph();
				this._pushIconTheme();
				if (this._forcePushActive) {
					this._view?.webview.postMessage({ command: 'force-push-status', active: true });
				}
				break;
			case 'generate-commit':
				await vscode.commands.executeCommand('git-mew.generate-commit');
				this._ops.pushState();
				setTimeout(() => this._ops.pushState(), 2500);
				break;
			case 'commit': await this._ops.doCommit(msg.message); this._updateBadge(); setTimeout(() => this._updateBadge(), 1500); break;
			case 'commit-msg-change': this._ops.setRepoInputBox(msg.message); break;
			case 'stage-all': await vscode.commands.executeCommand('git.stageAll'); break;
			case 'stage-all-merge':
				try {
					const git = getGitApi();
					if (git) {
						for (const repo of git.repositories) {
							if (repo.state.mergeChanges?.length) {
								const paths = repo.state.mergeChanges.map((c: any) => c.uri.fsPath);
								await repo.add(paths);
							}
						}
					}
				} catch { /* ignore */ }
				break;
			case 'unstage-all': await this._ops.unstageAll(); break;
			case 'discard-all': await this._ops.discardAll(); break;
			case 'stage-file': await this._ops.stageFile(msg.filePath); break;
			case 'unstage-file': await this._ops.unstageFile(msg.filePath); break;
			case 'stage-files': await this._ops.stageFiles(msg.filePaths); break;
			case 'unstage-files': await this._ops.unstageFiles(msg.filePaths); break;
			case 'discard-files': await this._ops.discardFiles(msg.filePaths); break;
			case 'open-file':
				try {
					const openUri = vscode.Uri.file(msg.filePath);
					await vscode.window.showTextDocument(openUri, { preview: false });
				} catch (err) {
					vscode.window.showErrorMessage(`Failed to open file: ${err}`);
				}
				break;
			case 'open-diff': await this._ops.openDiff(msg.filePath, msg.isStaged); break;
			case 'open-merge-editor':
				try {
					const fileUri = vscode.Uri.file(msg.filePath);
					// Open the file — VS Code will show "Resolve in Merge Editor" for conflict files
					await vscode.commands.executeCommand('vscode.open', fileUri);
				} catch { /* ignore */ }
				break;
			case 'accept-merge':
				try {
					const mergeRepo = getActiveRepo();
					if (mergeRepo) {
						if (msg.type === 'current') {
							await execGitInRepo(mergeRepo, ['checkout', '--ours', '--', msg.filePath]);
						} else if (msg.type === 'incoming') {
							await execGitInRepo(mergeRepo, ['checkout', '--theirs', '--', msg.filePath]);
						}
						await mergeRepo.add([msg.filePath]);
						try { await mergeRepo.status(); } catch { /* ignore */ }
					}
					this._ops.pushState();
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to accept changes: ${error}`);
				}
				break;
			case 'discard-file': await this._ops.discardFile(msg.filePath); break;
			case 'refresh': this._ops.pushState(); this._ops.pushGraph(); break;
			case 'git-push':
				await vscode.commands.executeCommand('git.push');
				break;
			case 'git-sync': await vscode.commands.executeCommand('git.sync'); break;
			case 'abort-merge':
				try {
					const answer = await vscode.window.showWarningMessage(
						'Abort merge? All merge progress will be lost.',
						{ modal: true },
						'Abort Merge'
					);
					if (answer === 'Abort Merge') {
						const repo = getActiveRepo();
						if (repo) {
							await execGitInRepo(repo, ['merge', '--abort']);
							try { await repo.status(); } catch { /* ignore */ }
						}
						this._ops.pushState();
						this._ops.pushGraph();
					}
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to abort merge: ${error}`);
				}
				break;
			case 'git-force-push': await this._doForcePush(); break;
			case 'review-staged': await vscode.commands.executeCommand('git-mew.review-staged-changes'); break;
			case 'review-merge': await vscode.commands.executeCommand('git-mew.review-merge'); break;
			case 'review-merged-branch': await vscode.commands.executeCommand('git-mew.review-merged-branch'); break;
			case 'manage-api-keys': await vscode.commands.executeCommand('git-mew.manage-api-keys'); break;
			case 'setup-model': await vscode.commands.executeCommand('git-mew.setupModelGenerateCommit'); break;
			case 'publish': await vscode.commands.executeCommand('git-mew.publish'); break;
		}
	}

	setForcePushNeeded(needed: boolean): void {
		this._forcePushActive = needed;
		if (this._view) {
			this._view.webview.postMessage({ command: 'force-push-status', active: needed });
		}
	}

	private async _doForcePush(): Promise<void> {
		const answer = await vscode.window.showWarningMessage(
			'Are you sure you want to force push? This will overwrite the remote history and may affect other collaborators.',
			{ modal: true },
			'Force Push'
		);
		if (answer !== 'Force Push') return;
		try {
			const repo = getActiveRepo();
			if (!repo) {
				vscode.window.showErrorMessage('No active repository found.');
				return;
			}
			const branch = repo.state.HEAD?.name;
			if (!branch) {
				vscode.window.showErrorMessage('No branch found.');
				return;
			}
			await repo.push('origin', branch, true);
			this.setForcePushNeeded(false);
			this._ops.pushGraph();
			this._updateBadge();
			vscode.window.showInformationMessage('✓ Force push completed.');
		} catch (error) {
			vscode.window.showErrorMessage(`Force push failed: ${error}`);
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

	private _inputBoxDebounce?: NodeJS.Timeout;

	private _subscribeToGitState(): void {
		if (this._stateDisposable) return; // Already subscribed

		try {
			const git = getGitApi();
			if (!git) return;
			const disposables: vscode.Disposable[] = [];
			
			const refresh = () => { 
				this._ops.pushState(); 
				this._ops.pushGraph();
				this._updateBadge();
			};

			const pushStateDebounced = () => {
				if (this._inputBoxDebounce) {
					clearTimeout(this._inputBoxDebounce);
				}
				this._inputBoxDebounce = setTimeout(() => {
					this._ops.pushState();
				}, 300);
			};

			const subscribeToRepo = (repo: any) => {
				disposables.push(repo.state.onDidChange(refresh));
				disposables.push(repo.inputBox.onDidChange(pushStateDebounced));
			};

			for (const repo of git.repositories) {
				subscribeToRepo(repo);
			}

			this._stateDisposable = { dispose: () => disposables.forEach(d => d.dispose()) };
			
			refresh();
			
			disposables.push(git.onDidOpenRepository((repo: any) => {
				subscribeToRepo(repo);
				refresh();
			}));
		} catch { /* Git not available */ }
	}

	private _updateBadge(): void {
		try {
			const git = getGitApi();
			if (!git) return;
			let totalChanges = 0;
			let ahead = 0;
			let behind = 0;
			for (const repo of git.repositories) {
				totalChanges += repo.state.indexChanges.length + repo.state.workingTreeChanges.length + (repo.state.mergeChanges?.length ?? 0);
				ahead += repo.state.HEAD?.ahead ?? 0;
				behind += repo.state.HEAD?.behind ?? 0;
			}
			// Badge on activity bar logo
			if (this._view) {
				const syncCount = ahead + behind;
				if (totalChanges > 0) {
					const parts: string[] = [`${totalChanges} change(s)`];
					if (ahead > 0) parts.push(`↑${ahead} to push`);
					if (behind > 0) parts.push(`↓${behind} to pull`);
					this._view.badge = { value: totalChanges, tooltip: parts.join(' · ') };
				} else if (syncCount > 0) {
					const parts: string[] = [];
					if (ahead > 0) parts.push(`↑${ahead} to push`);
					if (behind > 0) parts.push(`↓${behind} to pull`);
					this._view.badge = { value: syncCount, tooltip: parts.join(' · ') };
				} else {
					this._view.badge = undefined;
				}
				this._view.webview.postMessage({ command: 'sync-status', hasPushPull: syncCount > 0 });
			}
			// Sync status bar item (always updated)
			if (this._syncStatusBar) {
				if (behind > 0 && ahead > 0) {
					this._syncStatusBar.text = `$(sync-ignored) ${ahead}↑ ${behind}↓`;
					this._syncStatusBar.tooltip = `Git Mew: ${ahead} commit(s) to push, ${behind} commit(s) to pull — click to sync`;
					this._syncStatusBar.command = 'git.sync';
					this._syncStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
					this._syncStatusBar.show();
				} else if (ahead > 0) {
					this._syncStatusBar.text = `$(arrow-up) ${ahead} to push`;
					this._syncStatusBar.tooltip = `Git Mew: ${ahead} commit(s) to push — click to push`;
					this._syncStatusBar.command = 'git.push';
					this._syncStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
					this._syncStatusBar.show();
				} else if (behind > 0) {
					this._syncStatusBar.text = `$(arrow-down) ${behind} to pull`;
					this._syncStatusBar.tooltip = `Git Mew: ${behind} commit(s) to pull — click to sync`;
					this._syncStatusBar.command = 'git.sync';
					this._syncStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
					this._syncStatusBar.show();
				} else {
					this._syncStatusBar.hide();
				}
			}
		} catch { /* ignore */ }
	}
}
