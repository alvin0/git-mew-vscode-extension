import { AvailableReviewModels } from '../reviewShared/types';
import { loadAvailableReviewModels } from '../reviewShared/preferences';
import { LLMService } from '../../services/llm';

/**
 * Provides available models for each LLM provider
 */
export class ModelProvider {
    /**
     * Get available models for all providers
     */
    static async getAvailableModels(llmService: LLMService): Promise<AvailableReviewModels> {
        return loadAvailableReviewModels(llmService);
    }
}
