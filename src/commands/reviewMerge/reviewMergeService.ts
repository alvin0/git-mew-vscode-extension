import * as vscode from 'vscode';
import { createAdapter, LLMProvider } from '../../llm-adapter';
import { SYSTEM_PROMPT_GENERATE_REVIEW_MERGE } from '../../prompts/systemPromptGenerateReviewMerge';
import { LLMService } from '../../services/llm';
import { ReviewMergeConfigManager } from '../../services/llm/ReviewMergeConfigManager';
import { GitService } from '../../services/utils/gitService';

export interface ReviewResult {
    success: boolean;
    review?: string;
    diff?: string;
    error?: string;
}

/**
 * Service for handling review merge operations
 */
export class ReviewMergeService {
    constructor(
        private gitService: GitService,
        private llmService: LLMService
    ) {}

    /**
     * Cancel the review generation
     */
    cancel() {
        // Currently, there's no long-running process to cancel on the backend.
        // The cancellation is primarily handled on the client-side to reset the UI.
        // This method is a placeholder for potential future backend cancellation logic.
        console.log('Review generation cancelled by user.');
    }

    /**
     * Generate a review for merging two branches
     */
    async generateReview(
        baseBranch: string,
        compareBranch: string,
        provider: LLMProvider,
        model: string,
        language: string
    ): Promise<ReviewResult> {
        try {
            // Save configuration for next time
            await this.saveConfiguration(provider, model, language);

            // Get API key
            const apiKey = await this.getApiKey(provider);
            if (!apiKey) {
                return {
                    success: false,
                    error: `No API key found for ${provider.toUpperCase()}. Please configure it first using "Git Mew: Setup Model".`
                };
            }

            // Get branch diff
            const diff = await this.gitService.getBranchDiff(baseBranch, compareBranch);

            // Initialize adapter and generate review
            const tempAdapter = createAdapter(provider);
            await tempAdapter.initialize({ apiKey, model });

            // Get custom system prompt and review rules if available
            const customSystemPrompt = await this.gitService.getCustomSystemPrompt();
            const customRules = await this.gitService.getCustomReviewRules();
            
            const prompt = this.buildPrompt(baseBranch, compareBranch, diff);
            const response = await tempAdapter.generateText(prompt, {
                systemMessage: SYSTEM_PROMPT_GENERATE_REVIEW_MERGE(language, customSystemPrompt, customRules),
            });

            const aiReview = response.text.trim();

            return {
                success: true,
                review: aiReview,
                diff: diff
            };

        } catch (error) {
            return {
                success: false,
                error: `${error}`
            };
        }
    }

    /**
     * Save the review merge configuration
     */
    private async saveConfiguration(
        provider: LLMProvider,
        model: string,
        language: string
    ): Promise<void> {
        await ReviewMergeConfigManager.setProvider(provider);
        await ReviewMergeConfigManager.setModel(model);
        await ReviewMergeConfigManager.setLanguage(language);
    }

    /**
     * Get API key for the provider
     */
    private async getApiKey(provider: LLMProvider): Promise<string | undefined> {
        if (provider === 'ollama') {
            return 'not-required';
        }

        let key = await this.llmService.getApiKey(provider);
        if (!key) {
            const newKey = await vscode.window.showInputBox({
                prompt: `Enter API Key for ${provider.toUpperCase()}`,
                placeHolder: 'Your API Key',
                ignoreFocusOut: true,
            });

            if (newKey) {
                await this.llmService.setApiKey(provider, newKey);
                key = newKey;
            } else {
                vscode.window.showWarningMessage(
                    `No API key provided for ${provider.toUpperCase()}. Please configure it first to proceed.`
                );
                return undefined;
            }
        }

        return key;
    }

    /**
     * Build the prompt for the LLM
     */
    private buildPrompt(baseBranch: string, compareBranch: string, diff: string): string {
        return `# Merge Request Review

**Base Branch:** ${baseBranch}
**Compare Branch:** ${compareBranch}

## Changes:

${diff}

Please analyze these changes and provide a comprehensive merge request review.`;
    }
}