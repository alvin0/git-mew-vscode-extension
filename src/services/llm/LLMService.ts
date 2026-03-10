import * as vscode from "vscode";
import { DEFAULT_CONFIG } from "../../constant/llm";
import { LLMProvider } from "../../llm-adapter";
import { ContextStrategy, UnifiedDiffFile } from "./contextTypes";
import { LLMAdapterService } from "./LLMAdapterService";
import { LLMConfigManager } from "./LLMConfigManager";
import { LLMGenerationService } from "./LLMGenerationCommitMessageService";
import { LLMUIService } from "./LLMUIService";

/**
 * Main LLM Service that orchestrates all LLM-related functionality
 * Provides a unified interface for the extension
 */
export class LLMService {
  private configManager: LLMConfigManager;
  private uiService: LLMUIService;
  private adapterService: LLMAdapterService;
  private generationService: LLMGenerationService;

  constructor(context: vscode.ExtensionContext) {
    // Initialize sub-services
    this.configManager = new LLMConfigManager(context);
    this.uiService = new LLMUIService();
    this.adapterService = new LLMAdapterService(
      this.configManager,
      this.uiService
    );
    this.generationService = new LLMGenerationService(
      this.adapterService,
      this.uiService
    );
  }

  /**
   * Get the current LLM provider
   */
  getProvider(): LLMProvider | undefined {
    return this.configManager.getProvider();
  }

  /**
   * Get the current model for the active provider
   */
  getModel(provider: LLMProvider): string | undefined {
    return this.configManager.getModel(provider);
  }

  /**
   * Get API key for a provider
   */
  async getApiKey(provider: LLMProvider): Promise<string | undefined> {
    return await this.configManager.getApiKey(provider);
  }

  /**
   * Set API key for a provider
   */
  async setApiKey(provider: LLMProvider, apiKey: string): Promise<void> {
    await this.configManager.setApiKey(provider, apiKey);
    this.adapterService.clearAdapter();
  }

  getBaseURL(provider: LLMProvider): string | undefined {
    return this.configManager.getBaseURL(provider);
  }

  async setBaseURL(provider: LLMProvider, baseURL: string): Promise<void> {
    await this.configManager.setBaseURL(provider, baseURL);
    this.adapterService.clearAdapter();
  }

  getCustomModelContextWindow(provider: LLMProvider): number {
    return this.configManager.getCustomModelContextWindow(provider)
      ?? DEFAULT_CONFIG.CUSTOM_MODEL_CONTEXT_WINDOW;
  }

  async setCustomModelContextWindow(
    provider: LLMProvider,
    value: number
  ): Promise<void> {
    await this.configManager.setCustomModelContextWindow(provider, value);
    this.adapterService.clearAdapter();
  }

  getCustomModelMaxOutputTokens(provider: LLMProvider): number {
    return this.configManager.getCustomModelMaxOutputTokens(provider)
      ?? DEFAULT_CONFIG.CUSTOM_MODEL_MAX_OUTPUT_TOKENS;
  }

  async setCustomModelMaxOutputTokens(
    provider: LLMProvider,
    value: number
  ): Promise<void> {
    await this.configManager.setCustomModelMaxOutputTokens(provider, value);
    this.adapterService.clearAdapter();
  }

