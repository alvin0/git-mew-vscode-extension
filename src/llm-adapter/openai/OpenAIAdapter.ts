import {
  API_BASE_URLS,
  DEFAULT_CONFIG,
  DEFAULT_MODELS,
  MODEL_CAPABILITIES,
} from "../../constant/llm";
import {
  GenerateOptions,
  GenerateResponse,
  ILLMAdapter,
  LLMAdapterConfig,
} from "../adapterInterface";

/**
 * OpenAI API Adapter
 * Supports GPT-4, GPT-3.5-turbo, and other OpenAI models
 */
export class OpenAIAdapter implements ILLMAdapter {
  private config: LLMAdapterConfig | null = null;
  private readonly defaultModel = DEFAULT_MODELS.OPENAI;
  private readonly defaultBaseURL = API_BASE_URLS.OPENAI;

  async initialize(config: LLMAdapterConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error("OpenAI API key is required");
    }

    this.config = {
      ...config,
      model: config.model || this.defaultModel,
      baseURL: config.baseURL || this.defaultBaseURL,
      timeout: config.timeout || DEFAULT_CONFIG.TIMEOUT,
    };
  }

  async generateText(
    prompt: string,
    options?: GenerateOptions,
  ): Promise<GenerateResponse> {
    if (!this.config) {
      throw new Error("Adapter not initialized. Call initialize() first.");
    }

    const normalizedOptions = this.normalizeResponsesOptions(options);

    const requestBody: any = {
      model: this.config.model,
      input: prompt,
      ...(normalizedOptions?.systemMessage && {
        instructions: normalizedOptions.systemMessage,
      }),
      ...(normalizedOptions?.maxTokens && {
        max_output_tokens: normalizedOptions.maxTokens,
      }),
      ...(normalizedOptions?.temperature !== undefined && {
        temperature: normalizedOptions.temperature,
      }),
      ...(normalizedOptions?.stop && { stop: normalizedOptions.stop }),
    };

    if (normalizedOptions) {
      const {
        maxTokens,
        temperature,
        stop,
        systemMessage,
        ...additionalOptions
      } = normalizedOptions;
      Object.assign(requestBody, additionalOptions);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseURL}/responses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error: any = await response
          .json()
          .catch(() => ({ error: { message: response.statusText } }));
        throw new Error(
          `OpenAI API error: ${error.error?.message || response.statusText}`,
        );
      }

      const data: any = await response.json();

      return {
        text: this.extractResponseText(data),
        model: data.model || this.config.model || this.defaultModel,
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
        totalTokens: data.usage?.total_tokens,
        finishReason: this.extractFinishReason(data),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error("Request timeout");
        }
        throw error;
      }
      throw new Error("Unknown error occurred");
    }
  }

  isReady(): boolean {
    return this.config !== null && !!this.config.apiKey;
  }

  getModel(): string {
    return this.config?.model || this.defaultModel;
  }

  getProvider(): string {
    return "openai";
  }

  private normalizeResponsesOptions(
    options?: GenerateOptions,
  ): GenerateOptions | undefined {
    if (!options) {
      return undefined;
    }

    const normalizedOptions: GenerateOptions = { ...options };
    const legacyReasoningEffort = normalizedOptions.reasoning_effort;
    const legacyVerbosity = normalizedOptions.verbosity;

    if (legacyReasoningEffort !== undefined) {
      if (normalizedOptions.reasoning === undefined) {
        normalizedOptions.reasoning = {
          effort: legacyReasoningEffort,
        };
      }

      delete normalizedOptions.reasoning_effort;
    }

    if (legacyVerbosity !== undefined) {
      if (normalizedOptions.text === undefined) {
        normalizedOptions.text = {
          verbosity: legacyVerbosity,
        };
      }

      delete normalizedOptions.verbosity;
    }

    return normalizedOptions;
  }

  private extractResponseText(data: any): string {
    if (typeof data?.output_text === "string" && data.output_text.length > 0) {
      return data.output_text;
    }

    if (!Array.isArray(data?.output)) {
      return "";
    }

    return data.output
      .flatMap((item: any) =>
        Array.isArray(item?.content) ? item.content : [],
      )
      .map((content: any) => {
        if (
          content?.type === "output_text" &&
          typeof content?.text === "string"
        ) {
          return content.text;
        }

        if (typeof content?.text === "string") {
          return content.text;
        }

        if (typeof content?.output_text === "string") {
          return content.output_text;
        }

        return "";
      })
      .filter((text: string) => text.length > 0)
      .join("\n");
  }

  private extractFinishReason(data: any): string | undefined {
    if (
      typeof data?.status === "string" &&
      data.status.length > 0 &&
      data.status !== "completed"
    ) {
      return data.status;
    }

    if (typeof data?.incomplete_details?.reason === "string") {
      return data.incomplete_details.reason;
    }

    return "stop";
  }

  getContextWindow(): number {
    const model = this.getModel();
    return (
      (MODEL_CAPABILITIES.CONTEXT_WINDOWS as Record<string, number>)[model] ??
      this.config?.contextWindow ??
      DEFAULT_CONFIG.CUSTOM_MODEL_CONTEXT_WINDOW
    );
  }

  getMaxOutputTokens(): number {
    const model = this.getModel();
    return (
      (MODEL_CAPABILITIES.MAX_OUTPUT_TOKENS as Record<string, number>)[model] ??
      this.config?.maxOutputTokens ??
      DEFAULT_CONFIG.CUSTOM_MODEL_MAX_OUTPUT_TOKENS
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.generateText("Hello", { maxTokens: 5 });
      return true;
    } catch {
      return false;
    }
  }
}
