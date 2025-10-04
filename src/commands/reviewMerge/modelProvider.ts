import { CLAUDE_MODELS, GEMINI_MODELS, LLMProvider, OPENAI_MODELS } from '../../constant/llm';
import { OllamaAdapter } from '../../llm-adapter/ollama/OllamaAdapter';

/**
 * Provides available models for each LLM provider
 */
export class ModelProvider {
    /**
     * Get available models for all providers
     */
    static async getAvailableModels(): Promise<{ [key: string]: string[] }> {
        const providers: LLMProvider[] = ['openai', 'claude', 'gemini', 'ollama'];
        const availableModels: { [key: string]: string[] } = {};

        for (const provider of providers) {
            availableModels[provider] = await this.getModelsForProvider(provider);
        }

        return availableModels;
    }

    /**
     * Get models for a specific provider
     */
    private static async getModelsForProvider(provider: LLMProvider): Promise<string[]> {
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
            
            default:
                return [];
        }
    }
}