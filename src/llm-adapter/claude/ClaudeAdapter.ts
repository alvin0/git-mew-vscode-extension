import { GenerateOptions, GenerateResponse, ILLMAdapter, LLMAdapterConfig } from '../adapterInterface';
import { API_BASE_URLS, API_VERSIONS, DEFAULT_CONFIG, DEFAULT_MODELS } from '../constants';

/**
 * Claude (Anthropic) API Adapter
 * Supports Claude 3 models (Opus, Sonnet, Haiku)
 */
export class ClaudeAdapter implements ILLMAdapter {
  private config: LLMAdapterConfig | null = null;
  private readonly defaultModel = DEFAULT_MODELS.CLAUDE;
  private readonly defaultBaseURL = API_BASE_URLS.CLAUDE;
  private readonly apiVersion = API_VERSIONS.CLAUDE;

  async initialize(config: LLMAdapterConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('Claude API key is required');
    }

    this.config = {
      ...config,
      model: config.model || this.defaultModel,
      baseURL: config.baseURL || this.defaultBaseURL,
      maxTokens: config.maxTokens || DEFAULT_CONFIG.MAX_TOKENS,
      temperature: config.temperature ?? DEFAULT_CONFIG.TEMPERATURE,
      timeout: config.timeout || DEFAULT_CONFIG.TIMEOUT,
    };
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<GenerateResponse> {
    if (!this.config) {
      throw new Error('Adapter not initialized. Call initialize() first.');
    }

    const requestBody: any = {
      model: this.config.model,
      max_tokens: options?.maxTokens || this.config.maxTokens,
      temperature: options?.temperature ?? this.config.temperature,
      messages: [
        { role: 'user', content: prompt }
      ],
    };

    if (options?.systemMessage) {
      requestBody.system = options.systemMessage;
    }

    if (options?.stop) {
      requestBody.stop_sequences = options.stop;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': this.apiVersion,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error: any = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`Claude API error: ${error.error?.message || response.statusText}`);
      }

      const data: any = await response.json();

      return {
        text: data.content[0]?.text || '',
        model: data.model,
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        finishReason: data.stop_reason,
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
    return this.config !== null && !!this.config.apiKey;
  }

  getModel(): string {
    return this.config?.model || this.defaultModel;
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