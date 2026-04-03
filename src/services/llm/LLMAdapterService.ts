import { createAdapter, ILLMAdapter } from "../../llm-adapter";
import { LLMConfigManager } from "./LLMConfigManager";
import { LLMUIService } from "./LLMUIService";

/**
 * Manages LLM adapter initialization and lifecycle
 * Handles adapter creation, caching, and connection testing
 */
export class LLMAdapterService {
  private adapter: ILLMAdapter | null = null;

  constructor(
    private configManager: LLMConfigManager,
    private uiService: LLMUIService
  ) {}

  /**
   * Initialize and get the LLM adapter
   * Handles auto-configuration if needed
   */
  async getAdapter(): Promise<ILLMAdapter | null> {
    // Return cached adapter if available and ready
    if (this.adapter && this.adapter.isReady()) {
      return this.adapter;
    }

    // Get provider
    let provider = this.configManager.getProvider();
    if (!provider) {
      provider = await this.uiService.selectProvider();
      if (!provider) {
        this.uiService.showWarning("No LLM provider selected");
        return null;
      }
      await this.configManager.setProvider(provider);
    }

    // Get API key (skip for Ollama)
    let apiKey: string | undefined;
    if (provider === 'ollama') {
      // Ollama doesn't require API key
      apiKey = 'not-required';
    } else {
      apiKey = await this.configManager.getApiKey(provider);
      if (apiKey) {
        // Sanitize stored key — may contain invisible/non-ASCII chars from earlier paste
        apiKey = apiKey.replace(/[^\x20-\x7E]/g, '').trim();
      }
      if (!apiKey) {
        apiKey = await this.uiService.promptApiKey(provider);
        if (!apiKey) {
          this.uiService.showWarning("No API key provided");
          return null;
        }
        await this.configManager.setApiKey(provider, apiKey);
      }
    }

    let baseURL: string | undefined;
    if (provider === 'custom') {
      this.uiService.showWarning(
        'Custom provider must expose an OpenAI-compatible chat/completions interface.'
      );
      baseURL = this.configManager.getBaseURL(provider);
      if (!baseURL) {
        baseURL = await this.uiService.promptBaseURL(provider);
        if (!baseURL) {
          this.uiService.showWarning("No base URL provided");
          return null;
        }
        await this.configManager.setBaseURL(provider, baseURL);
      }
    }

    // Get model
    let model = this.configManager.getModel(provider);
    if (!model) {
      model = await this.uiService.selectModel(provider);
      if (!model) {
        this.uiService.showWarning("No model selected");
        return null;
      }
      await this.configManager.setModel(provider, model);
    }

    const isCustomModel = this.uiService.isCustomModel(provider, model);
    const contextWindow = isCustomModel
      ? this.configManager.getCustomModelContextWindow(provider)
      : undefined;
    const maxOutputTokens = isCustomModel
      ? this.configManager.getCustomModelMaxOutputTokens(provider)
      : undefined;

    // Create and initialize adapter
    try {
      this.adapter = createAdapter(provider);
      await this.adapter.initialize({
        apiKey,
        model,
        baseURL,
        contextWindow,
        maxOutputTokens,
      });

      return this.adapter;
    } catch (error) {
      this.uiService.showError(
        `Failed to initialize ${provider}: ${error}`
      );
      return null;
    }
  }

  /**
   * Test the connection to the LLM service
   */
  async testConnection(): Promise<boolean> {
    const adapter = await this.getAdapter();
    if (!adapter) {
      return false;
    }

    try {
      const provider = this.configManager.getProvider();
      const isConnected = await adapter.testConnection();
      
      if (isConnected) {
        this.uiService.showInfo(
          `✓ Successfully connected to ${provider}`
        );
      } else {
        this.uiService.showError(
          `✗ Failed to connect to ${provider}`
        );
      }
      
      return isConnected;
    } catch (error) {
      this.uiService.showError(`Connection test failed: ${error}`);
      return false;
    }
  }

  /**
   * Clear the cached adapter
   * Forces re-initialization on next getAdapter() call
   */
  clearAdapter(): void {
    this.adapter = null;
  }

  /**
   * Get the current adapter without initialization
   * Returns null if adapter is not initialized
   */
  getCurrentAdapter(): ILLMAdapter | null {
    return this.adapter;
  }
}
