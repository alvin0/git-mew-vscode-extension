// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { registerAllCommands } from './commands';
import { LLMService } from './services/llm';
import { GitService } from './services/utils/gitService';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is activated
export function activate(context: vscode.ExtensionContext) {
	// Initialize services
	const gitService = new GitService();
	const llmService = new LLMService(context);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Git Tool Generative AI extension is now active!');

	// Register all commands
	registerAllCommands(context, gitService, llmService);
}

// This method is called when your extension is deactivated
export function deactivate() {}
