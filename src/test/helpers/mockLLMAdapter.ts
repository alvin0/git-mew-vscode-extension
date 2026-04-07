import { GenerateOptions, GenerateResponse, ILLMAdapter, LLMAdapterConfig } from '../../llm-adapter';

type AdapterOverrides = Partial<ILLMAdapter> & {
  response?: Partial<GenerateResponse>;
};

export function createMockAdapter(overrides: AdapterOverrides = {}): ILLMAdapter {
  const response: GenerateResponse = {
    text: 'mock response',
    model: 'mock-model',
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    finishReason: 'stop',
    ...overrides.response,
  };

  return {
    async initialize(_config: LLMAdapterConfig): Promise<void> {},
    async generateText(_prompt: string, _options?: GenerateOptions): Promise<GenerateResponse> {
      return response;
    },
    isReady(): boolean { return true; },
    getModel(): string { return overrides.getModel?.() ?? 'mock-model'; },
    getProvider(): string { return overrides.getProvider?.() ?? 'mock'; },
    getContextWindow(): number { return overrides.getContextWindow?.() ?? 32768; },
    getMaxOutputTokens(): number { return overrides.getMaxOutputTokens?.() ?? 4096; },
    async testConnection(): Promise<boolean> { return true; },
    ...overrides,
  };
}

export function createFailingAdapter(error: Error): ILLMAdapter {
  return createMockAdapter({
    async generateText(): Promise<GenerateResponse> {
      throw error;
    },
  });
}

export function createTimeoutAdapter(ms: number): ILLMAdapter {
  return createMockAdapter({
    async generateText(): Promise<GenerateResponse> {
      await new Promise((resolve) => setTimeout(resolve, ms));
      throw new Error(`Timed out after ${ms}ms`);
    },
  });
}
