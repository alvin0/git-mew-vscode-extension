import * as vscode from 'vscode';
import { LLMService } from '../services/llm';
import { GitService } from '../services/utils/gitService';
import { generateMergeWebviewContent } from './reviewMerge/webviewContentGenerator';
import { ModelProvider } from './reviewMerge/modelProvider';
import { ReviewMergeService } from './reviewMerge/reviewMergeService';
import { WebviewMessageHandler } from './reviewMerge/webviewMessageHandler';
import { loadReviewPreferences } from './reviewShared/preferences';
import { ReviewMemoryService } from '../services/llm/ReviewMemoryService';

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
            const branches = await gitService.getAllBranches();
            if (branches.length === 0) {
                vscode.window.showWarningMessage('No branches found in this repository. Make sure you have a Git repository with branches.');
                return;
            }

            const currentBranch = await gitService.getCurrentBranch();
            const { currentProvider, currentModel, savedLanguage } = loadReviewPreferences(llmService);
            const { providers, availableModels, customModelSettings, customProviderConfig } = await ModelProvider.getAvailableModels(llmService);

            const panel = vscode.window.createWebviewPanel(
                'reviewMerge',
                'Review Merge',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            panel.webview.html = generateMergeWebviewContent(
                branches,
                currentBranch,
                providers,
                availableModels,
                currentProvider,
                currentModel,
                savedLanguage,
                customModelSettings,
                customProviderConfig
            );

            const reviewMergeService = new ReviewMergeService(gitService, llmService);
            reviewMergeService.setReviewMemory(new ReviewMemoryService(context.workspaceState));
            const messageHandler = new WebviewMessageHandler(panel, reviewMergeService);

            panel.webview.onDidReceiveMessage(
                async message => {
                    await messageHandler.handleMessage(message);
                },
                undefined,
                context.subscriptions
            );

        } catch (error) {
            vscode.window.showErrorMessage(`Error reviewing merge: ${error}`);
        }
    });
}
