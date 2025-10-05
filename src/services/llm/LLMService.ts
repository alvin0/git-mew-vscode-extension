import * as vscode from "vscode";
import { LLMProvider } from "../../llm-adapter";
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
    return await this.configManager.setApiKey(provider, apiKey);
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

      // Step 3: Select Model
      const currentModel = this.configManager.getModel(provider);
      const model = await this.uiService.selectModel(provider, currentModel);
      if (!model) {
        return false;
      }
      await this.configManager.setModel(provider, model);

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
  async generateCommitMessage(stagedChanges: string, currentBranch: string): Promise<string | null> {
    return await this.generationService.generateCommitMessage(stagedChanges, currentBranch);
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
}