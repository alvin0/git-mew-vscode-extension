import * as vscode from 'vscode';
import { LLMService } from '../services/llm';
import { GitService } from '../services/utils/gitService';
import { generateMergedBranchWebviewContent } from './reviewMergedBranch/webviewContentGenerator';
import { ModelProvider } from './reviewMerge/modelProvider';
import { ReviewMergedBranchService } from './reviewMergedBranch/reviewMergedBranchService';
import { WebviewMessageHandler } from './reviewMergedBranch/webviewMessageHandler';
import { loadReviewPreferences } from './reviewShared/preferences';

/**
 * Register the review merged branch command
 */
export function registerReviewMergedBranchCommand(
    context: vscode.ExtensionContext,
    gitService: GitService,
    llmService: LLMService
): vscode.Disposable {
    return vscode.commands.registerCommand('git-mew.review-merged-branch', async () => {
        try {
            const currentBranch = await gitService.getCurrentBranch();
            if (!currentBranch) {
                vscode.window.showWarningMessage('Could not determine current branch.');
                return;
            }

            const mergedBranchLimit = 20;
            const mergedBranches = await gitService.getMergedBranches(currentBranch, mergedBranchLimit);
            if (mergedBranches.length === 0) {
                vscode.window.showWarningMessage('Không tìm thấy nhánh đã merge nào trong repository.');
                return;
            }

            const { currentProvider, currentModel, savedLanguage } = loadReviewPreferences(llmService);
            const { providers, availableModels, customModelSettings, customProviderConfig } = await ModelProvider.getAvailableModels(llmService);

            const panel = vscode.window.createWebviewPanel(
                'reviewMergedBranch',
                'Review Merged Branch',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            panel.webview.html = generateMergedBranchWebviewContent(
                mergedBranches,
                providers,
                availableModels,
                currentProvider,
                currentModel,
                savedLanguage,
                customModelSettings,
                customProviderConfig,
                mergedBranchLimit
            );

            const service = new ReviewMergedBranchService(gitService, llmService);
            const messageHandler = new WebviewMessageHandler(panel, service, currentBranch, mergedBranchLimit);

            panel.webview.onDidReceiveMessage(
                async message => {
                    await messageHandler.handleMessage(message);
                },
                undefined,
                context.subscriptions
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Error reviewing merged branch: ${error}`);
        }
    });
}
