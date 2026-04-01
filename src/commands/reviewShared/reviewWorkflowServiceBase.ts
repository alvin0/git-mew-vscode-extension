import { ILLMAdapter, LLMProvider } from '../../llm-adapter';
import { SYSTEM_PROMPT_REPAIR_PLANTUML } from '../../prompts/systemPromptRepairPlantUml';
import { ContextOrchestratorService, ContextStrategy, LLMService } from '../../services/llm';
import { GitService } from '../../services/utils/gitService';
import { createInitializedAdapter, resolveCustomProviderBaseUrl, resolveProviderApiKey } from './adapter';
import { persistCustomModelCapabilitiesIfNeeded, persistReviewPreferences } from './preferences';

export abstract class ReviewWorkflowServiceBase {
    protected readonly contextOrchestrator: ContextOrchestratorService;
    private currentAbortController: AbortController | null = null;

    protected constructor(
        protected readonly gitService: GitService,
        protected readonly llmService: LLMService
    ) {
        this.contextOrchestrator = new ContextOrchestratorService({
            onCalibrate: (provider, model, contextWindow) => {
                // Persist the auto-discovered context window back to settings
                // so the UI "Context window" field reflects the real value
                llmService.setCustomModelContextWindow(
                    provider as any,
                    contextWindow
                ).catch((err: unknown) => {
                    console.error('[calibration] failed to persist context window to settings:', err);
                });
            }
        });
    }

    cancel(): void {
        this.currentAbortController?.abort();
        this.currentAbortController = null;
        console.log('Review generation cancelled by user.');
    }

    protected async prepareAdapter(
        provider: LLMProvider,
        model: string,
        language: string,
        strategy: ContextStrategy,
        apiKeyOverride?: string,
        baseUrlOverride?: string,
        contextWindow?: number,
        maxOutputTokens?: number
    ): Promise<{ adapter?: ILLMAdapter; error?: string; }> {
        await persistReviewPreferences(provider, model, language, strategy);
        await persistCustomModelCapabilitiesIfNeeded(
            this.llmService,
            provider,
            model,
            contextWindow,
            maxOutputTokens
        );

        if (provider === 'custom' && apiKeyOverride?.trim()) {
            await this.llmService.setApiKey(provider, apiKeyOverride.trim());
        }

        if (provider === 'custom' && baseUrlOverride?.trim()) {
            await this.llmService.setBaseURL(provider, baseUrlOverride.trim());
        }

        const apiKey = await resolveProviderApiKey(this.llmService, provider);
        if (!apiKey) {
            return {
                error: `No API key found for ${provider.toUpperCase()}. Please configure it first using "Git Mew: Setup Model".`
            };
        }

        const baseURL = provider === 'custom' && baseUrlOverride?.trim()
            ? baseUrlOverride.trim()
            : await resolveCustomProviderBaseUrl(this.llmService, provider);
        if (provider === 'custom' && !baseURL) {
            return {
                error: 'No custom base URL configured. The endpoint must support OpenAI-compatible /chat/completions.'
            };
        }

        return {
            adapter: await createInitializedAdapter(this.llmService, provider, model, apiKey, baseURL)
        };
    }

    protected async withAbortController<T>(
        task: (abortController: AbortController) => Promise<T>
    ): Promise<T> {
        this.currentAbortController?.abort();
        const abortController = new AbortController();
        this.currentAbortController = abortController;

        try {
            return await task(abortController);
        } finally {
            if (this.currentAbortController === abortController) {
                this.currentAbortController = null;
            }
        }
    }

    protected async repairPlantUmlMarkdown(
        provider: LLMProvider,
        model: string,
        language: string,
        strategy: ContextStrategy,
        content: string,
        renderError: string,
        apiKeyOverride?: string,
        baseUrlOverride?: string,
        contextWindow?: number,
        maxOutputTokens?: number,
        onProgress?: (message: string) => void,
        onLog?: (message: string) => void
    ): Promise<{ success: boolean; content?: string; error?: string; }> {
        return this.withAbortController(async () => {
            const dependencyState = await this.prepareAdapter(
                provider,
                model,
                language,
                strategy,
                apiKeyOverride,
                baseUrlOverride,
                contextWindow,
                maxOutputTokens
            );
            if (!dependencyState.adapter) {
                return { success: false, error: dependencyState.error };
            }

            try {
                onProgress?.('Repairing PlantUML diagram...');
                onLog?.(`[plantuml-repair] repairing invalid PlantUML block after render error: ${renderError}`);
                const response = await dependencyState.adapter.generateText(
                    this.buildPlantUmlRepairPrompt(content, renderError),
                    {
                        systemMessage: SYSTEM_PROMPT_REPAIR_PLANTUML(language),
                        maxTokens: dependencyState.adapter.getMaxOutputTokens(),
                    }
                );

                return {
                    success: true,
                    content: response.text.trim(),
                };
            } catch (error) {
                return {
                    success: false,
                    error: `${error}`,
                };
            }
        });
    }

    private buildPlantUmlRepairPrompt(content: string, renderError: string): string {
        return `The following Markdown failed PlantUML rendering.

PlantUML render error:
${renderError}

Return the full corrected Markdown document.

Markdown:
${content}`;
    }

    protected getRawAgentReport(reports: string[], role: string): string {
        const expectedPrefix = `### Agent: ${role}`;
        return reports.find((report) => report.startsWith(expectedPrefix)) ?? '';
    }
}
