import * as vscode from 'vscode';
import { LLMProvider } from '../../llm-adapter';
import { ContextStrategy } from '../../services/llm';
import { openDiffDocument, postError, postLog, postPlantUmlRepairResult, postProgress, postResult } from '../reviewShared/panelMessaging';
import { ReviewMergeService } from './reviewMergeService';
import { validateMergeRequestInput } from './validation';

export interface ReviewMergeMessage {
    command: 'reviewMerge' | 'generateDescription' | 'reviewAndDescription' | 'viewRawDiff' | 'cancel' | 'repairPlantUml';
    baseBranch?: string;
    compareBranch?: string;
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
        private reviewMergeService: ReviewMergeService
    ) {}

    async handleMessage(message: ReviewMergeMessage): Promise<void> {
        switch (message.command) {
            case 'reviewMerge':
                await this.generateMergeReview(message, false);
                break;
            case 'generateDescription':
                await this.generateMergeDescription(message);
                break;
            case 'reviewAndDescription':
                await this.generateMergeReview(message, true);
                break;
            case 'viewRawDiff':
                await openDiffDocument(message.diff);
                break;
            case 'cancel':
                this.reviewMergeService.cancel();
                break;
            case 'repairPlantUml':
                await this.repairPlantUmlContent(message);
                break;
        }
    }

    private async generateMergeReview(message: ReviewMergeMessage, includeDescription: boolean): Promise<void> {
        const validationError = validateMergeRequestInput(message);
        if (validationError) {
            vscode.window.showWarningMessage(validationError);
            return;
        }
        const { taskInfo, contextWindow, maxOutputTokens, apiKey, baseURL } = message;
        const baseBranch = message.baseBranch!;
        const compareBranch = message.compareBranch!;
        const provider = message.provider!;
        const model = message.model!;
        const language = message.language!;
        const contextStrategy = message.contextStrategy!;

        try {
            const result = await this.reviewMergeService.generateReview(
                baseBranch,
                compareBranch,
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
                (logMessage) => postLog(this.panel, logMessage)
            );

            if (!result.success && result.error === 'Review generation cancelled.') {
                return;
            }

            if (!result.success || !result.review || !result.diff || !result.changes) {
                postError(this.panel, result.error || 'Unknown error occurred');
                return;
            }

            const description = includeDescription
                ? await this.generateMergeReviewAndDescription(
                    baseBranch,
                    compareBranch,
                    provider,
                    model,
                    language,
                    contextStrategy,
                    taskInfo,
                    apiKey,
                    baseURL,
                    contextWindow,
                    maxOutputTokens,
                    result.diff,
                    result.changes
                )
                : undefined;

            postResult(this.panel, {
                review: result.review,
                description,
                rawDiff: result.diff
            });
        } catch (error) {
            const errorMessage = `Failed to generate review: ${error}`;
            vscode.window.showErrorMessage(errorMessage);
            console.error('Review generation error:', error);
            postError(this.panel, errorMessage);
        }
    }

    private async generateMergeDescription(message: ReviewMergeMessage): Promise<void> {
        const validationError = validateMergeRequestInput(message);
        if (validationError) {
            vscode.window.showWarningMessage(validationError);
            return;
        }
        const { taskInfo, contextWindow, maxOutputTokens, apiKey, baseURL } = message;
        const baseBranch = message.baseBranch!;
        const compareBranch = message.compareBranch!;
        const provider = message.provider!;
        const model = message.model!;
        const language = message.language!;
        const contextStrategy = message.contextStrategy!;

        try {
            const branchDiff = await this.reviewMergeService.getBranchDiffPreview(baseBranch, compareBranch);
            const descResult = await this.reviewMergeService.generateDescription(
                baseBranch,
                compareBranch,
                provider,
                model,
                language,
                contextStrategy,
                taskInfo,
                branchDiff.diff,
                branchDiff.changes,
                apiKey,
                baseURL,
                contextWindow,
                maxOutputTokens,
                (progressMessage) => postProgress(this.panel, progressMessage),
                (logMessage) => postLog(this.panel, logMessage)
            );

            if (!descResult.success && descResult.error === 'Description generation cancelled.') {
                return;
            }

            if (descResult.success && descResult.description && descResult.diff) {
                postResult(this.panel, {
                    description: descResult.description,
                    rawDiff: descResult.diff
                });
                return;
            }

            postError(this.panel, descResult.error || 'Unknown error occurred');
        } catch (error) {
            const errorMessage = `Failed to generate description: ${error}`;
            vscode.window.showErrorMessage(errorMessage);
            console.error('Description generation error:', error);
            postError(this.panel, errorMessage);
        }
    }

    private async generateMergeReviewAndDescription(
        baseBranch: string,
        compareBranch: string,
        provider: LLMProvider,
        model: string,
        language: string,
        contextStrategy: ContextStrategy,
        taskInfo: string | undefined,
        apiKey: string | undefined,
        baseURL: string | undefined,
        contextWindow: number | undefined,
        maxOutputTokens: number | undefined,
        diff: string,
        changes: NonNullable<Awaited<ReturnType<ReviewMergeService['generateReview']>>['changes']>
    ): Promise<string | undefined> {
        const descResult = await this.reviewMergeService.generateDescription(
            baseBranch,
            compareBranch,
            provider,
            model,
            language,
            contextStrategy,
            taskInfo,
            diff,
            changes,
            apiKey,
            baseURL,
            contextWindow,
            maxOutputTokens,
            (progressMessage) => postProgress(this.panel, progressMessage),
            (logMessage) => postLog(this.panel, logMessage)
        );

        if (!descResult.success && descResult.error === 'Description generation cancelled.') {
            return undefined;
        }

        if (descResult.success && descResult.description) {
            return descResult.description;
        }

        vscode.window.showWarningMessage(
            `Review generated successfully, but description generation failed: ${descResult.error}`
        );
        return undefined;
    }

    private async repairPlantUmlContent(message: ReviewMergeMessage): Promise<void> {
        const validationError = validateMergeRequestInput(message);
        if (validationError || !message.content || !message.errorMessage || !message.target) {
            postError(this.panel, validationError || 'Missing PlantUML repair payload.');
            return;
        }

        const provider = message.provider!;
        const model = message.model!;
        const language = message.language!;
        const contextStrategy = message.contextStrategy!;

        const repairResult = await this.reviewMergeService.repairPlantUml(
            provider,
            model,
            language,
            contextStrategy,
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
            postError(this.panel, repairResult.error || 'Failed to repair PlantUML content.');
            return;
        }

        postPlantUmlRepairResult(this.panel, message.target, repairResult.content, message.attempt || 1);
    }
}
