import * as vscode from 'vscode';
import { LLMService } from '../services/llm';

/**
 * Command to setup model (Provider -> API Key -> Model)
 */
export function registerSetupModelCommand(
	context: vscode.ExtensionContext,
	llmService: LLMService
): vscode.Disposable {
	return vscode.commands.registerCommand('git-mew.setupModelGenerateCommit', async () => {
		try {
			const configured = await llmService.configureAndSelectModel();
			if (configured) {
				vscode.window.showInformationMessage('✓ Model setup completed successfully!');
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Error setting up model: ${error}`);
			console.error('Error:', error);
		}
	});
}