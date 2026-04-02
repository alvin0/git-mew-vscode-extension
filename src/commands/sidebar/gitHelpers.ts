import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';

/** Get the VS Code Git API (v1) */
export function getGitApi(): any | undefined {
	return vscode.extensions.getExtension('vscode.git')?.exports?.getAPI(1);
}

/** Normalize path separators to forward slash for display */
export function toDisplayPath(p: string): string {
	return p.replace(/\\/g, '/');
}

/** Find the git repository that owns the given file path */
export function getRepoForFile(filePath: string): any | undefined {
	try {
		const git = getGitApi();
		if (!git || git.repositories.length === 0) return undefined;
		const normalizedFile = filePath.replace(/\\/g, '/').toLowerCase();
		const sorted = [...git.repositories].sort(
			(a: any, b: any) => b.rootUri.fsPath.length - a.rootUri.fsPath.length
		);
		return sorted.find((r: any) => {
			const root = r.rootUri.fsPath.replace(/\\/g, '/').toLowerCase();
			const rootWithSlash = root.endsWith('/') ? root : root + '/';
			return normalizedFile.startsWith(rootWithSlash);
		}) ?? git.repositories[0];
	} catch {
		return undefined;
	}
}

/** Get the active repo (prefer the one matching the active editor, fallback to first) */
export function getActiveRepo(): any | undefined {
	try {
		const git = getGitApi();
		if (!git || git.repositories.length === 0) return undefined;
		const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
		if (activeFile) {
			const match = getRepoForFile(activeFile);
			if (match) return match;
		}
		return git.repositories[0];
	} catch {
		return undefined;
	}
}

/** Execute a git CLI command in a repository's working directory */
export function execGitInRepo(repo: any, args: string[]): Promise<string> {
	const cwd = repo.rootUri.fsPath;
	return new Promise((resolve, reject) => {
		execFile('git', args, { cwd, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
			if (err) reject(err); else resolve(stdout);
		});
	});
}

/** Build file change info from a git change object */
export function mapChangeToFileInfo(change: any, root: string) {
	return {
		filePath: change.uri.fsPath,
		fileName: path.basename(change.uri.fsPath),
		dirName: toDisplayPath(path.relative(root, path.dirname(change.uri.fsPath))),
		status: change.status,
		originalFilePath: change.originalUri?.fsPath
	};
}