  /**
   * Unified configuration flow: Select provider -> Enter API key (if needed) -> Select model
   * Returns true if configuration is complete and ready
   */
  async configureAndSelectModel(): Promise<boolean> {
    try {
      // Step 1: Select Provider
      const currentProvider = this.configManager.getProvider();
      const provider = await this.uiService.selectProvider(currentProvider);
      if (!provider) {
        return false;
      }
      await this.configManager.setProvider(provider);

      // Step 2: Check if API key exists for this provider (skip for Ollama)
      let apiKey: string | undefined;
      if (provider === 'ollama') {
        // Ollama doesn't require API key
        apiKey = 'not-required';
        this.uiService.showInfo(
          `✓ Using local Ollama instance (no API key required)`
        );
      } else {
        apiKey = await this.configManager.getApiKey(provider);
        if (!apiKey) {
          // API key not found, prompt user to enter it
          this.uiService.showInfo(
            `No API key found for ${provider.toUpperCase()}. Please enter your API key.`
          );
          apiKey = await this.uiService.promptApiKey(provider);
          if (!apiKey) {
            this.uiService.showWarning("API key is required to continue");
            return false;
          }
          await this.configManager.setApiKey(provider, apiKey);
        } else {
          // API key already exists, skip to model selection
          this.uiService.showInfo(
            `✓ Using existing API key for ${provider.toUpperCase()}`
          );
        }
      }

      if (provider === 'custom') {
        this.uiService.showWarning(
          'Custom provider must expose an OpenAI-compatible chat/completions interface.'
        );
        const currentBaseURL = this.configManager.getBaseURL(provider);
        const baseURL = await this.uiService.promptBaseURL(provider, currentBaseURL);
        if (!baseURL) {
          this.uiService.showWarning("Base URL is required to continue");
          return false;
        }
        await this.configManager.setBaseURL(provider, baseURL);
      }

      // Step 3: Select Model
      const currentModel = this.configManager.getModel(provider);
      const model = await this.uiService.selectModel(provider, currentModel);
      if (!model) {
        return false;
      }
      await this.configManager.setModel(provider, model);

      if (this.uiService.isCustomModel(provider, model)) {
        const contextWindow = await this.uiService.promptContextWindow(
          provider,
          this.getCustomModelContextWindow(provider)
        );
        if (!contextWindow) {
          this.uiService.showWarning("Context window is required to continue");
          return false;
        }

        const maxOutputTokens = await this.uiService.promptMaxOutputTokens(
          provider,
          this.getCustomModelMaxOutputTokens(provider)
        );
        if (!maxOutputTokens) {
          this.uiService.showWarning("Max output tokens is required to continue");
          return false;
        }

        await this.setCustomModelContextWindow(provider, contextWindow);
        await this.setCustomModelMaxOutputTokens(provider, maxOutputTokens);
      }

      // Clear cached adapter to force re-initialization with new config
      this.adapterService.clearAdapter();

      this.uiService.showInfo(
        `✓ Configuration complete: ${provider.toUpperCase()} - ${model}`
      );
      return true;
    } catch (error) {
      this.uiService.showError(`Configuration failed: ${error}`);
      return false;
    }
  }

  /**
   * Test the current LLM connection
   */
  async testConnection(): Promise<boolean> {
    return await this.adapterService.testConnection();
  }

  /**
   * Generate commit message using LLM
   */
  async generateCommitMessage(
    stagedChanges: UnifiedDiffFile[],
    renderedDiff: string,
    currentBranch: string,
    signal?: AbortSignal,
    onProgress?: (message: string) => void
  ): Promise<string | null> {
    return await this.generationService.generateCommitMessage(
      stagedChanges,
      renderedDiff,
      currentBranch,
      signal,
      onProgress
    );
  }

  /**
   * Generate merge request review using LLM
   */
  async generateReviewMerge(
    baseBranch: string,
    compareBranch: string,
    diffContent: string
  ): Promise<string | null> {
    return await this.generationService.generateReviewMerge(
      baseBranch,
      compareBranch,
      diffContent
    );
  }

  /**
   * Reset all LLM configuration
   */
  async resetConfiguration(): Promise<void> {
    await this.configManager.resetAllConfiguration();
    this.adapterService.clearAdapter();
    this.uiService.showInfo("LLM configuration has been reset");
  }

  /**
   * Get the context strategy for commit generation
   */
  getCommitContextStrategy(): ContextStrategy {
    return this.configManager.getCommitContextStrategy();
  }
}
