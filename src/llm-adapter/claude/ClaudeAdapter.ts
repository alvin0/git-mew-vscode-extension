import { API_BASE_URLS, API_VERSIONS, ClaudeModel, DEFAULT_CONFIG, DEFAULT_MODELS, MODEL_CAPABILITIES } from '../../constant/llm';
import { GenerateOptions, GenerateResponse, ILLMAdapter, LLMAdapterConfig } from '../adapterInterface';

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

    const model = (config.model || this.defaultModel) as ClaudeModel;

    this.config = {
      ...config,
      model,
      baseURL: config.baseURL || this.defaultBaseURL,
      timeout: config.timeout || DEFAULT_CONFIG.TIMEOUT,
      maxTokens: config.maxTokens || 1024,
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
      messages: [{ role: 'user', content: prompt }],
    };

    if (options?.systemMessage) {
      requestBody.system = options.systemMessage;
    }

    if (options?.tools && options.tools.length > 0) {
      requestBody.tools = options.tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters
      }));
    }

    if (options?.stop) {
      requestBody.stop_sequences = options.stop;
    }

    // Merge additional options into requestBody (excluding known properties)
    if (options) {
      const { maxTokens, temperature, stop, systemMessage, tools, ...additionalOptions } = options;
      Object.assign(requestBody, additionalOptions);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const sanitizedApiKey = this.config.apiKey.replace(/[^\x20-\x7E]/g, '').trim();
      const response = await fetch(`${this.config.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': sanitizedApiKey,
          'anthropic-version': this.apiVersion,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorBody = '';
        try {
          const errorJson = await response.json();
          errorBody = JSON.stringify(errorJson, null, 2);
        } catch {
          errorBody = await response.text().catch(() => response.statusText);
        }
        throw new Error(`Claude API error: ${response.status} ${response.statusText}\nResponse: ${errorBody}`);
      }

      const data: any = await response.json();
      const contentBlocks = Array.isArray(data?.content) ? data.content : [];

      const toolCalls = contentBlocks
        .filter((c: any) => c.type === 'tool_use')
        .map((c: any) => ({
          id: c.id,
          type: 'function',
          function: {
            name: c.name,
            arguments: JSON.stringify(c.input)
          }
        }));

      return {
        text: contentBlocks.find((c: any) => c.type === 'text')?.text || '',
        model: data.model,
        promptTokens: data.usage?.input_tokens,
        completionTokens: data.usage?.output_tokens,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        finishReason: data.stop_reason,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined
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
    return 'claude';
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
