import * as vscode from 'vscode';
import { LLMProvider } from '../constant/llm';
import { LLMService } from '../services/llm';
import { ReviewMergeConfigManager } from '../services/llm/ReviewMergeConfigManager';
import { GitService } from '../services/utils/gitService';
import {
    generateWebviewContent,
    ModelProvider,
    ReviewMergeService,
    WebviewMessageHandler
} from './reviewMerge';

/**
 * Register the review merge command
 */
export function registerReviewMergeCommand(
    context: vscode.ExtensionContext,
    gitService: GitService,
    llmService: LLMService
): vscode.Disposable {
    return vscode.commands.registerCommand('git-mew.review-merge', async () => {
        try {
            // Get all branches
            console.log('Starting to get branches...');
            const branches = await gitService.getAllBranches();
            console.log('Branches retrieved:', branches);
            
            if (branches.length === 0) {
                vscode.window.showWarningMessage('No branches found in this repository. Make sure you have a Git repository with branches.');
                return;
            }
            
            // Get current branch for default selection
            const currentBranch = await gitService.getCurrentBranch();

            // Get saved Review Merge configuration (separate from main LLM config)
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
                'reviewMerge',
                'Review Merge',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            // Set webview HTML content
            panel.webview.html = generateWebviewContent(
                branches,
                currentBranch,
                providers,
                availableModels,
                currentProvider,
                currentModel,
                savedLanguage
            );

            // Create services
            const reviewMergeService = new ReviewMergeService(gitService, llmService);
            const messageHandler = new WebviewMessageHandler(panel, reviewMergeService);

            // Handle messages from webview
            panel.webview.onDidReceiveMessage(
                async message => {
                    await messageHandler.handleMessage(message);
                },
                undefined,
                context.subscriptions
            );

        } catch (error) {
            vscode.window.showErrorMessage(`Error reviewing merge: ${error}`);
            console.error('Error:', error);
        }
    });
}