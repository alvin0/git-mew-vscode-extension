import * as vscode from "vscode";
import { LLMProvider } from "../../llm-adapter";

/**
 * Manages LLM configuration storage (provider, model, API keys)
 * Handles reading/writing to VSCode configuration and secrets
 */
export class LLMConfigManager {
  private static readonly CONFIG_SECTION = "git-mew";
  private static readonly PROVIDER_KEY = "llmProvider";
  private static readonly API_KEY_PREFIX = "llmApiKey";
  private static readonly MODEL_KEY = "llmModel";

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
}