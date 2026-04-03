// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerAllCommands } from './commands';
import { GitmewGlobalConfigProvider, registerManageGlobalConfigCommand } from './commands/manageGlobalConfigCommand';
import { LLMService } from './services/llm';
import { GitService } from './services/utils/gitService';
import { createStatusBarItem } from './statusBar';
import { GitMewSidebarProvider, GitMewGraphProvider, CodeReviewProvider, SettingsProvider } from './commands/sidebar';
import { initSentry, captureError, flushSentry } from './services/sentry';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is activated
export async function activate(context: vscode.ExtensionContext) {
	// Initialize Sentry error tracking
	const extensionVersion = vscode.extensions.getExtension('GitMew.git-mew')?.packageJSON?.version ?? 'unknown';
	initSentry(extensionVersion);

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
export function deactivate() {
	flushSentry();
}
