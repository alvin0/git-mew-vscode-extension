import * as vscode from 'vscode';
import { LLMProvider } from '../../llm-adapter';
import { ContextStrategy } from '../../services/llm';
import { createReviewErrorPayload } from '../reviewShared/errorReport';
import { openDiffDocument, postError, postLog, postLlmLog, postPlantUmlRepairResult, postProgress, postResult } from '../reviewShared/panelMessaging';
import { ReviewStagedChangesService } from './reviewStagedChangesService';
import { validateStagedReviewInput } from './validation';

export interface ReviewStagedChangesMessage {
    command: 'reviewStagedChanges' | 'viewRawDiff' | 'cancel' | 'repairPlantUml';
    provider?: LLMProvider;
    model?: string;
    apiKey?: string;
    baseURL?: string;
    taskInfo?: string;
    language?: string;
    contextStrategy?: ContextStrategy;
    contextWindow?: number;
    maxOutputTokens?: number;
    diff?: string;
    content?: string;
    errorMessage?: string;
    target?: 'review' | 'description';
    attempt?: number;
}

export class WebviewMessageHandler {
    constructor(
        private panel: vscode.WebviewPanel,
        private reviewStagedChangesService: ReviewStagedChangesService
    ) {}

    async handleMessage(message: ReviewStagedChangesMessage): Promise<void> {
        switch (message.command) {
            case 'reviewStagedChanges':
                await this.generateStagedChangesReview(message);
                break;
            case 'viewRawDiff':
                await openDiffDocument(message.diff);
                break;
            case 'cancel':
                this.reviewStagedChangesService.cancel();
                break;
            case 'repairPlantUml':
                await this.repairPlantUmlContent(message);
                break;
        }
    }

    private async generateStagedChangesReview(message: ReviewStagedChangesMessage): Promise<void> {
        const validationError = validateStagedReviewInput(message);
        if (validationError) {
            postError(this.panel, createReviewErrorPayload(validationError, {
                operation: 'review staged changes',
                provider: message.provider,
                model: message.model,
                command: message.command,
                hint: 'Verify the required fields in the review panel and try again.'
            }, {
                title: 'Invalid review request'
            }));
            return;
        }
        const { taskInfo, contextWindow, maxOutputTokens, apiKey, baseURL } = message;
        const provider = message.provider!;
        const model = message.model!;
        const language = message.language!;
        const contextStrategy = message.contextStrategy!;

        try {
            const result = await this.reviewStagedChangesService.generateReview(
                provider,
                model,
                language,
                contextStrategy,
                taskInfo,
                apiKey,
                baseURL,
                contextWindow,
                maxOutputTokens,
                (progressMessage) => postProgress(this.panel, progressMessage),
                (logMessage) => postLog(this.panel, logMessage),
                (entry) => postLlmLog(this.panel, entry)
            );

            if (!result.success && result.error === 'Review generation cancelled.') {
                return;
            }

            if (!result.success || !result.review || !result.diff) {
                postError(this.panel, createReviewErrorPayload(result.error || 'Unknown error occurred', {
                    operation: 'review staged changes',
                    provider,
                    model,
                    command: message.command,
                    hint: 'Copy this report and include the staged diff scenario when reporting the bug.'
                }, {
                    title: 'Staged review failed'
                }));
                return;
            }

            postResult(this.panel, {
                review: result.review,
                rawDiff: result.diff
            }, 'staged-changes', model);
        } catch (error) {
            const errorMessage = `Failed to generate review: ${error}`;
            vscode.window.showErrorMessage(errorMessage);
            console.error('Review generation error:', error);
            postError(this.panel, createReviewErrorPayload(error, {
                operation: 'review staged changes',
                provider,
                model,
                command: message.command,
                hint: 'Copy this report and include the staged diff scenario when reporting the bug.'
            }, {
                title: 'Staged review crashed',
                summary: errorMessage
            }));
        }
    }

    private async repairPlantUmlContent(message: ReviewStagedChangesMessage): Promise<void> {
        const validationError = validateStagedReviewInput(message);
        if (validationError || !message.content || !message.errorMessage || !message.target) {
            postError(this.panel, createReviewErrorPayload(validationError || 'Missing PlantUML repair payload.', {
                operation: 'repair PlantUML',
                provider: message.provider,
                model: message.model,
                command: message.command,
                target: message.target,
                hint: 'Retry generation first. If the issue persists, send this report to the maintainer.'
            }, {
                title: 'Invalid PlantUML repair request'
            }));
            return;
        }

        const repairResult = await this.reviewStagedChangesService.repairPlantUml(
            message.provider!,
            message.model!,
            message.language!,
            message.contextStrategy!,
            message.content,
            message.errorMessage,
            undefined,
            message.apiKey,
            message.baseURL,
            message.contextWindow,
            message.maxOutputTokens,
            (progressMessage: string) => postProgress(this.panel, progressMessage),
            (logMessage: string) => postLog(this.panel, logMessage)
        );

        if (!repairResult.success || !repairResult.content) {
            postError(this.panel, createReviewErrorPayload(repairResult.error || 'Failed to repair PlantUML content.', {
                operation: 'repair PlantUML',
                provider: message.provider,
                model: message.model,
                command: message.command,
                target: message.target,
                hint: 'Include the generated review and this repair report when filing the issue.'
            }, {
                title: 'PlantUML repair failed'
            }));
            return;
        }

        postPlantUmlRepairResult(this.panel, message.target, repairResult.content, message.attempt || 1);
    }
}
