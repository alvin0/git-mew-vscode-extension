import * as vscode from 'vscode';
import { CLAUDE_MODELS, GEMINI_MODELS, OPENAI_MODELS } from '../../constant/llm';
import { createAdapter, LLMProvider } from '../../llm-adapter';
import {
    ContextOrchestratorService,
    ContextStrategy,
    ContextTaskSpec,
    GenerationCancelledError,
    LLMService
} from '../../services/llm';
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
    private readonly contextOrchestrator = new ContextOrchestratorService();
    private currentAbortController: AbortController | null = null;

    constructor(
        private gitService: GitService,
        private llmService: LLMService
    ) {}

    /**
     * Cancel the review generation
     */
    cancel() {
        this.currentAbortController?.abort();
        this.currentAbortController = null;
        console.log('Review generation cancelled by user.');
    }

    /**
     * Generate a review for staged changes
     */
    async generateReview(
        provider: LLMProvider,
        model: string,
        language: string,
        strategy: ContextStrategy,
        taskInfo?: string,
        contextWindow?: number,
        maxOutputTokens?: number,
        onProgress?: (message: string) => void,
        onLog?: (message: string) => void
    ): Promise<ReviewResult> {
        this.currentAbortController?.abort();
        const abortController = new AbortController();
        this.currentAbortController = abortController;

        try {
            // Save configuration for next time
            await this.saveConfiguration(provider, model, language, strategy);
            await this.saveCustomModelCapabilities(provider, model, contextWindow, maxOutputTokens);

            // Get API key
            const apiKey = await this.getApiKey(provider);
            if (!apiKey) {
                return {
                    success: false,
                    error: `No API key found for ${provider.toUpperCase()}. Please configure it first using "Git Mew: Setup Model".`
                };
            }

            const baseURL = await this.getBaseURL(provider);
            if (provider === 'custom' && !baseURL) {
                return {
                    success: false,
                    error: 'No custom base URL configured. The endpoint must support OpenAI-compatible /chat/completions.'
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
            const changes = await this.gitService.getStagedDiffFiles();
            const diff = this.gitService.renderStagedDiffFiles(changes);

            // Initialize adapter and generate review
            const tempAdapter = createAdapter(provider);
            await tempAdapter.initialize({
                apiKey,
                model,
                baseURL,
                contextWindow: this.isCustomModel(provider, model) ? this.llmService.getCustomModelContextWindow(provider) : undefined,
                maxOutputTokens: this.isCustomModel(provider, model) ? this.llmService.getCustomModelMaxOutputTokens(provider) : undefined
            });

            // Get custom system prompt and review rules if available
            const customSystemPrompt = await this.gitService.getCustomReviewMergeSystemPrompt();
            const customRules = await this.gitService.getCustomReviewMergeRules();
            
            const systemPrompt = this.buildSystemPrompt(language, customSystemPrompt, customRules);

            const review = await this.contextOrchestrator.generate({
                adapter: tempAdapter,
                strategy,
                changes,
                signal: abortController.signal,
                onProgress,
                onLog,
                task: this.buildTaskSpec(diff, taskInfo, systemPrompt),
            });

            return {
                success: true,
                review,
                diff: diff
            };

        } catch (error) {
            if (error instanceof GenerationCancelledError) {
                return {
                    success: false,
                    error: 'Review generation cancelled.'
                };
            }
            return {
                success: false,
                error: `${error}`
            };
        } finally {
            if (this.currentAbortController === abortController) {
                this.currentAbortController = null;
            }
        }
    }

    /**
     * Save the review configuration
     */
    private async saveConfiguration(
        provider: LLMProvider,
        model: string,
        language: string,
        strategy: ContextStrategy
    ): Promise<void> {
        await ReviewMergeConfigManager.setProvider(provider);
        await ReviewMergeConfigManager.setModel(model);
        await ReviewMergeConfigManager.setLanguage(language);
        await ReviewMergeConfigManager.setContextStrategy(strategy);
    }

    private async saveCustomModelCapabilities(
        provider: LLMProvider,
        model: string,
        contextWindow?: number,
        maxOutputTokens?: number
    ): Promise<void> {
        if (!this.isCustomModel(provider, model)) {
            return;
        }

        if (contextWindow) {
            await this.llmService.setCustomModelContextWindow(provider, contextWindow);
        }

        if (maxOutputTokens) {
            await this.llmService.setCustomModelMaxOutputTokens(provider, maxOutputTokens);
        }
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

    private async getBaseURL(provider: LLMProvider): Promise<string | undefined> {
        if (provider !== 'custom') {
            return undefined;
        }

        vscode.window.showWarningMessage(
            'Custom provider must expose an OpenAI-compatible /chat/completions interface.'
        );

        let baseURL = this.llmService.getBaseURL(provider);
        if (!baseURL) {
            const newBaseURL = await vscode.window.showInputBox({
                prompt: 'Enter Custom provider base URL',
                placeHolder: 'https://your-endpoint.example.com/v1',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Base URL cannot be empty';
                    }

                    try {
                        new URL(value.trim());
                        return null;
                    } catch {
                        return 'Base URL must be a valid URL';
                    }
                },
            });

            if (newBaseURL) {
                await this.llmService.setBaseURL(provider, newBaseURL.trim());
                baseURL = newBaseURL.trim();
            }
        }

        return baseURL;
    }

    private isCustomModel(provider: LLMProvider, model: string): boolean {
        if (provider === 'custom') {
            return true;
        }

        const knownModelsByProvider: Partial<Record<LLMProvider, string[]>> = {
            openai: Object.values(OPENAI_MODELS),
            claude: Object.values(CLAUDE_MODELS),
            gemini: Object.values(GEMINI_MODELS),
        };

        const knownModels = knownModelsByProvider[provider] || [];
        return !knownModels.includes(model);
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

    private buildTaskSpec(diff: string, taskInfo: string | undefined, systemMessage: string): ContextTaskSpec {
        return {
            kind: 'stagedReview',
            label: 'staged changes review',
            systemMessage,
            directPrompt: this.buildReviewPrompt(diff, taskInfo),
            buildCoordinatorPrompt: ({ changedFilesSummary, analysesSummary }) => `# Staged Changes Review

${taskInfo ? `**Task Context:** ${taskInfo}\n\n` : ''}## Changed Files:

${changedFilesSummary}

## Hierarchical Chunk Summaries:

${analysesSummary}

Please analyze these staged changes and provide a comprehensive code review.
Do not mention that the diff was summarized in multiple stages.`
        };
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
