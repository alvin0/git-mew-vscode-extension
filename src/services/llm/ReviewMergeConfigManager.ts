import * as vscode from "vscode";
import { LLMProvider } from "../../llm-adapter";

/**
 * Manages Review Merge specific configuration storage
 * Separate from main LLM config to avoid conflicts with generateCommitCommand
 */
export class ReviewMergeConfigManager {
  private static readonly CONFIG_SECTION = "git-mew.reviewMerge";
  private static readonly PROVIDER_KEY = "provider";
  private static readonly MODEL_KEY = "model";
  private static readonly LANGUAGE_KEY = "language";

  /**
   * Get the last used provider for Review Merge
   */
  static getProvider(): LLMProvider | undefined {
    const config = vscode.workspace.getConfiguration(
      ReviewMergeConfigManager.CONFIG_SECTION
    );
    return config.get<LLMProvider>(ReviewMergeConfigManager.PROVIDER_KEY);
  }

  /**
   * Set the provider for Review Merge
   */
  static async setProvider(provider: LLMProvider): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      ReviewMergeConfigManager.CONFIG_SECTION
    );
    await config.update(
      ReviewMergeConfigManager.PROVIDER_KEY,
      provider,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * Get the last used model for Review Merge
   */
  static getModel(): string | undefined {
    const config = vscode.workspace.getConfiguration(
      ReviewMergeConfigManager.CONFIG_SECTION
    );
    return config.get<string>(ReviewMergeConfigManager.MODEL_KEY);
  }

  /**
   * Set the model for Review Merge
   */
  static async setModel(model: string): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      ReviewMergeConfigManager.CONFIG_SECTION
    );
    await config.update(
      ReviewMergeConfigManager.MODEL_KEY,
      model,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * Get the last used language for Review Merge
   */
  static getLanguage(): string {
    const config = vscode.workspace.getConfiguration(
      ReviewMergeConfigManager.CONFIG_SECTION
    );
    return config.get<string>(ReviewMergeConfigManager.LANGUAGE_KEY) || "Vietnamese";
  }

  /**
   * Set the language for Review Merge
   */
  static async setLanguage(language: string): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      ReviewMergeConfigManager.CONFIG_SECTION
    );
    await config.update(
      ReviewMergeConfigManager.LANGUAGE_KEY,
      language,
      vscode.ConfigurationTarget.Global
    );
  }
}