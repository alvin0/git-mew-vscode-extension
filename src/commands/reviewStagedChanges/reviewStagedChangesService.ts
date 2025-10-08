import * as vscode from 'vscode';
import { createAdapter, LLMProvider } from '../../llm-adapter';
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
 * Service for handling review staged changes operations
 */
export class ReviewStagedChangesService {
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
     * Generate a review for staged changes
     */
    async generateReview(
        provider: LLMProvider,
        model: string,
        language: string,
        taskInfo?: string
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

            // Check if there are staged files
            const hasStagedFiles = await this.gitService.hasStagedFiles();
            if (!hasStagedFiles) {
                return {
                    success: false,
                    error: 'No staged files found. Please stage some files before reviewing.'
                };
            }

            // Get staged changes diff
            const diff = await this.gitService.getFormattedStagedChanges();

            // Initialize adapter and generate review
            const tempAdapter = createAdapter(provider);
            await tempAdapter.initialize({ apiKey, model });

            // Get custom system prompt and review rules if available
            const customSystemPrompt = await this.gitService.getCustomReviewMergeSystemPrompt();
            const customRules = await this.gitService.getCustomReviewMergeRules();
            
            const prompt = this.buildReviewPrompt(diff, taskInfo);
            const systemPrompt = this.buildSystemPrompt(language, customSystemPrompt, customRules);
            
            const response = await tempAdapter.generateText(prompt, {
                systemMessage: systemPrompt,
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
     * Save the review configuration
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
    private buildReviewPrompt(diff: string, taskInfo?: string): string {
        return `# Staged Changes Review

${taskInfo ? `**Task Context:** ${taskInfo}\n\n` : ''}
## Staged Changes:

${diff}

Please analyze these staged changes and provide a comprehensive code review.`;
    }

    /**
     * Build the system prompt for code review
     */
    private buildSystemPrompt(language: string, customSystemPrompt?: string, customRules?: string): string {
        const basePrompt = customSystemPrompt || `You are an expert code reviewer. Your task is to review staged changes and provide constructive feedback.

Analyze the code changes and provide:
1. **Summary**: Brief overview of what changed
2. **Quality Assessment**: Rate the code quality (Excellent/Good/Fair/Needs Improvement)
3. **Strengths**: What's done well
4. **Issues**: Problems or concerns (if any)
5. **Suggestions**: Recommendations for improvement
6. **Security**: Any security concerns
7. **Performance**: Performance implications

Be constructive, specific, and actionable in your feedback.`;

        const rulesSection = customRules ? `\n\n## Custom Review Rules:\n${customRules}` : '';
        const languageInstruction = `\n\nIMPORTANT: Provide your review in ${language} language.`;

        return basePrompt + rulesSection + languageInstruction;
    }
}