import * as vscode from 'vscode';
import { LLMService } from '../services/llm';
import { GitService } from '../services/utils/gitService';
import { ModelProvider } from './reviewMerge/modelProvider';
import {
    generateWebviewContent,
    ReviewStagedChangesService,
    WebviewMessageHandler
} from './reviewStagedChanges';
import { loadReviewPreferences } from './reviewShared/preferences';
import { ReviewMemoryService } from '../services/llm/ReviewMemoryService';
import { trackEvent } from '../services/posthog';

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
            const hasStagedFiles = await gitService.hasStagedFiles();
            if (!hasStagedFiles) {
                vscode.window.showWarningMessage('No staged files found. Please stage some files before reviewing.');
                return;
            }
            trackEvent('review_staged_changes_started');

            const { currentProvider, currentModel, savedLanguage } = loadReviewPreferences(llmService);
            const { providers, availableModels, customModelSettings, customProviderConfig } = await ModelProvider.getAvailableModels(llmService);

            const panel = vscode.window.createWebviewPanel(
                'reviewStagedChanges',
                'Review Staged Changes',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            panel.webview.html = generateWebviewContent(
                providers,
                availableModels,
                currentProvider,
                currentModel,
                savedLanguage,
                customModelSettings,
                customProviderConfig
            );

            const reviewStagedChangesService = new ReviewStagedChangesService(gitService, llmService);
            reviewStagedChangesService.setReviewMemory(new ReviewMemoryService(context.workspaceState));
            const messageHandler = new WebviewMessageHandler(panel, reviewStagedChangesService);

            panel.webview.onDidReceiveMessage(
                async message => {
                    await messageHandler.handleMessage(message);
                },
                undefined,
                context.subscriptions
            );

        } catch (error) {
            vscode.window.showErrorMessage(`Error reviewing staged changes: ${error}`);
        }
    });
}
