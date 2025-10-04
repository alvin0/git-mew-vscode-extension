import * as vscode from 'vscode';
import { LLMService } from '../services/llm';
import { GitService } from '../services/utils/gitService';

// Global cancellation token source
let currentCancellationTokenSource: vscode.CancellationTokenSource | null = null;

/**
 * Set the generating state context
 */
function setGeneratingState(isGenerating: boolean) {
	vscode.commands.executeCommand('setContext', 'git-mew.isGenerating', isGenerating);
}

/**
 * Main command: Generate commit message (auto-setup if needed)
 */
export function registerGenerateCommitCommand(
	context: vscode.ExtensionContext,
	gitService: GitService,
	llmService: LLMService
): vscode.Disposable {
	return vscode.commands.registerCommand('git-mew.generate-commit', async () => {
		// Set generating state to true
		setGeneratingState(true);
		
		// Create new cancellation token source
		currentCancellationTokenSource = new vscode.CancellationTokenSource();
		const token = currentCancellationTokenSource.token;
		try {
			// Check if cancelled before starting
			if (token.isCancellationRequested) {
				setGeneratingState(false);
				return;
			}
			// Check if there are staged files
			let hasStagedFiles = await gitService.hasStagedFiles();
			
			if (!hasStagedFiles) {
				// No staged files, try to stage all changes automatically
				try {
					await gitService.stageAllChanges();
					hasStagedFiles = await gitService.hasStagedFiles();
					
					if (!hasStagedFiles) {
						vscode.window.showWarningMessage('No changes found to stage. Please make some changes first.');
						return;
					}
					
					vscode.window.showInformationMessage('All changes have been staged automatically.');
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to stage changes: ${error}`);
					return;
				}
			}

			// Check if model is configured
			const provider = llmService.getProvider();
			const hasApiKey = provider ? await llmService.getApiKey(provider) : false;
			const hasModel = provider ? llmService.getModel(provider) : false;

			// If not configured, run setup
			if (!provider || !hasApiKey || !hasModel) {
				vscode.window.showInformationMessage('Model not configured. Starting setup...');
				const configured = await llmService.configureAndSelectModel();
				if (!configured) {
					return;
				}
			}

			// Get formatted staged changes
			const formattedChanges = await gitService.getFormattedStagedChanges();
			
			// Get current provider and model for display
			const currentProvider = llmService.getProvider();
			const currentModel = currentProvider ? llmService.getModel(currentProvider) : undefined;
			const modelInfo = currentProvider && currentModel
				? `${currentProvider.toUpperCase()} - ${currentModel}`
				: 'AI';
			
			// Show progress while generating
			const commitMessage = await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `Generating commit message using ${modelInfo}...`,
				cancellable: false
			}, async () => {
				// Check for cancellation during generation
				if (token.isCancellationRequested) {
					return null;
				}
				return await llmService.generateCommitMessage(formattedChanges);
			});

			// Check if cancelled after generation
			if (token.isCancellationRequested || !commitMessage) {
				setGeneratingState(false);
				if (token.isCancellationRequested) {
					vscode.window.showInformationMessage('Commit message generation cancelled');
				}
				return;
			}


			// Insert commit message into Git SCM input box
			await gitService.setCommitMessage(commitMessage);
			
			// Show success message
			vscode.window.showInformationMessage('✓ Commit message generated and inserted into Git SCM!');
			
		} catch (error) {
			vscode.window.showErrorMessage(`Error generating commit message: ${error}`);
			console.error('Error:', error);
		} finally {
			// Always reset generating state
			setGeneratingState(false);
			currentCancellationTokenSource?.dispose();
			currentCancellationTokenSource = null;
		}
	});
}

/**
	* Cancel command: Cancel the current commit message generation
	*/
export function registerCancelGenerateCommand(): vscode.Disposable {
	return vscode.commands.registerCommand('git-mew.cancel-generate', async () => {
		if (currentCancellationTokenSource) {
			currentCancellationTokenSource.cancel();
			currentCancellationTokenSource.dispose();
			currentCancellationTokenSource = null;
			setGeneratingState(false);
			vscode.window.showInformationMessage('Commit message generation cancelled');
		}
	});
}