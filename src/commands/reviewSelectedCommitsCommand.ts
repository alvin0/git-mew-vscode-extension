import * as vscode from 'vscode';
import { LLMService } from '../services/llm';
import { GitService } from '../services/utils/gitService';
import { ModelProvider } from './reviewMerge/modelProvider';
import {
    generateSelectedCommitsWebviewContent,
    ReviewSelectedCommitsService,
    SelectedCommitInfo,
    WebviewMessageHandler
} from './reviewSelectedCommits';
import { loadReviewPreferences } from './reviewShared/preferences';
import { trackEvent } from '../services/posthog';

/**
 * Register the review selected commits command.
 * Triggered from the graph view when commits are selected.
 */
export function registerReviewSelectedCommitsCommand(
    context: vscode.ExtensionContext,
    gitService: GitService,
    llmService: LLMService
): vscode.Disposable {
    return vscode.commands.registerCommand('git-mew.review-selected-commits', async (commits: SelectedCommitInfo[]) => {
        try {
            if (!commits || commits.length === 0) {
                vscode.window.showWarningMessage('No commits selected. Please select commits from the graph first.');
                return;
            }
            trackEvent('review_selected_commits_started', { commit_count: commits.length });

            const { currentProvider, currentModel, savedLanguage } = loadReviewPreferences(llmService);
            const { providers, availableModels, customModelSettings, customProviderConfig } = await ModelProvider.getAvailableModels(llmService);

            const panel = vscode.window.createWebviewPanel(
                'reviewSelectedCommits',
                `Review ${commits.length} Commit${commits.length > 1 ? 's' : ''}`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            panel.webview.html = generateSelectedCommitsWebviewContent(
                commits,
                providers,
                availableModels,
                currentProvider,
                currentModel,
                savedLanguage,
                customModelSettings,
                customProviderConfig
            );

            const service = new ReviewSelectedCommitsService(gitService, llmService);
            const messageHandler = new WebviewMessageHandler(panel, service);

            panel.webview.onDidReceiveMessage(
                async message => {
                    await messageHandler.handleMessage(message);
                },
                undefined,
                context.subscriptions
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Error reviewing selected commits: ${error}`);
        }
    });
}
