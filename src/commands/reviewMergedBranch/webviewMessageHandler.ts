import * as vscode from 'vscode';
import { LLMProvider } from '../../llm-adapter';
import { ContextStrategy } from '../../services/llm';
import { createReviewErrorPayload } from '../reviewShared/errorReport';
import { openDiffDocument, postError, postLog, postLlmLog, postPlantUmlRepairResult, postProgress, postResult } from '../reviewShared/panelMessaging';
import { ReviewMergedBranchService } from './reviewMergedBranchService';
import { validateMergedBranchReviewInput } from './validation';

export interface ReviewMergedBranchMessage {
    command: 'reviewMergedBranch' | 'viewRawDiff' | 'cancel' | 'repairPlantUml';
    mergeCommitSha?: string;
    branchName?: string;
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
    target?: 'review';
    attempt?: number;
}

export class WebviewMessageHandler {
    constructor(
        private panel: vscode.WebviewPanel,
        private service: ReviewMergedBranchService
    ) {}

    async handleMessage(message: ReviewMergedBranchMessage): Promise<void> {
        switch (message.command) {
            case 'reviewMergedBranch':
                await this.generateMergedBranchReview(message);
                break;
            case 'viewRawDiff':
                await openDiffDocument(message.diff);
                break;
            case 'cancel':
                this.service.cancel();
                break;
            case 'repairPlantUml':
                await this.repairPlantUmlContent(message);
                break;
        }
    }

    private async generateMergedBranchReview(message: ReviewMergedBranchMessage): Promise<void> {
        const validationError = validateMergedBranchReviewInput(message);
        if (validationError) {
            postError(this.panel, createReviewErrorPayload(validationError, {
                operation: 'review merged branch',
                provider: message.provider,
                model: message.model,
                command: message.command,
                hint: 'Verify the merge commit selection and required fields in the review panel.'
            }, {
                title: 'Invalid review request'
            }));
            return;
        }

        const { taskInfo, contextWindow, maxOutputTokens, apiKey, baseURL } = message;
        const mergeCommitSha = message.mergeCommitSha!;
        const provider = message.provider!;
        const model = message.model!;
        const language = message.language!;
        const contextStrategy = message.contextStrategy!;

        try {
            const result = await this.service.generateReview(
                mergeCommitSha,
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

            if (!result.success || !result.review || !result.diff || !result.changes) {
                postError(this.panel, createReviewErrorPayload(result.error || 'Unknown error occurred', {
                    operation: 'review merged branch',
                    provider,
                    model,
                    command: message.command,
                    hint: 'Copy this report and include the merge commit SHA when reporting the bug.'
                }, {
                    title: 'Merged branch review failed'
                }));
                return;
            }

            postResult(this.panel, {
                review: result.review,
                rawDiff: result.diff
            });
        } catch (error) {
            const errorMessage = `Failed to generate review: ${error}`;
            vscode.window.showErrorMessage(errorMessage);
            console.error('Review generation error:', error);
            postError(this.panel, createReviewErrorPayload(error, {
                operation: 'review merged branch',
                provider,
                model,
                command: message.command,
                hint: 'Copy this report and include the merge commit SHA when reporting the bug.'
            }, {
                title: 'Merged branch review crashed',
                summary: errorMessage
            }));
        }
    }

    private async repairPlantUmlContent(message: ReviewMergedBranchMessage): Promise<void> {
        const validationError = validateMergedBranchReviewInput(message);
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

        const repairResult = await this.service.repairPlantUml(
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

        postPlantUmlRepairResult(this.panel, message.target!, repairResult.content, message.attempt || 1);
    }
}
