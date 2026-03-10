import * as vscode from 'vscode';
import { LLMService } from '../services/llm';
import { GitService } from '../services/utils/gitService';

// Global abort controller for commit generation
let currentAbortController: AbortController | null = null;

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
		
		currentAbortController?.abort();
		currentAbortController = new AbortController();
		const { signal } = currentAbortController;
		try {
			// Check if cancelled before starting
			if (signal.aborted) {
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
			const hasModel = provider ? llmService.getModel(provider) : false;
			
			// For Ollama, API key is not required
			let hasApiKey = false;
			if (provider) {
				if (provider === 'ollama') {
					hasApiKey = true; // Ollama doesn't need API key
				} else {
					hasApiKey = !!(await llmService.getApiKey(provider));
				}
			}
	
			// If not configured, run setup
			if (!provider || !hasApiKey || !hasModel) {
				vscode.window.showInformationMessage('Model not configured. Starting setup...');
				const configured = await llmService.configureAndSelectModel();
				if (!configured) {
					return;
				}
			}

			const stagedChanges = await gitService.getStagedDiffFiles();
			const formattedChanges = gitService.renderStagedDiffFiles(stagedChanges);
			
			// Get current branch
			const currentBranch = await gitService.getCurrentBranch() || 'unknown';
			
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
				if (signal.aborted) {
					return null;
				}
				return await llmService.generateCommitMessage(
					stagedChanges,
					formattedChanges,
					currentBranch,
					signal
				);
			});

			// Check if cancelled after generation
			if (signal.aborted || !commitMessage) {
				setGeneratingState(false);
				if (signal.aborted) {
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
			if (currentAbortController === null || currentAbortController.signal === signal) {
				currentAbortController = null;
			}
		}
	});
}

/**
	* Cancel command: Cancel the current commit message generation
	*/
export function registerCancelGenerateCommand(): vscode.Disposable {
	return vscode.commands.registerCommand('git-mew.cancel-generate', async () => {
		if (currentAbortController) {
			currentAbortController.abort();
			currentAbortController = null;
			setGeneratingState(false);
			vscode.window.showInformationMessage('Commit message generation cancelled');
		}
	});
}
