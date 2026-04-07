import { GenerateOptions, ILLMAdapter } from "../../../llm-adapter";
import { ContextGenerationRequest } from "../contextTypes";
import { TokenEstimatorService } from "../TokenEstimatorService";
import { ContextOrchestratorConfig } from "./orchestratorTypes";
import { TruncationTelemetry } from "./telemetryTypes";

/**
 * Manages per-session context window calibration.
 * Learns the real context window limits from API errors and persists them.
 */
export class AdapterCalibrationService {
  private readonly calibrationCache: Map<string, { contextWindow: number }> = new Map();
  private truncationHandler?: (payload: TruncationTelemetry) => void;

  constructor(
    private readonly config: ContextOrchestratorConfig,
    private readonly tokenEstimator: TokenEstimatorService
  ) {}

  private getKey(adapter: ILLMAdapter): string {
    return `${adapter.getProvider()}:${adapter.getModel()}`;
  }

  getCalibratedContextWindow(adapter: ILLMAdapter): number {
    const key = this.getKey(adapter);
    return this.calibrationCache.get(key)?.contextWindow ?? adapter.getContextWindow();
  }

  setCalibratedContextWindow(
    adapter: ILLMAdapter,
    contextWindow: number,
    request?: ContextGenerationRequest
  ): void {
    const key = this.getKey(adapter);
    const previous = this.calibrationCache.get(key)?.contextWindow ?? adapter.getContextWindow();
    this.calibrationCache.set(key, { contextWindow });
    request?.onLog?.(
      `[calibration] updated context window for ${key}: ${previous} \u2192 ${contextWindow} tokens (learned from API error)`
    );
    this.config.onCalibrate?.(adapter.getProvider(), adapter.getModel(), contextWindow);
  }

  setTruncationHandler(handler?: (payload: TruncationTelemetry) => void): void {
    this.truncationHandler = handler;
  }

  /**
   * Truncates a prompt to fit within the model's context window.
   *
   * IMPORTANT: Modern APIs (OpenAI Responses, Claude, Gemini) treat input and output
   * token budgets independently. Do NOT subtract maxOutputTokens from the context window —
   * it would incorrectly halve the effective input budget on large-context models.
   *
   * Safety margin scales with context size:
   * - Small models (≤32k):  reserve 2048 tokens overhead
   * - Medium models (≤128k): reserve 4096 tokens
   * - Large models (>128k):  reserve 8192 tokens (enough for system + formatting overhead)
   */
  safeTruncatePrompt(
    prompt: string,
    systemMessage: string,
    adapter: ILLMAdapter,
    request?: ContextGenerationRequest,
    role?: string,
    overrideContextWindow?: number,
    budgetAllocated?: number,
  ): string {
    const contextWindow = overrideContextWindow ?? this.getCalibratedContextWindow(adapter);
    const model = adapter.getModel();

    // Scale safety margin: large models have bigger system messages and more overhead
    const safetyMargin =
      contextWindow > 128000 ? 8192 :
      contextWindow > 32000  ? 4096 :
                               2048;

    const inputBudget = Math.max(2000, contextWindow - safetyMargin);

    const sysTokens = this.estimateTokens(systemMessage, model);
    const promptTokens = this.estimateTokens(prompt, model);
    const totalTokens = sysTokens + promptTokens;

    if (totalTokens <= inputBudget) {
      return prompt;
    }

    const allowedPromptTokens = Math.max(500, inputBudget - sysTokens);
    // 4 chars/token is closer to real-world tokenizer behavior for code + prose mix
    const approxCharsAllowed = allowedPromptTokens * 4;

    if (prompt.length <= approxCharsAllowed) {
      return prompt;
    }

    // Keep the TAIL of the prompt — most recent tool results / context is most relevant
    const truncated =
      "...[context truncated to fit context window]...\n" +
      prompt.slice(prompt.length - approxCharsAllowed);

    request?.onLog?.(
      `[${role ?? "agent"}] prompt truncated: ~${totalTokens} tokens → ~${allowedPromptTokens} allowed (context window: ${contextWindow}, safety margin: ${safetyMargin})`
    );
    this.truncationHandler?.({
      agentRole: role ?? 'agent',
      tokensTruncated: Math.max(0, totalTokens - allowedPromptTokens),
      contextWindowActual: contextWindow,
      budgetAllocated,
    });

    return truncated;
  }

  /**
   * Parses the actual token limit from a context-length-exceeded API error.
   */
  parseContextLimitFromError(error: Error): number | null {
    const match = error.message.match(/exceeds the limit of (\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Wraps generateText with auto-retry logic.
   * On context-length errors, learns the real limit, updates the calibration cache,
   * and retries with a correctly-truncated prompt.
   */
  async generateTextWithAutoRetry(
    prompt: string,
    systemMessage: string,
    options: GenerateOptions,
    adapter: ILLMAdapter,
    request?: ContextGenerationRequest,
    role?: string
  ): Promise<any> {
    try {
      return await adapter.generateText(prompt, options);
    } catch (error) {
      if (error instanceof Error) {
        const realLimit = this.parseContextLimitFromError(error);
        if (realLimit && realLimit > 0) {
          this.setCalibratedContextWindow(adapter, realLimit, request);
          request?.onLog?.(
            `[${role ?? "agent"}] retrying with calibrated context window (${realLimit} tokens)...`
          );
          const retryPrompt = this.safeTruncatePrompt(
            prompt, systemMessage, adapter, request, `${role ?? "agent"}:retry`, realLimit
          );
          return await adapter.generateText(retryPrompt, options);
        }
      }
      throw error;
    }
  }

  private estimateTokens(text: string, model?: string): number {
    return this.tokenEstimator.estimateTextTokens(text, model) + 32;
  }
}
