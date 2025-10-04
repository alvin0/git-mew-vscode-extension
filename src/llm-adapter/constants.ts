/**
 * LLM Model Constants
 * Centralized model definitions for all supported LLM providers
 */

/**
 * OpenAI Models
 */
export const OPENAI_MODELS = {
  // GPT-5 Models
  GPT_5: 'gpt-5-2025-08-07',
  GPT_5_MINI: 'gpt-5-mini-2025-08-07',
  GPT_5_NANO: 'gpt-5-nano-2025-08-07',
  
  // GPT-4 Models
  GPT_4_1: 'gpt-4.1-2025-04-14',
} as const;

/**
 * Claude (Anthropic) Models
 */
export const CLAUDE_MODELS = {
  // Claude Sonnet 4.5
  CLAUDE_SONNET_4_5: 'claude-sonnet-4-5-20250929',
} as const;

/**
 * Google Gemini Models
 */
export const GEMINI_MODELS = {
  // Gemini 2.5 Models
  GEMINI_2_5_PRO: 'gemini-2.5-pro',
  GEMINI_2_5_FLASH: 'gemini-2.5-flash-preview-09-2025',
} as const;

/**
 * Default models for each provider
 */
export const DEFAULT_MODELS = {
  OPENAI: OPENAI_MODELS.GPT_5_MINI,
  CLAUDE: CLAUDE_MODELS.CLAUDE_SONNET_4_5,
  GEMINI: GEMINI_MODELS.GEMINI_2_5_FLASH,
} as const;

/**
 * API Base URLs
 */
export const API_BASE_URLS = {
  OPENAI: 'https://api.openai.com/v1',
  CLAUDE: 'https://api.anthropic.com/v1',
  GEMINI: 'https://generativelanguage.googleapis.com/v1beta',
} as const;

/**
 * API Versions
 */
export const API_VERSIONS = {
  CLAUDE: '2023-06-01',
} as const;

/**
 * Default Configuration Values
 */
export const DEFAULT_CONFIG = {
  MAX_TOKENS: 2000,
  TEMPERATURE: 0.7,
  TIMEOUT: 120000, // 120 seconds
} as const;

/**
 * Model Capabilities
 */
export const MODEL_CAPABILITIES = {
  // Context window sizes (approximate)
  CONTEXT_WINDOWS: {
    [OPENAI_MODELS.GPT_5]: 400000,
    [OPENAI_MODELS.GPT_5_MINI]: 400000,
    [OPENAI_MODELS.GPT_5_NANO]: 400000,
    [OPENAI_MODELS.GPT_4_1]: 1000000,
    
    [CLAUDE_MODELS.CLAUDE_SONNET_4_5]: 200000,
    
    [GEMINI_MODELS.GEMINI_2_5_PRO]: 2000000,
    [GEMINI_MODELS.GEMINI_2_5_FLASH]: 1000000,
  },
  
  // Max output tokens
  MAX_OUTPUT_TOKENS: {
    [OPENAI_MODELS.GPT_5]: 128000,
    [OPENAI_MODELS.GPT_5_MINI]: 128000,
    [OPENAI_MODELS.GPT_5_NANO]: 128000,
    [OPENAI_MODELS.GPT_4_1]: 128000,
    
    [CLAUDE_MODELS.CLAUDE_SONNET_4_5]: 128000,
    
    [GEMINI_MODELS.GEMINI_2_5_PRO]: 128000,
    [GEMINI_MODELS.GEMINI_2_5_FLASH]: 128000,
  },
} as const;

/**
 * Provider Types
 */
export type LLMProvider = 'openai' | 'claude' | 'gemini';

/**
 * Model Types
 */
export type OpenAIModel = typeof OPENAI_MODELS[keyof typeof OPENAI_MODELS];
export type ClaudeModel = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS];
export type GeminiModel = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS];
export type LLMModel = OpenAIModel | ClaudeModel | GeminiModel;