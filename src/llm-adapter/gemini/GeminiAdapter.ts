import { API_BASE_URLS, DEFAULT_CONFIG, DEFAULT_MODELS } from '../../constant/llm';
import { GenerateOptions, GenerateResponse, ILLMAdapter, LLMAdapterConfig } from '../adapterInterface';

/**
 * Google Gemini API Adapter
 * Supports Gemini Pro and other Gemini models
 */
export class GeminiAdapter implements ILLMAdapter {
  private config: LLMAdapterConfig | null = null;
  private readonly defaultModel = DEFAULT_MODELS.GEMINI;
  private readonly defaultBaseURL = API_BASE_URLS.GEMINI;

  async initialize(config: LLMAdapterConfig): Promise<void> {
    if (!config.apiKey) {
      throw new Error('Gemini API key is required');
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

    const contents: any[] = [];
    
    if (options?.systemMessage) {
      contents.push({
        role: 'user',
        parts: [{ text: options.systemMessage }]
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood. I will follow these instructions.' }]
      });
    }
    
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    const requestBody: any = {
      contents,
    };

    if (options?.stop) {
      requestBody.generationConfig.stopSequences = options.stop;
    }

    // Merge additional options into requestBody (excluding known properties)
    if (options) {
      const { maxTokens, temperature, stop, systemMessage, ...additionalOptions } = options;
      Object.assign(requestBody, additionalOptions);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const url = `${this.config.baseURL}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error: any = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
      }

      const data: any = await response.json();

      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || '';
      
      return {
        text,
        model: this.config.model || this.defaultModel,
        promptTokens: data.usageMetadata?.promptTokenCount,
        completionTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount,
        finishReason: candidate?.finishReason,
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
    return 'gemini';
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