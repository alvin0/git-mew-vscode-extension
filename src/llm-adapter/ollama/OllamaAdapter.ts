import { API_BASE_URLS, DEFAULT_CONFIG } from '../../constant/llm';
import { GenerateOptions, GenerateResponse, ILLMAdapter, LLMAdapterConfig } from '../adapterInterface';

/**
 * Ollama API Adapter
 * Supports local models running via Ollama (Llama, Mistral, CodeLlama, etc.)
 * Note: Ollama doesn't require an API key for local usage
 */
export class OllamaAdapter implements ILLMAdapter {
  private config: LLMAdapterConfig | null = null;
  private readonly defaultBaseURL = API_BASE_URLS.OLLAMA;

  /**
   * Get list of available models from Ollama
   * @param baseURL Ollama API base URL
   * @returns Array of model names
   */
  static async getAvailableModels(baseURL?: string): Promise<string[]> {
    const url = baseURL || API_BASE_URLS.OLLAMA;
    try {
      const response = await fetch(`${url}/tags`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      
      const data: any = await response.json();
      // Ollama API returns { models: [{ name: "llama3.2", ... }, ...] }
      return data.models?.map((model: any) => model.name) || [];
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
          throw new Error('Cannot connect to Ollama. Make sure Ollama is running (ollama serve)');
        }
      }
      throw error;
    }
  }

  async initialize(config: LLMAdapterConfig): Promise<void> {
    // Ollama doesn't require an API key for local usage
    // But we keep the config structure consistent with other adapters
    
    // Validate that a model is provided since Ollama uses dynamic models
    if (!config.model) {
      throw new Error('Model name is required for Ollama. Please select a model first.');
    }
    
    this.config = {
      ...config,
      apiKey: config.apiKey || 'not-required', // Ollama doesn't need API key
      model: config.model,
      baseURL: config.baseURL || this.defaultBaseURL,
      timeout: config.timeout || DEFAULT_CONFIG.TIMEOUT,
    };
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<GenerateResponse> {
    if (!this.config) {
      throw new Error('Adapter not initialized. Call initialize() first.');
    }

    const requestBody: any = {
      model: this.config.model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: options?.temperature ?? this.config.temperature,
        num_predict: options?.maxTokens || this.config.maxTokens,
      },
    };

    // Ollama supports system messages in the prompt format
    if (options?.systemMessage) {
      requestBody.system = options.systemMessage;
    }

    if (options?.stop) {
      requestBody.options.stop = options.stop;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseURL}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error: any = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(`Ollama API error: ${error.error || response.statusText}`);
      }

      const data: any = await response.json();

      return {
        text: data.response || '',
        model: data.model || this.config.model || '',
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        finishReason: data.done ? 'stop' : 'length',
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        // Provide helpful error message if Ollama is not running
        if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
          throw new Error('Cannot connect to Ollama. Make sure Ollama is running (ollama serve)');
        }
        throw error;
      }
      throw new Error('Unknown error occurred');
    }
  }

  isReady(): boolean {
    return this.config !== null && !!this.config.model;
  }

  getModel(): string {
    return this.config?.model || '';
  }

  async testConnection(): Promise<boolean> {
    try {
      // First check if Ollama is running by hitting the tags endpoint
      const response = await fetch(`${this.config?.baseURL || this.defaultBaseURL}/tags`);
      if (!response.ok) {
        return false;
      }
      
      // Then try a simple generation
      await this.generateText('Hello', { maxTokens: 5 });
      return true;
    } catch {
      return false;
    }
  }
}