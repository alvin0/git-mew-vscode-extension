import { API_BASE_URLS, DEFAULT_CONFIG, MODEL_CAPABILITIES } from '../../constant/llm';
import { GenerateOptions, GenerateResponse, ILLMAdapter, LLMAdapterConfig } from '../adapterInterface';

/**
 * Custom OpenAI-compatible API adapter.
 * Expects a chat/completions-compatible interface at the configured base URL.
 */
export class CustomAdapter implements ILLMAdapter {
  private config: LLMAdapterConfig | null = null;
  private readonly defaultModel = 'custom-model';
  private readonly defaultBaseURL = API_BASE_URLS.CUSTOM;

  async initialize(config: LLMAdapterConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('Custom provider API key is required');
    }

    if (!config.baseURL) {
      throw new Error('Custom provider base URL is required');
    }

    this.config = {
      ...config,
      model: config.model || this.defaultModel,
      baseURL: config.baseURL || this.defaultBaseURL,
      timeout: config.timeout || DEFAULT_CONFIG.TIMEOUT,
    };
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<GenerateResponse> {
    if (!this.config) {
      throw new Error('Adapter not initialized. Call initialize() first.');
    }

    const messages: Array<{ role: string; content: string }> = [];

    if (options?.systemMessage) {
      messages.push({ role: 'system', content: options.systemMessage });
    }

    messages.push({ role: 'user', content: prompt });

    const requestBody: any = {
      model: this.config.model,
      messages,
      ...(options?.maxTokens && { max_completion_tokens: options.maxTokens }),
      ...(options?.temperature !== undefined && {
        temperature: options.temperature,
      }),
      ...(options?.stop && { stop: options.stop }),
    };

    if (options) {
      const { maxTokens, temperature, stop, systemMessage, ...additionalOptions } = options;
      Object.assign(requestBody, additionalOptions);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseURL}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error: any = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`Custom API error: ${error.error?.message || response.statusText}`);
      }

      const data: any = await response.json();

      return {
        text: data.choices?.[0]?.message?.content || '',
        model: data.model || this.config.model || this.defaultModel,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
        finishReason: data.choices?.[0]?.finish_reason,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
      throw new Error('Unknown error occurred');
    }
  }

  isReady(): boolean {
    return this.config !== null && !!this.config.apiKey && !!this.config.baseURL;
  }

  getModel(): string {
    return this.config?.model || this.defaultModel;
  }

  getProvider(): string {
    return 'custom';
  }

  getContextWindow(): number {
    const model = this.getModel();
    return (MODEL_CAPABILITIES.CONTEXT_WINDOWS as Record<string, number>)[model]
      ?? this.config?.contextWindow
      ?? DEFAULT_CONFIG.CUSTOM_MODEL_CONTEXT_WINDOW;
  }

  getMaxOutputTokens(): number {
    const model = this.getModel();
    return (MODEL_CAPABILITIES.MAX_OUTPUT_TOKENS as Record<string, number>)[model]
      ?? this.config?.maxOutputTokens
      ?? DEFAULT_CONFIG.CUSTOM_MODEL_MAX_OUTPUT_TOKENS;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.generateText('Hello', { maxTokens: 5 });
      return true;
    } catch {
      return false;
    }
  }
}
