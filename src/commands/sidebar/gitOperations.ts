import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GitService } from '../../services/utils/gitService';
import { LLMService, UnifiedDiffFile } from '../../services/llm';
import {
	getGitApi, getRepoForFile, getActiveRepo,
	execGitInRepo, toDisplayPath, mapChangeToFileInfo
} from './gitHelpers';

export interface SidebarView {
	postMessage(msg: any): void;
}

export class GitOperations {
	private _getGraphView: (() => SidebarView | undefined) | undefined;
	private _opQueue: Promise<void> = Promise.resolve();

	constructor(
		private _gitService: GitService,
		private _llmService: LLMService,
		private _getView: () => SidebarView | undefined
	) {}

	/**
	 * Serialize state-mutating git operations to prevent concurrent conflicts.
	 * Read-only operations (pushState, pushGraph, etc.) bypass the queue.
	 */
	private _enqueue<T>(fn: () => Promise<T>): Promise<T> {
		const result = this._opQueue.then(() => fn());
		// Keep the queue chain going regardless of success/failure
		this._opQueue = result.then(() => {}, () => {});
		return result;
	}

	setGraphView(getGraphView: () => SidebarView | undefined): void {
		this._getGraphView = getGraphView;
	}

	private _graphView(): SidebarView | undefined {
		return this._getGraphView?.() ?? this._getView();
	}

	// --- State ---

