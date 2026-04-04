import * as vscode from 'vscode';
import { LLMProvider } from '../../llm-adapter';
import { ContextStrategy } from '../../services/llm';
import { createReviewErrorPayload } from '../reviewShared/errorReport';
import { openDiffDocument, postError, postLog, postLlmLog, postPlantUmlRepairResult, postProgress, postResult } from '../reviewShared/panelMessaging';
import { ReviewSelectedCommitsService } from './reviewSelectedCommitsService';

export interface ReviewSelectedCommitsMessage {
    command: 'reviewSelectedCommits' | 'viewRawDiff' | 'cancel' | 'repairPlantUml';
    oldestSha?: string;
    newestSha?: string;
    commitCount?: number;
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
        private service: ReviewSelectedCommitsService,
    ) {}

    async handleMessage(message: ReviewSelectedCommitsMessage): Promise<void> {
        switch (message.command) {
            case 'reviewSelectedCommits':
                await this.generateReview(message);
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

    private async generateReview(message: ReviewSelectedCommitsMessage): Promise<void> {
        const { oldestSha, newestSha, commitCount, provider, model, language, contextStrategy } = message;

        if (!oldestSha || !newestSha || !commitCount || !provider || !model || !language || !contextStrategy) {
            postError(this.panel, createReviewErrorPayload('Please select all fields.', {
                operation: 'review selected commits',
                provider: message.provider,
                model: message.model,
                command: message.command,
                hint: 'Verify the commit selection and required fields in the review panel.'
            }, { title: 'Invalid review request' }));
            return;
        }

        const { taskInfo, contextWindow, maxOutputTokens, apiKey, baseURL } = message;

        try {
            const result = await this.service.generateReview(
                oldestSha, newestSha, commitCount,
                provider, model, language, contextStrategy,
                taskInfo, apiKey, baseURL, contextWindow, maxOutputTokens,
                (progressMessage) => postProgress(this.panel, progressMessage),
                (logMessage) => postLog(this.panel, logMessage),
                (entry) => postLlmLog(this.panel, entry)
            );

            if (!result.success && result.error === 'Review generation cancelled.') {
                return;
            }

            if (!result.success || !result.review || !result.diff || !result.changes) {
                postError(this.panel, createReviewErrorPayload(result.error || 'Unknown error occurred', {
                    operation: 'review selected commits',
                    provider, model,
                    command: message.command,
                    hint: 'Copy this report and include the commit range when reporting the bug.'
                }, { title: 'Selected commits review failed' }));
                return;
            }

            postResult(this.panel, {
                review: result.review,
                rawDiff: result.diff
            }, `commits-${oldestSha.slice(0, 7)}-${newestSha.slice(0, 7)}`, model);
        } catch (error) {
            const errorMessage = `Failed to generate review: ${error}`;
            vscode.window.showErrorMessage(errorMessage);
            postError(this.panel, createReviewErrorPayload(error, {
                operation: 'review selected commits',
                provider, model,
                command: message.command,
                hint: 'Copy this report and include the commit range when reporting the bug.'
            }, { title: 'Selected commits review crashed', summary: errorMessage }));
        }
    }

    private async repairPlantUmlContent(message: ReviewSelectedCommitsMessage): Promise<void> {
        const { provider, model, language, contextStrategy, content, errorMessage, target } = message;

        if (!provider || !model || !language || !contextStrategy || !content || !errorMessage || !target) {
            postError(this.panel, createReviewErrorPayload('Missing PlantUML repair payload.', {
                operation: 'repair PlantUML',
                provider, model,
                command: message.command,
                target,
                hint: 'Retry generation first. If the issue persists, send this report to the maintainer.'
            }, { title: 'Invalid PlantUML repair request' }));
            return;
        }

        const repairResult = await this.service.repairPlantUml(
            provider, model, language, contextStrategy,
            content, errorMessage, [],
            message.apiKey, message.baseURL,
            message.contextWindow, message.maxOutputTokens,
            (progressMessage: string) => postProgress(this.panel, progressMessage),
            (logMessage: string) => postLog(this.panel, logMessage)
        );

        if (!repairResult.success || !repairResult.content) {
            postError(this.panel, createReviewErrorPayload(repairResult.error || 'Failed to repair PlantUML content.', {
                operation: 'repair PlantUML',
                provider, model,
                command: message.command,
                target,
                hint: 'Include the generated review and this repair report when filing the issue.'
            }, { title: 'PlantUML repair failed' }));
            return;
        }

        postPlantUmlRepairResult(this.panel, target, repairResult.content, message.attempt || 1);
    }
}
