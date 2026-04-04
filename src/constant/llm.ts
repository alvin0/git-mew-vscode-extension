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
  GPT_5_4: 'gpt-5.4',
  GPT_5_4_MINI: 'gpt-5.4-mini',
  GPT_5_4_NANO: 'gpt-5.4-nano',
} as const;

/**
 * Claude (Anthropic) Models
 */
export const CLAUDE_MODELS = {
  // Claude Sonnet 4.6
  CLAUDE_SONNET_4_6: 'claude-sonnet-4-6',
  CLAUDE_HAIKU_4_5: 'claude-haiku-4.5',
} as const;

/**
 * Google Gemini Models
 */
export const GEMINI_MODELS = {
  // Gemini 3.1 Models
  GEMINI_3_1_PRO: 'gemini-3.1-pro-preview',
  GEMINI_3_FLASH: 'gemini-3-flash-preview',
} as const;

/**
 * UI Metadata for Models
 * Used in quick pick menus and user-facing displays
 */
export const MODEL_UI_METADATA = {
  // OpenAI Models
  [OPENAI_MODELS.GPT_5_4]: {
    displayName: 'GPT-5.4',
    description: 'Most capable model',
  },
  [OPENAI_MODELS.GPT_5_4_MINI]: {
    displayName: 'GPT-5.4 Mini',
    description: 'Balanced performance',
  },
  [OPENAI_MODELS.GPT_5_4_NANO]: {
    displayName: 'GPT-5.4 Nano',
    description: 'Fast and efficient',
  },

  // Claude Models
  [CLAUDE_MODELS.CLAUDE_SONNET_4_6]: {
    displayName: 'Claude Sonnet 4.6',
    description: 'Latest model',
  },
  [CLAUDE_MODELS.CLAUDE_HAIKU_4_5]: {
    displayName: 'Claude Haiku 4.5',
    description: 'Fast and efficient',
  },

  // Gemini Models
  [GEMINI_MODELS.GEMINI_3_1_PRO]: {
    displayName: 'Gemini 3.1 Pro',
    description: 'Most capable',
  },
  [GEMINI_MODELS.GEMINI_3_FLASH]: {
    displayName: 'Gemini 3 Flash',
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
    description: 'GPT-5.4, GPT-5.4 Mini, GPT-5.4 Nano',
  },
  claude: {
    displayName: 'Claude',
    icon: '$(robot)',
    description: 'Claude Sonnet 4.6, Haiku 4.5',
  },
  gemini: {
    displayName: 'Gemini',
    icon: '$(sparkle)',
    description: 'Gemini 3.1 Pro, 3 Flash',
  },
  ollama: {
    displayName: 'Ollama',
    icon: '$(server)',
    description: 'Local models (Llama, Mistral, etc.)',
  },
  custom: {
    displayName: 'Custom',
    icon: '$(plug)',
    description: 'OpenAI-compatible custom endpoint',
  },
} as const;

/**
 * Default models for each provider
 * Note: Ollama doesn't have a default model as it uses dynamic model discovery
 */
export const DEFAULT_MODELS = {
  OPENAI: OPENAI_MODELS.GPT_5_4_MINI,
  CLAUDE: CLAUDE_MODELS.CLAUDE_SONNET_4_6,
  GEMINI: GEMINI_MODELS.GEMINI_3_FLASH,
} as const;

/**
 * API Base URLs
 */
export const API_BASE_URLS = {
  OPENAI: 'https://api.openai.com/v1',
  CLAUDE: 'https://api.anthropic.com/v1',
  GEMINI: 'https://generativelanguage.googleapis.com/v1beta',
  OLLAMA: 'http://localhost:11434/api',
  CUSTOM: 'http://localhost:8000/v1',
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
  CUSTOM_MODEL_CONTEXT_WINDOW: 128000,
  CUSTOM_MODEL_MAX_OUTPUT_TOKENS: 16384,
} as const;

/**
 * Model Capabilities
 */
export const MODEL_CAPABILITIES = {
  // Context window sizes (approximate)
  CONTEXT_WINDOWS: {
    [OPENAI_MODELS.GPT_5_4]: 200000,
    [OPENAI_MODELS.GPT_5_4_MINI]: 200000,
    [OPENAI_MODELS.GPT_5_4_NANO]: 200000,

    [CLAUDE_MODELS.CLAUDE_SONNET_4_6]: 200000,
    [CLAUDE_MODELS.CLAUDE_HAIKU_4_5]: 200000,

    [GEMINI_MODELS.GEMINI_3_1_PRO]: 200000,
    [GEMINI_MODELS.GEMINI_3_FLASH]: 200000,
  },

  // Max output tokens (realistic per-request output limits, separate from context window)
  MAX_OUTPUT_TOKENS: {
    [OPENAI_MODELS.GPT_5_4]: 128000,
    [OPENAI_MODELS.GPT_5_4_MINI]: 128000,
    [OPENAI_MODELS.GPT_5_4_NANO]: 128000,

    [CLAUDE_MODELS.CLAUDE_SONNET_4_6]: 128000,
    [CLAUDE_MODELS.CLAUDE_HAIKU_4_5]: 128000,

    [GEMINI_MODELS.GEMINI_3_1_PRO]: 65536,
    [GEMINI_MODELS.GEMINI_3_FLASH]: 65536,
  },
} as const;

/**
 * Provider Types
 */
export type LLMProvider = 'openai' | 'claude' | 'gemini' | 'ollama' | 'custom';

/**
 * Model Types
 */
export type OpenAIModel = typeof OPENAI_MODELS[keyof typeof OPENAI_MODELS];
export type ClaudeModel = typeof CLAUDE_MODELS[keyof typeof CLAUDE_MODELS];
export type GeminiModel = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS];
export type OllamaModel = string; // Ollama models are dynamic, so we use string type
export type LLMModel = OpenAIModel | ClaudeModel | GeminiModel | OllamaModel;
