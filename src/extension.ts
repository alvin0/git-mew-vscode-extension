// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerAllCommands } from './commands';
import { GitmewGlobalConfigProvider, registerManageGlobalConfigCommand } from './commands/manageGlobalConfigCommand';
import { LLMService } from './services/llm';
import { GitService } from './services/utils/gitService';
import { createStatusBarItem } from './statusBar';
import { GitMewSidebarProvider, GitMewGraphProvider, CodeReviewProvider, SettingsProvider, HistoriesProvider } from './commands/sidebar';
import { initSentry, captureError, flushSentry } from './services/sentry';
import { initPostHog, trackEvent, shutdownPostHog } from './services/posthog';
import { ReviewMemoryService } from './services/llm/ReviewMemoryService';
import { onHistorySaved } from './commands/reviewShared/panelMessaging';
import { deleteHistoryFile } from './services/historyService';
import { getWebviewContent } from './commands/markdownViewer/webviewContentGenerator';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is activated
export async function activate(context: vscode.ExtensionContext) {
	// Initialize Sentry error tracking
	const extensionVersion = vscode.extensions.getExtension('GitMew.git-mew')?.packageJSON?.version ?? 'unknown';
	initSentry(extensionVersion);
	initPostHog(extensionVersion);
	trackEvent('extension_activated');

	try {
		// Wait for Git extension to be available
		const gitExtension = vscode.extensions.getExtension('vscode.git');
		if (gitExtension && !gitExtension.isActive) {
			await gitExtension.activate();
		}

		// Initialize services
		const gitService = new GitService();
		const llmService = new LLMService(context);

		// Use the console to output diagnostic information (console.log) and errors (console.error)
		// This line of code will only be executed once when your extension is activated
		console.log('Git Mew is now active!');

		// Register all commands
		registerAllCommands(context, gitService, llmService);
		const reviewMemoryService = new ReviewMemoryService(context.workspaceState);
		context.subscriptions.push(
			vscode.commands.registerCommand('gitmew.clearReviewMemory', async () => {
				await reviewMemoryService.clear();
				vscode.window.showInformationMessage('Git Mew: Review memory cleared.');
			})
		);

		// Create status bar item
		createStatusBarItem(context);

		// Register sidebar provider
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const sidebarProvider = new GitMewSidebarProvider(context, gitService, llmService);
		context.subscriptions.push(
			(vscode.window.registerWebviewViewProvider as any)(
				GitMewSidebarProvider.viewType,
				sidebarProvider,
				{ webviewOptions: { retainContextWhenHidden: true } }
			) as vscode.Disposable
		);

		// Register graph webview provider
		const graphProvider = new GitMewGraphProvider(context, sidebarProvider.ops);
		sidebarProvider.setGraphProvider(graphProvider);
		context.subscriptions.push(
			(vscode.window.registerWebviewViewProvider as any)(
				GitMewGraphProvider.viewType,
				graphProvider,
				{ webviewOptions: { retainContextWhenHidden: true } }
			) as vscode.Disposable
		);

		// Register code review tree view
		const codeReviewProvider = new CodeReviewProvider();
		context.subscriptions.push(
			vscode.window.createTreeView('gitmew-code-review', {
				treeDataProvider: codeReviewProvider,
			})
		);

		// Register settings tree view
		const settingsProvider = new SettingsProvider();
		context.subscriptions.push(
			vscode.window.createTreeView('gitmew-settings', {
				treeDataProvider: settingsProvider,
			})
		);

		// Register global config tree view
		const globalConfigProvider = new GitmewGlobalConfigProvider();
		const globalConfigTree = vscode.window.createTreeView('gitmew-global-config', {
			treeDataProvider: globalConfigProvider,
			showCollapseAll: true,
		});
		context.subscriptions.push(globalConfigTree);
		context.subscriptions.push(...registerManageGlobalConfigCommand(globalConfigProvider));

		// Register histories tree view
		const historiesProvider = new HistoriesProvider();
		const historiesTree = vscode.window.createTreeView('gitmew-histories', {
			treeDataProvider: historiesProvider,
			showCollapseAll: true,
		});
		context.subscriptions.push(historiesTree);

		// Auto-refresh histories when a review is saved
		onHistorySaved(() => historiesProvider.refresh());

		// History commands
		context.subscriptions.push(
			vscode.commands.registerCommand('git-mew.history.preview', async (uri: vscode.Uri) => {
				const panel = vscode.window.createWebviewPanel(
					'gitmewHistoryViewer',
					`Review: ${uri.path.split('/').pop()?.replace(/\.md$/, '') ?? 'History'}`,
					vscode.ViewColumn.One,
					{ enableScripts: true, retainContextWhenHidden: true }
				);
				try {
					const content = await vscode.workspace.fs.readFile(uri);
					panel.webview.html = getWebviewContent(content.toString());
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to open history file: ${error}`);
				}
			}),
			vscode.commands.registerCommand('git-mew.history.delete', async (item: { filePath?: string }) => {
				if (!item?.filePath) { return; }
				const confirm = await vscode.window.showWarningMessage(
					`Delete history file: ${item.filePath.split('/').pop()}?`,
					{ modal: true },
					'Delete'
				);
				if (confirm === 'Delete') {
					try {
						await deleteHistoryFile(item.filePath);
						historiesProvider.refresh();
					} catch (err: unknown) {
						vscode.window.showErrorMessage(`Failed to delete: ${err}`);
					}
				}
			}),
			vscode.commands.registerCommand('git-mew.history.refresh', () => {
				historiesProvider.refresh();
			}),
			vscode.commands.registerCommand('git-mew.history.open-in-editor', async (item: { filePath?: string }) => {
				if (!item?.filePath) { return; }
				const doc = await vscode.workspace.openTextDocument(item.filePath);
				await vscode.window.showTextDocument(doc);
			})
		);
	} catch (error) {
		captureError(error, { phase: 'activation' }, 'crash');
		console.error('Failed to activate Git Mew:', error);
		vscode.window.showErrorMessage('Failed to activate Git Mew extension. Please check the console for details.');
		return;
	}

	// Check for updates and prompt for reload
	const previousVersion = context.globalState.get<string>('extensionVersion');
	const currentVersion = vscode.extensions.getExtension('GitMew.git-mew')?.packageJSON?.version;

	if (!currentVersion) {
		console.warn('Git Mew extension metadata is unavailable; skipping version change prompt.');
	} else if (previousVersion && previousVersion !== currentVersion) {
		vscode.window.showInformationMessage(
			'Git Mew has been updated. Please reload the window for the changes to take effect.',
			'Reload'
		).then(selection => {
			if (selection === 'Reload') {
				vscode.commands.executeCommand('workbench.action.reloadWindow');
			}
		});
	}

	context.globalState.update('extensionVersion', currentVersion);
}

// This method is called when your extension is deactivated
export async function deactivate() {
	await flushSentry();
	await shutdownPostHog();
}
