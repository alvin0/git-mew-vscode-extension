// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerAllCommands } from './commands';
import { LLMService } from './services/llm';
import { GitService } from './services/utils/gitService';
import { createStatusBarItem } from './statusBar';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is activated
export function activate(context: vscode.ExtensionContext) {
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

	// Check for updates and prompt for reload
	const previousVersion = context.globalState.get<string>('extensionVersion');
	const currentVersion = vscode.extensions.getExtension('GitMew.git-mew')!.packageJSON.version;

	if (previousVersion && previousVersion !== currentVersion) {
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
