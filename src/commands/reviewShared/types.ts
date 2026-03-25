import { LLMProvider } from '../../llm-adapter';
import { ContextStrategy } from '../../services/llm';

export const REVIEW_PROVIDERS: LLMProvider[] = ['openai', 'claude', 'gemini', 'ollama', 'custom'];

export interface CustomModelCapabilitySettings {
    contextWindow: number;
    maxOutputTokens: number;
}

export type ReviewCustomModelSettings = Record<string, CustomModelCapabilitySettings>;

export interface ReviewCustomProviderConfig {
    baseUrl?: string;
    hasApiKey: boolean;
}

export interface ReviewPreferences {
    currentProvider?: LLMProvider;
    currentModel?: string;
    savedLanguage: string;
    savedContextStrategy: ContextStrategy;
}

export interface AvailableReviewModels {
    providers: LLMProvider[];
    availableModels: Record<string, string[]>;
    customModelSettings: ReviewCustomModelSettings;
    customProviderConfig: ReviewCustomProviderConfig;
}

export interface ReviewGenerationCallbacks {
    onProgress?: (message: string) => void;
    onLog?: (message: string) => void;
}

export interface ReviewResultPayload {
    review?: string;
    description?: string;
    rawDiff?: string;
}

export interface ReviewErrorPayload {
    title: string;
    summary: string;
    rawError: string;
    operation: string;
    timestamp: string;
    provider?: string;
    model?: string;
    baseBranch?: string;
    compareBranch?: string;
    command?: string;
    target?: string;
    hint?: string;
}
