// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerAllCommands } from './commands';
import { LLMService } from './services/llm';
import { GitService } from './services/utils/gitService';
import { createStatusBarItem } from './statusBar';
import { GitMewSidebarProvider } from './commands/sidebar';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is activated
export async function activate(context: vscode.ExtensionContext) {
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
	} catch (error) {
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
export function deactivate() {}
