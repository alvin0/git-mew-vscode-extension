import * as vscode from 'vscode';
import { CLAUDE_MODELS, GEMINI_MODELS, OPENAI_MODELS } from '../../constant/llm';
import { createAdapter, LLMProvider } from '../../llm-adapter';
import { SYSTEM_PROMPT_GENERATE_DESCRIPTION_MERGE } from '../../prompts/systemPromptGenerateDescriptionMerge';
import { SYSTEM_PROMPT_GENERATE_REVIEW_MERGE } from '../../prompts/systemPromptGenerateReviewMerge';
import {
    ContextOrchestratorService,
    ContextStrategy,
    ContextTaskSpec,
    GenerationCancelledError,
    LLMService,
    UnifiedDiffFile
} from '../../services/llm';
import { ReviewMergeConfigManager } from '../../services/llm/ReviewMergeConfigManager';
import { GitService } from '../../services/utils/gitService';

export interface ReviewResult {
    success: boolean;
    review?: string;
    diff?: string;
    changes?: UnifiedDiffFile[];
    error?: string;
}

export interface DescriptionResult {
    success: boolean;
    description?: string;
    diff?: string;
    error?: string;
}

/**
 * Service for handling review merge operations
 */
export class ReviewMergeService {
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
     * Generate a review for merging two branches
     */
    async generateReview(
        baseBranch: string,
        compareBranch: string,
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

            const branchDiff = await this.getBranchDiffPreview(baseBranch, compareBranch);

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
            
            const review = await this.contextOrchestrator.generate({
                adapter: tempAdapter,
                strategy,
                changes: branchDiff.changes,
                signal: abortController.signal,
                onProgress,
                onLog,
                task: this.buildReviewTaskSpec(
                    baseBranch,
                    compareBranch,
                    branchDiff.diff,
                    taskInfo,
                    SYSTEM_PROMPT_GENERATE_REVIEW_MERGE(language, customSystemPrompt, customRules)
                ),
            });

            return {
                success: true,
                review,
                diff: branchDiff.diff,
                changes: branchDiff.changes
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
     * Generate a merge request description
     */
    async generateDescription(
        baseBranch: string,
        compareBranch: string,
        provider: LLMProvider,
        model: string,
        language: string,
        strategy: ContextStrategy,
        taskInfo?: string,
        diff?: string,
        changes?: UnifiedDiffFile[],
        contextWindow?: number,
        maxOutputTokens?: number,
        onProgress?: (message: string) => void,
        onLog?: (message: string) => void
    ): Promise<DescriptionResult> {
        this.currentAbortController?.abort();
        const abortController = new AbortController();
        this.currentAbortController = abortController;

        try {
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

            const branchDiff = changes && diff
                ? { changes, diff }
                : await this.getBranchDiffPreview(baseBranch, compareBranch);

            // Initialize adapter and generate description
            const tempAdapter = createAdapter(provider);
            await tempAdapter.initialize({
                apiKey,
                model,
                baseURL,
                contextWindow: this.isCustomModel(provider, model) ? this.llmService.getCustomModelContextWindow(provider) : undefined,
                maxOutputTokens: this.isCustomModel(provider, model) ? this.llmService.getCustomModelMaxOutputTokens(provider) : undefined
            });

            // Get custom system prompt and review rules if available
            const customSystemPrompt = await this.gitService.getCustomDescriptionMergeSystemPrompt();
            
            const description = await this.contextOrchestrator.generate({
                adapter: tempAdapter,
                strategy,
                changes: branchDiff.changes,
                signal: abortController.signal,
                onProgress,
                onLog,
                task: this.buildDescriptionTaskSpec(
                    baseBranch,
                    compareBranch,
                    branchDiff.diff,
                    taskInfo,
                    SYSTEM_PROMPT_GENERATE_DESCRIPTION_MERGE(language, customSystemPrompt, '')
                ),
            });

            return {
                success: true,
                description,
                diff: branchDiff.diff
            };

        } catch (error) {
            if (error instanceof GenerationCancelledError) {
                return {
                    success: false,
                    error: 'Description generation cancelled.'
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
     * Get branch diff in both structured and rendered form
     */
    async getBranchDiffPreview(baseBranch: string, compareBranch: string): Promise<{ changes: UnifiedDiffFile[]; diff: string; }> {
        const changes = await this.gitService.getBranchDiffFiles(baseBranch, compareBranch);
        const diff = this.gitService.renderBranchDiffFiles(changes);
        return { changes, diff };
    }

    /**
     * Save the review merge configuration
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
    private buildReviewPrompt(baseBranch: string, compareBranch: string, diff: string, taskInfo?: string): string {
        return `# Merge Request Review

**Base Branch:** ${baseBranch}
**Compare Branch:** ${compareBranch}
${taskInfo ? `\n**Task Context:** ${taskInfo}\n` : ''}

## Changes:

${diff}

Please analyze these changes and provide a comprehensive merge request review.`;
    }

    private buildReviewTaskSpec(
        baseBranch: string,
        compareBranch: string,
        diff: string,
        taskInfo: string | undefined,
        systemMessage: string
    ): ContextTaskSpec {
        return {
            kind: 'mergeReview',
            label: 'merge request review',
            systemMessage,
            directPrompt: this.buildReviewPrompt(baseBranch, compareBranch, diff, taskInfo),
            buildCoordinatorPrompt: ({ changedFilesSummary, analysesSummary }) => `# Merge Request Review

**Base Branch:** ${baseBranch}
**Compare Branch:** ${compareBranch}
${taskInfo ? `\n**Task Context:** ${taskInfo}\n` : ''}

## Changed Files:

${changedFilesSummary}

## Hierarchical Chunk Summaries:

${analysesSummary}

Please analyze these changes and provide a comprehensive merge request review.
Do not mention that the diff was summarized in multiple stages.`
        };
    }

    /**
     * Build the prompt for generating MR description
     */
    private buildDescriptionPrompt(baseBranch: string, compareBranch: string, diff: string, taskInfo?: string): string {
        return `# Generate Merge Request Description

**Base Branch:** ${baseBranch}
**Compare Branch:** ${compareBranch}
${taskInfo ? `\n**Task Info:** ${taskInfo}\n` : ''}

## Changes:

${diff}

Please generate a comprehensive merge request description following the template guidelines.`;
    }

    private buildDescriptionTaskSpec(
        baseBranch: string,
        compareBranch: string,
        diff: string,
        taskInfo: string | undefined,
        systemMessage: string
    ): ContextTaskSpec {
        return {
            kind: 'mrDescription',
            label: 'merge request description generation',
            systemMessage,
            directPrompt: this.buildDescriptionPrompt(baseBranch, compareBranch, diff, taskInfo),
            buildCoordinatorPrompt: ({ changedFilesSummary, analysesSummary }) => `# Generate Merge Request Description

**Base Branch:** ${baseBranch}
**Compare Branch:** ${compareBranch}
${taskInfo ? `\n**Task Info:** ${taskInfo}\n` : ''}

## Changed Files:

${changedFilesSummary}

## Hierarchical Chunk Summaries:

${analysesSummary}

Please generate a comprehensive merge request description following the template guidelines.
Do not mention that the diff was summarized in multiple stages.`
        };
    }
}
