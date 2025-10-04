/**
 * LLM Model Constants
 * Single source of truth for all LLM provider configurations
 * Centralized model definitions, UI metadata, and capabilities
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
 * UI Metadata for Models
 * Used in quick pick menus and user-facing displays
 */
export const MODEL_UI_METADATA = {
  // OpenAI Models
  [OPENAI_MODELS.GPT_5]: {
    displayName: 'GPT-5',
    description: 'Most capable model',
  },
  [OPENAI_MODELS.GPT_5_MINI]: {
    displayName: 'GPT-5 Mini',
    description: 'Balanced performance',
  },
  [OPENAI_MODELS.GPT_5_NANO]: {
    displayName: 'GPT-5 Nano',
    description: 'Fast and efficient',
  },
  [OPENAI_MODELS.GPT_4_1]: {
    displayName: 'GPT-4.1',
    description: 'Previous generation',
  },
  
  // Claude Models
  [CLAUDE_MODELS.CLAUDE_SONNET_4_5]: {
    displayName: 'Claude Sonnet 4.5',
    description: 'Latest model',
  },
  
  // Gemini Models
  [GEMINI_MODELS.GEMINI_2_5_PRO]: {
    displayName: 'Gemini 2.5 Pro',
    description: 'Most capable',
  },
  [GEMINI_MODELS.GEMINI_2_5_FLASH]: {
    displayName: 'Gemini 2.5 Flash',
    description: 'Fast responses',
  },
} as const;

/**
 * Provider UI Metadata
 * Used in provider selection quick pick
 */
export const PROVIDER_UI_METADATA = {
  openai: {
    displayName: 'OpenAI',
    icon: '$(cloud)',
    description: 'GPT-5, GPT-4.1 models',
  },
  claude: {
    displayName: 'Claude',
    icon: '$(robot)',
    description: 'Claude Sonnet 4.5',
  },
  gemini: {
    displayName: 'Gemini',
    icon: '$(sparkle)',
    description: 'Gemini 2.5 Pro, Flash',
  },
  ollama: {
    displayName: 'Ollama',
    icon: '$(server)',
    description: 'Local models (Llama, Mistral, etc.)',
  },
} as const;

/**
 * Default models for each provider
 * Note: Ollama doesn't have a default model as it uses dynamic model discovery
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
  OLLAMA: 'http://localhost:11434/api',
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
  TIMEOUT: 300000, // 300 seconds
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
export type LLMProvider = 'openai' | 'claude' | 'gemini' | 'ollama';

/**
 * Model Types
 */
export type OpenAIModel = typeof OPENAI_MODELS[keyof typeof OPENAI_MODELS];
export type ClaudeModel = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS];
export type GeminiModel = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS];
export type OllamaModel = string; // Ollama models are dynamic, so we use string type
export type LLMModel = OpenAIModel | ClaudeModel | GeminiModel | OllamaModel;