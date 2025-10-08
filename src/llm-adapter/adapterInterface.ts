/**
 * Configuration options for LLM adapter
 */
export interface LLMAdapterConfig {
  /** API key for authentication */
  apiKey: string;
  /** Model name to use (e.g., "gpt-4", "gpt-3.5-turbo") */
  model?: string;
  /** Base URL for API endpoint (optional, for custom endpoints) */
  baseURL?: string;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Temperature for response randomness (0-1) */
  temperature?: number;
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Options for text generation
 * Any additional properties will be merged into the API request body,
 * allowing for provider-specific parameters to override or extend defaults
 */
export interface GenerateOptions {
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Temperature for response randomness (0-1) */
  temperature?: number;
  /** Stop sequences to end generation */
  stop?: string[];
  /** System message to set context */
  systemMessage?: string;
  /** Any additional properties to merge into the request body */
  [key: string]: any;
}

/**
 * Response from text generation
 */
export interface GenerateResponse {
  /** Generated text content */
  text: string;
  /** Model used for generation */
  model: string;
  /** Number of tokens used in prompt */
  promptTokens?: number;
  /** Number of tokens used in completion */
  completionTokens?: number;
  /** Total tokens used */
  totalTokens?: number;
  /** Finish reason (e.g., "stop", "length") */
  finishReason?: string;
}

/**
 * Main interface for LLM adapters
 * Implement this interface to create adapters for different LLM providers
 */
export interface ILLMAdapter {
  /**
   * Initialize the adapter with configuration
   * @param config Configuration options
   */
  initialize(config: LLMAdapterConfig): Promise<void>;

  /**
   * Generate text from a prompt
   * @param prompt The input prompt
   * @param options Optional generation parameters
   * @returns Generated response
   */
  generateText(prompt: string, options?: GenerateOptions): Promise<GenerateResponse>;

  /**
   * Check if the adapter is properly configured and ready
   * @returns True if ready, false otherwise
   */
  isReady(): boolean;

  /**
   * Get the current model name
   * @returns Model name
   */
  getModel(): string;

  /**
   * Get the provider name
   * @returns Provider name (e.g., "openai", "claude", "gemini", "ollama")
   */
  getProvider(): string;

  /**
   * Test the connection to the LLM service
   * @returns True if connection is successful
   */
  testConnection(): Promise<boolean>;
}