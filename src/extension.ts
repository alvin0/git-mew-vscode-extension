// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GitService } from './services/gitService';
import { LLMConfigService } from './services/llmConfigService';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is activated
export function activate(context: vscode.ExtensionContext) {
	// Initialize services
	const gitService = new GitService();
	const llmConfigService = new LLMConfigService(context);

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Git Tool Generative AI extension is now active!');

	// Command to setup model (Provider -> API Key -> Model)
	const setupModelCommand = vscode.commands.registerCommand('git-mew.setupModel', async () => {
		try {
			const configured = await llmConfigService.configureAndSelectModel();
			if (configured) {
				vscode.window.showInformationMessage('✓ Model setup completed successfully!');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Error setting up model: ${error}`);
			console.error('Error:', error);
		}
	});

	// Main command: Generate commit message (auto-setup if needed)
	const generateCommand = vscode.commands.registerCommand('git-mew.generate-commit', async () => {
		try {
			// Check if there are staged files
			const hasStagedFiles = await gitService.hasStagedFiles();
			
			if (!hasStagedFiles) {
				vscode.window.showWarningMessage('No staged files found. Please stage your changes first.');
				return;
			}

			// Check if model is configured
			const provider = llmConfigService.getProvider();
			const hasApiKey = provider ? await llmConfigService.getApiKey(provider) : false;
			const hasModel = provider ? llmConfigService.getModel(provider) : false;

			// If not configured, run setup
			if (!provider || !hasApiKey || !hasModel) {
				vscode.window.showInformationMessage('Model not configured. Starting setup...');
				const configured = await llmConfigService.configureAndSelectModel();
				if (!configured) {
					return;
				}
			}

			// Get formatted staged changes
			const formattedChanges = await gitService.getFormattedStagedChanges();
			
			// Get current provider and model for display
			const currentProvider = llmConfigService.getProvider();
			const currentModel = currentProvider ? llmConfigService.getModel(currentProvider) : undefined;
			const modelInfo = currentProvider && currentModel
				? `${currentProvider.toUpperCase()} - ${currentModel}`
				: 'AI';
			
			// Show progress while generating
			const commitMessage = await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Generating commit message using ${modelInfo}...`,
				cancellable: false
			}, async () => {
				return await llmConfigService.generateCommitMessage(formattedChanges);
			});

			if (!commitMessage) {
				vscode.window.showWarningMessage('Failed to generate commit message. Please check your LLM configuration.');
				return;
			}

			// Insert commit message into Git SCM input box
			await gitService.setCommitMessage(commitMessage);
			
			// Show success message
			vscode.window.showInformationMessage('✓ Commit message generated and inserted into Git SCM!');
			
		} catch (error) {
			vscode.window.showErrorMessage(`Error generating commit message: ${error}`);
			console.error('Error:', error);
		}
	});

	context.subscriptions.push(
		generateCommand,
		setupModelCommand
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
