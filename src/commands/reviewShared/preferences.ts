import { CLAUDE_MODELS, GEMINI_MODELS, OPENAI_MODELS } from '../../constant/llm';
import { LLMProvider } from '../../llm-adapter';
import { OllamaAdapter } from '../../llm-adapter/ollama/OllamaAdapter';
import { LLMService } from '../../services/llm';
import { ReviewMergeConfigManager } from '../../services/llm/ReviewMergeConfigManager';
import { AvailableReviewModels, REVIEW_PROVIDERS, ReviewPreferences } from './types';
import * as vscode from 'vscode';

export function loadReviewPreferences(llmService: LLMService): ReviewPreferences {
    const savedProvider = ReviewMergeConfigManager.getProvider();
    const savedLanguage = ReviewMergeConfigManager.getLanguage();
    const savedContextStrategy = ReviewMergeConfigManager.getContextStrategy();
    const currentProvider = savedProvider || llmService.getProvider();
    const currentModel = savedProvider
        ? ReviewMergeConfigManager.getModel()
        : currentProvider
            ? llmService.getModel(currentProvider)
            : undefined;

    return {
        currentProvider,
        currentModel,
        savedLanguage,
        savedContextStrategy,
    };
}

export async function loadAvailableReviewModels(llmService: LLMService): Promise<AvailableReviewModels> {
    const availableModels = Object.fromEntries(
        await Promise.all(
            REVIEW_PROVIDERS.map(async (provider) => [provider, await getModelsForProvider(provider)])
        )
    );

    const customModelSettings = Object.fromEntries(
        REVIEW_PROVIDERS.map((provider) => [
            provider,
            {
                contextWindow: llmService.getCustomModelContextWindow(provider),
                maxOutputTokens: llmService.getCustomModelMaxOutputTokens(provider),
            }
        ])
    );

    const customProviderConfig = {
        baseUrl: llmService.getBaseURL('custom'),
        hasApiKey: Boolean(await llmService.getApiKey('custom')),
    };

    return {
        providers: REVIEW_PROVIDERS,
        availableModels,
        customModelSettings,
        customProviderConfig,
    };
}

export async function persistReviewPreferences(
    provider: LLMProvider,
    model: string,
    language: string,
    strategy: 'direct' | 'auto' | 'hierarchical'
): Promise<void> {
    await ReviewMergeConfigManager.setProvider(provider);
    await ReviewMergeConfigManager.setModel(model);
    await ReviewMergeConfigManager.setLanguage(language);
    await ReviewMergeConfigManager.setContextStrategy(strategy);
}

export function isCustomModelSelection(provider: LLMProvider, model: string): boolean {
    if (provider === 'custom') {
        return true;
    }

    const knownModelsByProvider: Partial<Record<LLMProvider, string[]>> = {
        openai: Object.values(OPENAI_MODELS),
        claude: Object.values(CLAUDE_MODELS),
        gemini: Object.values(GEMINI_MODELS),
    };

    const knownModels = knownModelsByProvider[provider] || [];
    return !knownModels.includes(model);
}

export async function persistCustomModelCapabilitiesIfNeeded(
    llmService: LLMService,
    provider: LLMProvider,
    model: string,
    contextWindow?: number,
    maxOutputTokens?: number
): Promise<void> {
    if (!isCustomModelSelection(provider, model)) {
        return;
    }

    if (contextWindow) {
        await llmService.setCustomModelContextWindow(provider, contextWindow);
    }

    if (maxOutputTokens) {
        await llmService.setCustomModelMaxOutputTokens(provider, maxOutputTokens);
    }
}

async function getModelsForProvider(provider: LLMProvider): Promise<string[]> {
    switch (provider) {
        case 'openai':
            return Object.values(OPENAI_MODELS);
        case 'claude':
            return Object.values(CLAUDE_MODELS);
        case 'gemini':
            return Object.values(GEMINI_MODELS);
        case 'ollama':
            try {
                return await OllamaAdapter.getAvailableModels();
            } catch (error) {
                console.error('Failed to fetch Ollama models:', error);
                return [];
            }
        case 'custom': {
            const configuredModel = vscode.workspace
                .getConfiguration('git-mew')
                .get<string>('llmModel.custom');
            return configuredModel ? [configuredModel] : ['custom-model'];
        }
        default:
            return [];
    }
}
