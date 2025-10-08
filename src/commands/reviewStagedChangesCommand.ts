import * as vscode from 'vscode';
import { LLMProvider } from '../constant/llm';
import { LLMService } from '../services/llm';
import { ReviewMergeConfigManager } from '../services/llm/ReviewMergeConfigManager';
import { GitService } from '../services/utils/gitService';
import { ModelProvider } from './reviewMerge/modelProvider';
import {
    generateWebviewContent,
    ReviewStagedChangesService,
    WebviewMessageHandler
} from './reviewStagedChanges';

/**
 * Register the review staged changes command
 */
export function registerReviewStagedChangesCommand(
    context: vscode.ExtensionContext,
    gitService: GitService,
    llmService: LLMService
): vscode.Disposable {
    return vscode.commands.registerCommand('git-mew.review-staged-changes', async () => {
        try {
            // Check if there are staged files
            const hasStagedFiles = await gitService.hasStagedFiles();
            if (!hasStagedFiles) {
                vscode.window.showWarningMessage('No staged files found. Please stage some files before reviewing.');
                return;
            }

            // Get saved Review Merge configuration (reuse the same config as review merge)
            const savedProvider = ReviewMergeConfigManager.getProvider();
            const savedModel = ReviewMergeConfigManager.getModel();
            const savedLanguage = ReviewMergeConfigManager.getLanguage();
            
            // Fallback to main LLM config if no Review Merge config exists
            const currentProvider = savedProvider || llmService.getProvider();
            const currentModel = savedModel || (currentProvider ? llmService.getModel(currentProvider) : undefined);

            // Get available providers and models
            const providers: LLMProvider[] = ['openai', 'claude', 'gemini', 'ollama'];
            const availableModels = await ModelProvider.getAvailableModels();

            // Create and show webview panel
            const panel = vscode.window.createWebviewPanel(
                'reviewStagedChanges',
                'Review Staged Changes',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            // Set webview HTML content
            panel.webview.html = generateWebviewContent(
                providers,
                availableModels,
                currentProvider,
                currentModel,
                savedLanguage
            );

            // Create services
            const reviewStagedChangesService = new ReviewStagedChangesService(gitService, llmService);
            const messageHandler = new WebviewMessageHandler(panel, reviewStagedChangesService);

            // Handle messages from webview
            panel.webview.onDidReceiveMessage(
                async message => {
                    await messageHandler.handleMessage(message);
                },
                undefined,
                context.subscriptions
            );

        } catch (error) {
            vscode.window.showErrorMessage(`Error reviewing staged changes: ${error}`);
            console.error('Error:', error);
        }
    });
}