	pushState(): void {
		const view = this._getView();
		if (!view) return;
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) {
				view.postMessage({ command: 'update-state', staged: [], unstaged: [], mergeConflicts: [], isMerging: false, commitMsg: '' });
				return;
			}
			const staged: any[] = [];
			const unstaged: any[] = [];
			const mergeConflicts: any[] = [];
			for (const repo of git.repositories) {
				const root = repo.rootUri.fsPath;
				for (const c of repo.state.indexChanges) {
					staged.push(mapChangeToFileInfo(c, root));
				}
				for (const c of repo.state.workingTreeChanges) {
					unstaged.push({
						filePath: c.uri.fsPath,
						fileName: path.basename(c.uri.fsPath),
						dirName: toDisplayPath(path.relative(root, path.dirname(c.uri.fsPath))),
						status: c.status
					});
				}
				if (repo.state.mergeChanges) {
					for (const c of repo.state.mergeChanges) {
						mergeConflicts.push(mapChangeToFileInfo(c, root));
					}
				}
			}
			const activeRepo = getActiveRepo();
			const commitMsg = activeRepo?.inputBox.value || '';
			// Check if we're in a merge state
			let isMerging = mergeConflicts.length > 0;
			if (!isMerging && activeRepo) {
				try {
					const gitDir = path.join(activeRepo.rootUri.fsPath, '.git');
					const stat = fs.statSync(gitDir);
					if (stat.isDirectory()) {
						isMerging = fs.existsSync(path.join(gitDir, 'MERGE_HEAD'));
					} else {
						// Worktree: .git is a file pointing to the real git dir
						const content = fs.readFileSync(gitDir, 'utf8').trim();
						const realGitDir = content.replace(/^gitdir:\s*/, '');
						isMerging = fs.existsSync(path.join(realGitDir, 'MERGE_HEAD'));
					}
				} catch { /* ignore */ }
			}
			view.postMessage({ command: 'update-state', staged, unstaged, mergeConflicts, isMerging, commitMsg });
		} catch { /* ignore */ }
	}

	// --- Commit ---

	setRepoInputBox(value: string): void {
		try {
			const repo = getActiveRepo();
			if (repo) repo.inputBox.value = value;
		} catch { /* ignore */ }
	}

	async doCommit(message: string): Promise<void> {
		return this._enqueue(async () => {
		if (!message?.trim()) {
			vscode.window.showWarningMessage('Please enter a commit message.');
			return;
		}
		try {
			await this._gitService.commit(message.trim());
			this.setRepoInputBox('');
			this._getView()?.postMessage({ command: 'clear-commit-msg' });
			vscode.window.showInformationMessage('✓ Committed successfully!');
		} catch (error) {
			vscode.window.showErrorMessage(`Commit failed: ${error}`);
		}
		});
	}

	// --- Stage / Unstage / Discard ---

	async stageFile(filePath: string): Promise<void> {
		return this._enqueue(async () => {
		try {
			const repo = getRepoForFile(filePath);
			if (repo) await repo.add([filePath]);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to stage file: ${error}`);
		}
		});
	}

	async unstageFile(filePath: string): Promise<void> {
		return this._enqueue(async () => {
		try {
			const repo = getRepoForFile(filePath);
			if (repo) await repo.revert([filePath]);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to unstage file: ${error}`);
		}
		});
	}

	async stageFiles(filePaths: string[]): Promise<void> {
		return this._enqueue(async () => {
		if (!filePaths.length) return;
		try {
			const repo = getRepoForFile(filePaths[0]);
			if (repo) await repo.add(filePaths);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to stage files: ${error}`);
		}
		});
	}

	async unstageFiles(filePaths: string[]): Promise<void> {
		return this._enqueue(async () => {
		if (!filePaths.length) return;
		try {
			const repo = getRepoForFile(filePaths[0]);
			if (repo) await repo.revert(filePaths);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to unstage files: ${error}`);
		}
		});
	}

	async discardFiles(filePaths: string[]): Promise<void> {
		return this._enqueue(async () => {
		if (!filePaths.length) return;
		const answer = await vscode.window.showWarningMessage(
			`Discard changes in ${filePaths.length} file(s)?`,
			{ modal: true }, 'Discard'
		);
		if (answer !== 'Discard') return;
		try {
			const repo = getRepoForFile(filePaths[0]);
			if (repo) await repo.clean(filePaths);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to discard files: ${error}`);
		}
		});
	}

	async discardFile(filePath: string): Promise<void> {
		return this._enqueue(async () => {
		const answer = await vscode.window.showWarningMessage(
			`Discard changes in ${path.basename(filePath)}?`,
			{ modal: true }, 'Discard'
		);
		if (answer !== 'Discard') return;
		try {
			const repo = getRepoForFile(filePath);
			if (repo) await repo.clean([filePath]);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to discard: ${error}`);
		}
		});
	}

	async unstageAll(): Promise<void> {
		return this._enqueue(async () => {
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) return;
			for (const repo of git.repositories) {
				const files = repo.state.indexChanges.map((c: any) => c.uri.fsPath);
				if (files.length > 0) await repo.revert(files);
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to unstage all: ${error}`);
		}
		});
	}

	async discardAll(): Promise<void> {
		return this._enqueue(async () => {
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) return;
			const totalFiles = git.repositories.reduce(
				(sum: number, r: any) => sum + r.state.workingTreeChanges.length, 0
			);
			if (totalFiles === 0) return;
			const answer = await vscode.window.showWarningMessage(
				`Discard all changes in ${totalFiles} file(s)?`,
				{ modal: true }, 'Discard All'
			);
			if (answer !== 'Discard All') return;
			for (const repo of git.repositories) {
				const files = repo.state.workingTreeChanges.map((c: any) => c.uri.fsPath);
				if (files.length > 0) await repo.clean(files);
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to discard all: ${error}`);
		}
		});
	}

	// --- Diff ---

	async openDiff(filePath: string, _isStaged: boolean): Promise<void> {
		try {
			const uri = vscode.Uri.file(filePath);
			await vscode.commands.executeCommand('git.openChange', uri);
		} catch {
			await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
		}
	}

	async openCommitFileDiff(sha: string, filePath: string): Promise<void> {
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) return;
			const repo = git.repositories[0];
			const absPath = path.join(repo.rootUri.fsPath, filePath);
			const fileUri = vscode.Uri.file(absPath);
			const api = git;

			let beforeUri: vscode.Uri;
			let afterUri: vscode.Uri;
			try {
				beforeUri = (api as any).toGitUri(fileUri, `${sha}^`);
				afterUri = (api as any).toGitUri(fileUri, sha);
			} catch {
				await vscode.commands.executeCommand('vscode.open', fileUri);
				return;
			}
			const fileName = path.basename(filePath);
			await vscode.commands.executeCommand('vscode.diff', beforeUri, afterUri, `${fileName} (${sha.slice(0, 7)})`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open diff: ${error}`);
		}
	}

	// --- Graph ---

	async pushGraph(): Promise<void> {
		const graphView = this._graphView();
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) {
				graphView?.postMessage({
					command: 'update-graph', branch: '', upstream: null,
					ahead: 0, behind: 0, conflicts: [], commits: [],
					emptyReason: !git ? 'no-git' : 'no-repo'
				});
				return;
			}
			const repo = git.repositories[0];
			const root = repo.rootUri.fsPath;

			const head = repo.state.HEAD;
			if (!head) {
				// Repository exists but HEAD is not yet available (e.g. freshly initialized, no commits yet)
				graphView?.postMessage({
					command: 'update-graph', branch: '', upstream: null,
					ahead: 0, behind: 0, conflicts: [], commits: [],
					emptyReason: 'no-head'
				});
				return;
			}
			const branch = head.name || 'HEAD';
			const upstream = head?.upstream;
			const ahead = head?.ahead ?? 0;
			const behind = head?.behind ?? 0;

			const conflicts = repo.state.mergeChanges?.map((c: any) => ({
				fileName: path.basename(c.uri.fsPath),
				dirName: toDisplayPath(path.relative(root, path.dirname(c.uri.fsPath)))
			})) ?? [];

			const commits = await this._getRecentCommits(repo, branch, upstream, 30);

			const graphData = {
				command: 'update-graph', branch,
				upstream: upstream ? `${upstream.remote}/${upstream.name}` : null,
				ahead, behind, conflicts, commits
			};

			graphView?.postMessage(graphData);

			// Also send graph data to main view for push/sync banners
			const mainView = this._getView();
			if (mainView && mainView !== graphView) {
				mainView.postMessage(graphData);
			}
		} catch {
			graphView?.postMessage({
				command: 'update-graph', branch: '', upstream: null,
				ahead: 0, behind: 0, conflicts: [], commits: [],
				emptyReason: 'error'
			});
		}
	}

	async pushCommitFiles(sha: string): Promise<void> {
		const view = this._graphView();
		if (!view) return;
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) return;
			const repo = git.repositories[0];
			const output = await execGitInRepo(repo, ['diff-tree', '--no-commit-id', '-r', '--name-status', sha]);
			const files = output.trim().split('\n').filter(Boolean).map(line => {
				const parts = line.split('\t');
				const statusChar = parts[0].charAt(0);
				const filePath = parts[parts.length - 1];
				const statusMap: Record<string, string> = { A: 'A', M: 'M', D: 'D', R: 'R', C: 'C' };
				return {
					status: statusMap[statusChar] || 'M', filePath,
					fileName: path.basename(filePath),
					dirName: toDisplayPath(path.dirname(filePath))
				};
			});
			view.postMessage({ command: 'commit-files', sha, files });
		} catch {
			view.postMessage({ command: 'commit-files', sha, files: [] });
		}
	}

	async undoCommit(sha: string): Promise<void> {
		return this._enqueue(async () => {
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) {
				vscode.window.showErrorMessage('No git repository found.');
				return;
			}
			let repo = null;
			for (const r of git.repositories) {
				try {
					const headSha = (await execGitInRepo(r, ['rev-parse', 'HEAD'])).trim();
					if (headSha === sha.trim() || headSha.startsWith(sha.trim()) || sha.trim().startsWith(headSha.slice(0, 7))) {
						repo = r;
						break;
					}
				} catch { /* skip */ }
			}
			if (!repo) {
				vscode.window.showErrorMessage('Can only undo the most recent unpushed commit.');
				return;
			}
			const answer = await vscode.window.showWarningMessage(
				`Undo commit ${sha.slice(0, 7)}? Files will be returned to Staged Changes.`,
				{ modal: true }, 'Undo Commit'
			);
			if (answer !== 'Undo Commit') return;

			await execGitInRepo(repo, ['reset', '--soft', 'HEAD~1']);
			try { await repo.status(); } catch { /* ignore */ }
			await new Promise(r => setTimeout(r, 500));
			this.pushState();
			this.pushGraph();
			vscode.window.showInformationMessage('✓ Commit undone. Files are back in Staged Changes.');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to undo commit: ${error}`);
		}
		});
	}

	async editCommitMessage(sha: string, isPushed = false, newMessage?: string): Promise<void> {
		return this._enqueue(async () => {
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) {
				vscode.window.showErrorMessage('No git repository found.');
				return;
			}
			let repo = null;
			for (const r of git.repositories) {
				try {
					const headSha = (await execGitInRepo(r, ['rev-parse', 'HEAD'])).trim();
					if (headSha === sha.trim() || headSha.startsWith(sha.trim()) || sha.trim().startsWith(headSha.slice(0, 7))) {
						repo = r;
						break;
					}
				} catch { /* skip */ }
			}
			if (!repo) {
				vscode.window.showErrorMessage('Can only edit the most recent commit.');
				return;
			}
			if (!newMessage?.trim()) return;
			// Block if there are staged changes — amend would include them unintentionally
			const stagedCount = repo.state.indexChanges.length;
			if (stagedCount > 0) {
				vscode.window.showWarningMessage(
					`Cannot edit commit message: you have ${stagedCount} staged file(s). Unstage them first.`
				);
				return;
			}
			// Create backup branch before amending
			const backupBranch = `git-mew-edit-backup-${Date.now()}`;
			await execGitInRepo(repo, ['branch', backupBranch]);
			await execGitInRepo(repo, ['commit', '--amend', '-m', newMessage.trim()]);
			try { await repo.status(); } catch { /* ignore */ }
			await new Promise(r => setTimeout(r, 500));
			this.pushState();
			this.pushGraph();
			const note = isPushed ? ' You will need to force push to update remote.' : '';
			vscode.window.showInformationMessage(`✓ Commit message updated.${note}`);
			this._graphView()?.postMessage({ command: 'edit-msg-done', backup: backupBranch });
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to edit commit message: ${error}`);
		}
		});
	}

	async pushCommitMessage(sha: string): Promise<void> {
		const view = this._graphView();
		if (!view) return;
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) return;
			const repo = git.repositories[0];
			const text = (await execGitInRepo(repo, ['log', '-1', '--format=%B', 'HEAD'])).trim();
			view.postMessage({ command: 'commit-message', text });
		} catch {
			view.postMessage({ command: 'commit-message', text: '' });
		}
	}

	async undoEditMessage(backupBranch: string): Promise<void> {
		return this._enqueue(async () => {
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) return;
			const repo = git.repositories[0];
			const answer = await vscode.window.showWarningMessage(
				'Undo commit message edit and restore original?',
				{ modal: true }, 'Undo'
			);
			if (answer !== 'Undo') return;
			await execGitInRepo(repo, ['reset', '--hard', backupBranch]);
			try { await execGitInRepo(repo, ['branch', '-D', backupBranch]); } catch { /* */ }
			try { await repo.status(); } catch { /* ignore */ }
			await new Promise(r => setTimeout(r, 500));
			this.pushState();
			this.pushGraph();
			this._graphView()?.postMessage({ command: 'edit-msg-undone' });
			vscode.window.showInformationMessage('✓ Commit message restored.');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to undo: ${error}`);
		}
		});
	}

	async dismissEditBackup(backupBranch: string): Promise<void> {
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) return;
			const repo = git.repositories[0];
			try { await execGitInRepo(repo, ['branch', '-D', backupBranch]); } catch { /* */ }
			this._graphView()?.postMessage({ command: 'edit-msg-undone' });
		} catch { /* ignore */ }
	}

	async generateCommitMessageFromSha(sha: string): Promise<string | null> {
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) return null;
			const repo = git.repositories[0];
			const root = repo.rootUri.fsPath;
			const branch = repo.state.HEAD?.name || 'HEAD';

			// Get diff of this specific commit
			const diffOutput = await execGitInRepo(repo, ['show', '--format=', sha]);

			// Get changed files
			const nameStatusOutput = await execGitInRepo(repo, [
				'diff-tree', '--no-commit-id', '-r', '--name-status', sha
			]);

			const files: UnifiedDiffFile[] = nameStatusOutput.trim().split('\n')
				.filter(Boolean)
				.map(line => {
					const parts = line.split('\t');
					const statusChar = parts[0].charAt(0);
					const filePath = parts[parts.length - 1];
					const statusMap: Record<string, number> = { A: 2, M: 0, D: 3, R: 4, C: 5 };
					const statusLabelMap: Record<string, string> = { A: 'Added', M: 'Modified', D: 'Deleted', R: 'Renamed', C: 'Copied' };
					return {
						filePath: path.join(root, filePath),
						relativePath: filePath,
						diff: '',
						status: statusMap[statusChar] ?? 0,
						statusLabel: statusLabelMap[statusChar] ?? 'Modified',
						isDeleted: statusChar === 'D',
						isBinary: false
					};
				});

			return await this._llmService.generateCommitMessage(files, diffOutput, branch);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to generate commit message: ${error}`);
			return null;
		}
	}

	/** Get combined commit messages for N commits from HEAD */
	async getSquashMessages(count: number): Promise<string> {
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) return '';
			const repo = git.repositories[0];
			const output = await execGitInRepo(repo, [
				'log', '--format=%s', '-n', String(count), 'HEAD'
			]);
			return output.trim().split('\n').filter(Boolean).map((s, i) => `- ${s}`).join('\n');
		} catch { return ''; }
	}

	/** Push combined commit messages to webview for squash dialog pre-fill */
	async pushSquashMessages(count: number): Promise<void> {
		const view = this._graphView();
		if (!view) return;
		const text = await this.getSquashMessages(count);
		view.postMessage({ command: 'squash-messages', text });
	}

	/** Generate a squash commit message using LLM based on the diff of N commits */
	async generateSquashMessage(count: number): Promise<string | null> {
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) return null;
			const repo = git.repositories[0];
			const branch = repo.state.HEAD?.name || 'HEAD';

			// Get the combined diff of HEAD~N..HEAD
			const diffOutput = await execGitInRepo(repo, [
				'diff', `HEAD~${count}`, 'HEAD'
			]);

			// Get changed files list with status
			const nameStatusOutput = await execGitInRepo(repo, [
				'diff', '--name-status', `HEAD~${count}`, 'HEAD'
			]);

			// Build UnifiedDiffFile[] from the diff
			const root = repo.rootUri.fsPath;
			const files: UnifiedDiffFile[] = nameStatusOutput.trim().split('\n')
				.filter(Boolean)
				.map(line => {
					const parts = line.split('\t');
					const statusChar = parts[0].charAt(0);
					const filePath = parts[parts.length - 1];
					const statusMap: Record<string, number> = { A: 2, M: 0, D: 3, R: 4, C: 5 };
					const statusLabelMap: Record<string, string> = { A: 'Added', M: 'Modified', D: 'Deleted', R: 'Renamed', C: 'Copied' };
					return {
						filePath: path.join(root, filePath),
						relativePath: filePath,
						diff: '', // individual diffs not needed, we pass full diff as renderedDiff
						status: statusMap[statusChar] ?? 0,
						statusLabel: statusLabelMap[statusChar] ?? 'Modified',
						isDeleted: statusChar === 'D',
						isBinary: false
					};
				});

			// Call LLM to generate commit message
			const message = await this._llmService.generateCommitMessage(
				files,
				diffOutput,
				branch
			);

			return message;
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to generate squash message: ${error}`);
			return null;
		}
	}

	/**
	 * Squash N commits from HEAD into one, with safe backup/restore process.
	 * Works for both pushed and unpushed commits.
	 * 
	 * Safe process:
	 * 1. Create backup branch (git-mew-backup-<timestamp>)
	 * 2. git reset --soft HEAD~N
	 * 3. git commit -m "message"
	 * 4. If pushed commits involved → git push --force-with-lease
	 * 5. On failure → restore from backup branch automatically
	 * 6. On success → delete backup branch
	 */
	async squashCommits(count: number, message: string): Promise<void> {
		return this._enqueue(async () => {
		if (count < 2) {
			vscode.window.showWarningMessage('Select at least 2 commits to squash.');
			return;
		}
		if (!message?.trim()) {
			vscode.window.showWarningMessage('Please provide a commit message.');
			return;
		}
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) {
				vscode.window.showErrorMessage('No git repository found.');
				return;
			}
			const repo = git.repositories[0];
			const head = repo.state.HEAD;
			if (!head?.name) {
				vscode.window.showErrorMessage('Cannot squash in detached HEAD state.');
				return;
			}

			const ahead = head?.ahead ?? 0;
			const includesPushed = count > ahead;

			// Block if there are staged changes — reset --soft + commit would include them
			const stagedCount = repo.state.indexChanges.length;
			if (stagedCount > 0) {
				vscode.window.showWarningMessage(
					`Cannot squash: you have ${stagedCount} staged file(s). Unstage them first.`
				);
				return;
			}
			const warnText = includesPushed
				? `Squash ${count} commits into one? (includes pushed commits — you will need to force-push manually)`
				: `Squash ${count} commits into one?`;

			const answer = await vscode.window.showWarningMessage(warnText, { modal: true }, 'Squash');
			if (answer !== 'Squash') return;

			// Create backup branch for safety
			const backupBranch = `git-mew-backup-${Date.now()}`;
			await execGitInRepo(repo, ['branch', backupBranch]);

			try {
				await execGitInRepo(repo, ['reset', '--soft', `HEAD~${count}`]);
				await execGitInRepo(repo, ['commit', '-m', message.trim()]);

				// Keep backup - notify webview so user can undo
				this._lastSquashBackup = backupBranch;

				try { await repo.status(); } catch { /* ignore */ }
				await new Promise(r => setTimeout(r, 500));
				this.pushState();
				this.pushGraph();

				const note = includesPushed ? ' You may need to force-push to update remote.' : '';
				vscode.window.showInformationMessage(`✓ Squashed ${count} commits into one.${note}`);

				// Notify webview to show undo-squash banner
				this._graphView()?.postMessage({ command: 'squash-done', backup: backupBranch });
			} catch (error) {
				try {
					await execGitInRepo(repo, ['reset', '--hard', backupBranch]);
					try { await execGitInRepo(repo, ['branch', '-D', backupBranch]); } catch { /* */ }
					try { await repo.status(); } catch { /* ignore */ }
					this.pushState();
					this.pushGraph();
					vscode.window.showErrorMessage(`Squash failed, restored from backup. Error: ${error}`);
				} catch {
					vscode.window.showErrorMessage(`Squash failed. Backup branch: "${backupBranch}". Run: git reset --hard ${backupBranch}`);
				}
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to squash commits: ${error}`);
		}
		});
	}

	/** Undo the last squash by restoring from backup branch */
	async undoSquash(backupBranch: string): Promise<void> {
		return this._enqueue(async () => {
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) return;
			const repo = git.repositories[0];

			const answer = await vscode.window.showWarningMessage(
				`Undo squash and restore original commits from "${backupBranch}"?`,
				{ modal: true }, 'Undo Squash'
			);
			if (answer !== 'Undo Squash') return;

			await execGitInRepo(repo, ['reset', '--hard', backupBranch]);
			try { await execGitInRepo(repo, ['branch', '-D', backupBranch]); } catch { /* */ }
			this._lastSquashBackup = null;

			try { await repo.status(); } catch { /* ignore */ }
			await new Promise(r => setTimeout(r, 500));
			this.pushState();
			this.pushGraph();

			this._graphView()?.postMessage({ command: 'squash-undone' });
			vscode.window.showInformationMessage('✓ Squash undone. Original commits restored.');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to undo squash: ${error}`);
		}
		});
	}

	/** Dismiss the undo-squash option and clean up backup branch */
	async dismissSquashBackup(backupBranch: string): Promise<void> {
		try {
			const git = getGitApi();
			if (!git || git.repositories.length === 0) return;
			const repo = git.repositories[0];
			try { await execGitInRepo(repo, ['branch', '-D', backupBranch]); } catch { /* */ }
			this._lastSquashBackup = null;
			this._graphView()?.postMessage({ command: 'squash-undone' });
		} catch { /* ignore */ }
	}

	private _lastSquashBackup: string | null = null;

	private async _getRecentCommits(repo: any, branch: string, upstream: any, limit: number): Promise<any[]> {
		try {
			const upstreamRef = upstream ? `${upstream.remote}/${upstream.name}` : null;
			const localCommits = await execGitInRepo(repo, [
				'log', '--format=%H|%P|%s|%an|%ar|%D', '-n', String(limit), branch
			]);
			let pushedShas = new Set<string>();
			if (upstreamRef) {
				try {
					const remoteLog = await execGitInRepo(repo, [
						'log', '--format=%H', '-n', String(limit * 2), upstreamRef
					]);
					remoteLog.trim().split('\n').filter(Boolean).forEach(s => pushedShas.add(s.trim()));
				} catch { /* remote ref may not exist */ }
			}
			return localCommits.trim().split('\n').filter(Boolean).map(line => {
				const parts = line.split('|');
				const sha = parts[0]?.trim();
				const parents = parts[1] ? parts[1].trim().split(' ').filter(Boolean) : [];
				return {
					sha: sha.slice(0, 7), fullSha: sha, parents,
					subject: parts[2] || '', author: parts[3] || '',
					date: parts[4] || '', refs: parts[5] || '',
					isMerge: parents.length > 1,
					isPushed: pushedShas.has(sha),
					isHead: (parts[5] || '').includes(`HEAD -> ${branch}`)
				};
			});
		} catch { return []; }
	}
}
