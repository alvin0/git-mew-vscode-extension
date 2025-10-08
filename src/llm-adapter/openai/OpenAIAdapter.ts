import { API_BASE_URLS, DEFAULT_CONFIG, DEFAULT_MODELS } from '../../constant/llm';
import { GenerateOptions, GenerateResponse, ILLMAdapter, LLMAdapterConfig } from '../adapterInterface';

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
      throw new Error('OpenAI API key is required');
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

    // Build base request body
    const requestBody: any = {
      model: this.config.model,
      messages,
      ...(options?.stop && { stop: options.stop }),
    };

    // Merge additional options into requestBody (excluding known properties)
    if (options) {
      const { maxTokens, temperature, stop, systemMessage, ...additionalOptions } = options;
      Object.assign(requestBody, additionalOptions);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseURL}/chat/completions`, {
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
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const data: any = await response.json();

      return {
        text: data.choices[0]?.message?.content || '',
        model: data.model,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
        finishReason: data.choices[0]?.finish_reason,
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

  getProvider(): string {
    return 'openai';
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