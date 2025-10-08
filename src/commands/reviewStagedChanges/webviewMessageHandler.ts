import * as vscode from 'vscode';
import { LLMProvider } from '../../llm-adapter';
import { ReviewStagedChangesService } from './reviewStagedChangesService';

export interface ReviewStagedChangesMessage {
    command: 'reviewStagedChanges' | 'viewRawDiff' | 'cancel';
    provider?: LLMProvider;
    model?: string;
    taskInfo?: string;
    language?: string;
    diff?: string;
}

/**
 * Handles messages from the Review Staged Changes webview
 */
export class WebviewMessageHandler {
    constructor(
        private panel: vscode.WebviewPanel,
        private reviewStagedChangesService: ReviewStagedChangesService
    ) {}

    /**
     * Handle incoming messages from the webview
     */
    async handleMessage(message: ReviewStagedChangesMessage): Promise<void> {
        switch (message.command) {
            case 'reviewStagedChanges':
                await this.handleReviewStagedChanges(message);
                break;
            
            case 'viewRawDiff':
                await this.handleViewRawDiff(message);
                break;

            case 'cancel':
                this.reviewStagedChangesService.cancel();
                break;
        }
    }

    /**
     * Handle the review staged changes request
     */
    private async handleReviewStagedChanges(message: ReviewStagedChangesMessage): Promise<void> {
        const { provider, model, taskInfo, language } = message;

        // Validate required fields
        if (!provider || !model || !language) {
            vscode.window.showWarningMessage('Please select all fields.');
            return;
        }

        try {
            // Generate the review
            const result = await this.reviewStagedChangesService.generateReview(
                provider,
                model,
                language,
                taskInfo
            );

            if (!result.success || !result.review || !result.diff) {
                // Send error to webview
                this.panel.webview.postMessage({
                    command: 'showError',
                    message: result.error || 'Unknown error occurred'
                });
                return;
            }

            // Send success result to webview
            this.panel.webview.postMessage({
                command: 'showResult',
                review: result.review,
                rawDiff: result.diff
            });
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
    private async handleViewRawDiff(message: ReviewStagedChangesMessage): Promise<void> {
        const diffContent = message.diff;
        
        if (!diffContent) {
            vscode.window.showWarningMessage('No diff content available.');
            return;
        }

        try {
            const doc = await vscode.workspace.openTextDocument({
                content: diffContent,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, { preview: false });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open diff: ${error}`);
            console.error('Error opening diff:', error);
        }
    }
}