import * as vscode from "vscode";
import { LLMProvider } from "../../llm-adapter";
import { ContextStrategy } from "./contextTypes";

/**
 * Manages LLM configuration storage (provider, model, API keys)
 * Handles reading/writing to VSCode configuration and secrets
 */
export class LLMConfigManager {
  private static readonly CONFIG_SECTION = "git-mew";
  private static readonly PROVIDER_KEY = "llmProvider";
  private static readonly API_KEY_PREFIX = "llmApiKey";
  private static readonly MODEL_KEY = "llmModel";
  private static readonly BASE_URL_KEY = "llmBaseUrl";
  private static readonly CUSTOM_CONTEXT_WINDOW_KEY = "llmCustomModelContextWindow";
  private static readonly CUSTOM_MAX_OUTPUT_TOKENS_KEY = "llmCustomModelMaxOutputTokens";

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Get the current LLM provider from configuration
   */
  getProvider(): LLMProvider | undefined {
    const config = vscode.workspace.getConfiguration(
      LLMConfigManager.CONFIG_SECTION
    );
    return config.get<LLMProvider>(LLMConfigManager.PROVIDER_KEY);
  }

  /**
   * Set the LLM provider
   */
  async setProvider(provider: LLMProvider): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      LLMConfigManager.CONFIG_SECTION
    );
    await config.update(
      LLMConfigManager.PROVIDER_KEY,
      provider,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * Get API key for a specific provider (stored securely)
   */
  async getApiKey(provider: LLMProvider): Promise<string | undefined> {
    const key = `${LLMConfigManager.API_KEY_PREFIX}.${provider}`;
    return await this.context.secrets.get(key);
  }

  /**
   * Set API key for a specific provider (stored securely)
   */
  async setApiKey(provider: LLMProvider, apiKey: string): Promise<void> {
    const key = `${LLMConfigManager.API_KEY_PREFIX}.${provider}`;
    await this.context.secrets.store(key, apiKey);
  }

  /**
   * Get the selected model for a provider
   */
  getModel(provider: LLMProvider): string | undefined {
    const config = vscode.workspace.getConfiguration(
      LLMConfigManager.CONFIG_SECTION
    );
    return config.get<string>(`${LLMConfigManager.MODEL_KEY}.${provider}`);
  }

  /**
   * Set the model for a provider
   */
  async setModel(provider: LLMProvider, model: string): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      LLMConfigManager.CONFIG_SECTION
    );
    await config.update(
      `${LLMConfigManager.MODEL_KEY}.${provider}`,
      model,
      vscode.ConfigurationTarget.Global
    );
  }

  getBaseURL(provider: LLMProvider): string | undefined {
    const config = vscode.workspace.getConfiguration(
      LLMConfigManager.CONFIG_SECTION
    );
    return config.get<string>(`${LLMConfigManager.BASE_URL_KEY}.${provider}`);
  }

  async setBaseURL(provider: LLMProvider, baseURL: string): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      LLMConfigManager.CONFIG_SECTION
    );
    await config.update(
      `${LLMConfigManager.BASE_URL_KEY}.${provider}`,
      baseURL,
      vscode.ConfigurationTarget.Global
    );
  }

  getCustomModelContextWindow(provider: LLMProvider): number | undefined {
    const config = vscode.workspace.getConfiguration(
      LLMConfigManager.CONFIG_SECTION
    );
    return config.get<number>(
      `${LLMConfigManager.CUSTOM_CONTEXT_WINDOW_KEY}.${provider}`
    );
  }

  async setCustomModelContextWindow(
    provider: LLMProvider,
    value: number
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      LLMConfigManager.CONFIG_SECTION
    );
    await config.update(
      `${LLMConfigManager.CUSTOM_CONTEXT_WINDOW_KEY}.${provider}`,
      value,
      vscode.ConfigurationTarget.Global
    );
  }

  getCustomModelMaxOutputTokens(provider: LLMProvider): number | undefined {
    const config = vscode.workspace.getConfiguration(
      LLMConfigManager.CONFIG_SECTION
    );
    return config.get<number>(
      `${LLMConfigManager.CUSTOM_MAX_OUTPUT_TOKENS_KEY}.${provider}`
    );
  }

  async setCustomModelMaxOutputTokens(
    provider: LLMProvider,
    value: number
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      LLMConfigManager.CONFIG_SECTION
    );
    await config.update(
      `${LLMConfigManager.CUSTOM_MAX_OUTPUT_TOKENS_KEY}.${provider}`,
      value,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * Reset all configuration for a specific provider
   */
  async resetProvider(provider: LLMProvider): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      LLMConfigManager.CONFIG_SECTION
    );

    // Reset model
    await config.update(
      `${LLMConfigManager.MODEL_KEY}.${provider}`,
      undefined,
      vscode.ConfigurationTarget.Global
    );

    await config.update(
      `${LLMConfigManager.BASE_URL_KEY}.${provider}`,
      undefined,
      vscode.ConfigurationTarget.Global
    );

    await config.update(
      `${LLMConfigManager.CUSTOM_CONTEXT_WINDOW_KEY}.${provider}`,
      undefined,
      vscode.ConfigurationTarget.Global
    );

    await config.update(
      `${LLMConfigManager.CUSTOM_MAX_OUTPUT_TOKENS_KEY}.${provider}`,
      undefined,
      vscode.ConfigurationTarget.Global
    );

    // Delete API key
    const key = `${LLMConfigManager.API_KEY_PREFIX}.${provider}`;
    await this.context.secrets.delete(key);
  }

  /**
   * Reset all configuration
   */
  async resetAllConfiguration(): Promise<void> {
    const provider = this.getProvider();
    const config = vscode.workspace.getConfiguration(
      LLMConfigManager.CONFIG_SECTION
    );

    // Reset provider
    await config.update(
      LLMConfigManager.PROVIDER_KEY,
      undefined,
      vscode.ConfigurationTarget.Global
    );

    // Reset provider-specific config if exists
    if (provider) {
      await this.resetProvider(provider);
    }
  }

  /**
   * Get the context strategy for commit generation
   */
  getCommitContextStrategy(): ContextStrategy {
    const config = vscode.workspace.getConfiguration("git-mew.commit");
    return config.get<ContextStrategy>("contextStrategy") || "auto";
  }
}
