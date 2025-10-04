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

        const key = await this.llmService.getApiKey(provider);
        if (!key) {
            vscode.window.showWarningMessage(
                `No API key found for ${provider.toUpperCase()}. Please configure it first using "Git Mew: Setup Model".`
            );
            return undefined;
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