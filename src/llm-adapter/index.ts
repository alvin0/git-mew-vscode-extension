/**
 * LLM Adapter Module
 * Provides unified interface for multiple LLM providers
 */

// Export interfaces
export {
  GenerateOptions,
  GenerateResponse, ILLMAdapter,
  LLMAdapterConfig
} from './adapterInterface';

// Export adapter implementations
export { ClaudeAdapter } from './claude/ClaudeAdapter';
export { GeminiAdapter } from './gemini/GeminiAdapter';
export { OpenAIAdapter } from './openai/OpenAIAdapter';
// Export constants
export {
  API_BASE_URLS,
  API_VERSIONS, CLAUDE_MODELS, DEFAULT_CONFIG, DEFAULT_MODELS, GEMINI_MODELS, MODEL_CAPABILITIES, OPENAI_MODELS, type ClaudeModel,
  type GeminiModel,
  type LLMModel, type LLMProvider,
  type OpenAIModel
} from './constants';


// Import for internal use
import { ILLMAdapter } from './adapterInterface';
import { ClaudeAdapter } from './claude/ClaudeAdapter';
import { GeminiAdapter } from './gemini/GeminiAdapter';
import { OpenAIAdapter } from './openai/OpenAIAdapter';

/**
 * Adapter factory function
 * Creates an adapter instance based on the provider name
 */
export function createAdapter(provider: 'openai' | 'claude' | 'gemini'): ILLMAdapter {
  switch (provider.toLowerCase()) {
    case 'openai':
      return new OpenAIAdapter();
    case 'claude':
      return new ClaudeAdapter();
    case 'gemini':
      return new GeminiAdapter();
    default:
      throw new Error(`Unknown provider: ${provider}. Supported providers: openai, claude, gemini`);
  }
}