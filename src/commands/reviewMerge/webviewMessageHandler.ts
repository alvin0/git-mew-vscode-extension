import * as vscode from 'vscode';
import { LLMProvider } from '../../llm-adapter';
import { ReviewMergeService } from './reviewMergeService';

export interface ReviewMergeMessage {
    command: 'reviewMerge' | 'viewRawDiff' | 'cancel';
    baseBranch?: string;
    compareBranch?: string;
    provider?: LLMProvider;
    model?: string;
    language?: string;
    diff?: string;
}

/**
 * Handles messages from the Review Merge webview
 */
export class WebviewMessageHandler {
    constructor(
        private panel: vscode.WebviewPanel,
        private reviewMergeService: ReviewMergeService
    ) {}

    /**
     * Handle incoming messages from the webview
     */
    async handleMessage(message: ReviewMergeMessage): Promise<void> {
        switch (message.command) {
            case 'reviewMerge':
                await this.handleReviewMerge(message);
                break;
            
            case 'viewRawDiff':
                await this.handleViewRawDiff(message);
                break;

            case 'cancel':
                this.reviewMergeService.cancel();
                break;
        }
    }

    /**
     * Handle the review merge request
     */
    private async handleReviewMerge(message: ReviewMergeMessage): Promise<void> {
        const { baseBranch, compareBranch, provider, model, language } = message;

        // Validate required fields
        if (!baseBranch || !compareBranch || !provider || !model || !language) {
            vscode.window.showWarningMessage('Please select all fields.');
            return;
        }

        // Validate branches are different
        if (baseBranch === compareBranch) {
            vscode.window.showWarningMessage('Base and compare branches must be different.');
            return;
        }

        try {
            // Generate the review
            const result = await this.reviewMergeService.generateReview(
                baseBranch,
                compareBranch,
                provider,
                model,
                language
            );

            if (result.success && result.review && result.diff) {
                // Send success result to webview
                this.panel.webview.postMessage({
                    command: 'showResult',
                    review: result.review,
                    rawDiff: result.diff
                });
            } else {
                // Send error to webview
                this.panel.webview.postMessage({
                    command: 'showError',
                    message: result.error || 'Unknown error occurred'
                });
            }
        } catch (error) {
            const errorMessage = `Failed to generate review: ${error}`;
            vscode.window.showErrorMessage(errorMessage);
            console.error('Review generation error:', error);
            
            this.panel.webview.postMessage({
                command: 'showError',
                message: errorMessage
            });
        }
    }

    /**
     * Handle viewing the raw diff
     */
    private async handleViewRawDiff(message: ReviewMergeMessage): Promise<void> {
        const diffContent = message.diff;
        
        if (!diffContent) {
            vscode.window.showWarningMessage('No diff content available.');
            return;
        }

        try {
            const doc = await vscode.workspace.openTextDocument({
                content: diffContent,
                language: 'diff'
            });
            await vscode.window.showTextDocument(doc, { preview: false });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open diff: ${error}`);
            console.error('Error opening diff:', error);
        }
    }
}