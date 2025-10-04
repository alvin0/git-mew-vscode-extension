import * as vscode from "vscode";
import {
  CLAUDE_MODELS,
  createAdapter,
  GEMINI_MODELS,
  ILLMAdapter,
  LLMProvider,
  OPENAI_MODELS,
} from "../llm-adapter";
import { SYSTEM_PROMPT_GENERATE_COMMIT } from "../prompts/systemPromptGenerateCommit";

/**
 * Service to manage LLM configuration and provider selection
 */
export class LLMConfigService {
  private static readonly CONFIG_SECTION = "git-mew";
  private static readonly PROVIDER_KEY = "llmProvider";
  private static readonly API_KEY_PREFIX = "llmApiKey";
  private static readonly MODEL_KEY = "llmModel";

  private context: vscode.ExtensionContext;
  private adapter: ILLMAdapter | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Get the current LLM provider from configuration
   */
  getProvider(): LLMProvider | undefined {
    const config = vscode.workspace.getConfiguration(
      LLMConfigService.CONFIG_SECTION
    );
    return config.get<LLMProvider>(LLMConfigService.PROVIDER_KEY);
  }

  /**
   * Set the LLM provider
   */
  async setProvider(provider: LLMProvider): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      LLMConfigService.CONFIG_SECTION
    );
    await config.update(
      LLMConfigService.PROVIDER_KEY,
      provider,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * Get API key for a specific provider (stored securely)
   */
  async getApiKey(provider: LLMProvider): Promise<string | undefined> {
    const key = `${LLMConfigService.API_KEY_PREFIX}.${provider}`;
    return await this.context.secrets.get(key);
  }

  /**
   * Set API key for a specific provider (stored securely)
   */
  async setApiKey(provider: LLMProvider, apiKey: string): Promise<void> {
    const key = `${LLMConfigService.API_KEY_PREFIX}.${provider}`;
    await this.context.secrets.store(key, apiKey);
  }

  /**
   * Get the selected model for a provider
   */
  getModel(provider: LLMProvider): string | undefined {
    const config = vscode.workspace.getConfiguration(
      LLMConfigService.CONFIG_SECTION
    );
    return config.get<string>(`${LLMConfigService.MODEL_KEY}.${provider}`);
  }

  /**
   * Set the model for a provider
   */
  async setModel(provider: LLMProvider, model: string): Promise<void> {
    const config = vscode.workspace.getConfiguration(
      LLMConfigService.CONFIG_SECTION
    );
    await config.update(
      `${LLMConfigService.MODEL_KEY}.${provider}`,
      model,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * Show provider selection quick pick with current selection indicator
   */
  async selectProvider(): Promise<LLMProvider | undefined> {
    const currentProvider = this.getProvider();

    const items: vscode.QuickPickItem[] = [
      {
        label:
          currentProvider === "openai" ? "$(check) OpenAI" : "$(cloud) OpenAI",
        description: "GPT-5, GPT-4.1 models",
        detail: "openai",
        picked: currentProvider === "openai",
      },
      {
        label:
          currentProvider === "claude" ? "$(check) Claude" : "$(robot) Claude",
        description: "Claude Sonnet 4.5",
        detail: "claude",
        picked: currentProvider === "claude",
      },
      {
        label:
          currentProvider === "gemini"
            ? "$(check) Gemini"
            : "$(sparkle) Gemini",
        description: "Gemini 2.5 Pro, Flash",
        detail: "gemini",
        picked: currentProvider === "gemini",
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select LLM Provider",
      title: "Step 1: Choose your AI provider",
      ignoreFocusOut: true,
    });

    if (selected) {
      const provider = selected.detail as LLMProvider;
      await this.setProvider(provider);
      return provider;
    }

    return undefined;
  }

  /**
   * Show model selection for a provider with current selection indicator
   */
  async selectModel(provider: LLMProvider): Promise<string | undefined> {
    const currentModel = this.getModel(provider);
    let items: vscode.QuickPickItem[] = [];

    switch (provider) {
      case "openai":
        items = [
          {
            label:
              currentModel === OPENAI_MODELS.GPT_5 ? "$(check) GPT-5" : "GPT-5",
            description: "Most capable model",
            detail: OPENAI_MODELS.GPT_5,
            picked: currentModel === OPENAI_MODELS.GPT_5,
          },
          {
            label:
              currentModel === OPENAI_MODELS.GPT_5_MINI
                ? "$(check) GPT-5 Mini"
                : "GPT-5 Mini",
            description: "Balanced performance",
            detail: OPENAI_MODELS.GPT_5_MINI,
            picked: currentModel === OPENAI_MODELS.GPT_5_MINI,
          },
          {
            label:
              currentModel === OPENAI_MODELS.GPT_5_NANO
                ? "$(check) GPT-5 Nano"
                : "GPT-5 Nano",
            description: "Fast and efficient",
            detail: OPENAI_MODELS.GPT_5_NANO,
            picked: currentModel === OPENAI_MODELS.GPT_5_NANO,
          },
          {
            label:
              currentModel === OPENAI_MODELS.GPT_4_1
                ? "$(check) GPT-4.1"
                : "GPT-4.1",
            description: "Previous generation",
            detail: OPENAI_MODELS.GPT_4_1,
            picked: currentModel === OPENAI_MODELS.GPT_4_1,
          },
        ];
        break;
      case "claude":
        items = [
          {
            label:
              currentModel === CLAUDE_MODELS.CLAUDE_SONNET_4_5
                ? "$(check) Claude Sonnet 4.5"
                : "Claude Sonnet 4.5",
            description: "Latest model",
            detail: CLAUDE_MODELS.CLAUDE_SONNET_4_5,
            picked: currentModel === CLAUDE_MODELS.CLAUDE_SONNET_4_5,
          },
        ];
        break;
      case "gemini":
        items = [
          {
            label:
              currentModel === GEMINI_MODELS.GEMINI_2_5_PRO
                ? "$(check) Gemini 2.5 Pro"
                : "Gemini 2.5 Pro",
            description: "Most capable",
            detail: GEMINI_MODELS.GEMINI_2_5_PRO,
            picked: currentModel === GEMINI_MODELS.GEMINI_2_5_PRO,
          },
          {
            label:
              currentModel === GEMINI_MODELS.GEMINI_2_5_FLASH
                ? "$(check) Gemini 2.5 Flash"
                : "Gemini 2.5 Flash",
            description: "Fast responses",
            detail: GEMINI_MODELS.GEMINI_2_5_FLASH,
            picked: currentModel === GEMINI_MODELS.GEMINI_2_5_FLASH,
          },
        ];
        break;
    }

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Select ${provider} model`,
      title: `Step 3: Choose ${provider.toUpperCase()} Model`,
      ignoreFocusOut: true,
    });

    if (selected) {
      const model = selected.detail!;
      await this.setModel(provider, model);
      return model;
    }

    return undefined;
  }

  /**
   * Prompt user to enter API key
   */
  async promptApiKey(provider: LLMProvider): Promise<string | undefined> {
    const apiKey = await vscode.window.showInputBox({
      prompt: `Step 2: Enter your ${provider.toUpperCase()} API Key`,
      password: true,
      placeHolder: "sk-...",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "API key cannot be empty";
        }
        return null;
      },
      title: `Configure ${provider.toUpperCase()} API Key`,
      ignoreFocusOut: true,
    });

    if (apiKey) {
      await this.setApiKey(provider, apiKey);
      return apiKey;
    }

    return undefined;
  }

  /**
   * Unified configuration flow: Select provider -> Enter API key (if needed) -> Select model
   * Returns true if configuration is complete and ready
   */
  async configureAndSelectModel(): Promise<boolean> {
    try {
      // Step 1: Select Provider
      const provider = await this.selectProvider();
      if (!provider) {
        return false;
      }

      // Step 2: Check if API key exists for this provider
      let apiKey = await this.getApiKey(provider);
      if (!apiKey) {
        // API key not found, prompt user to enter it
        vscode.window.showInformationMessage(
          `No API key found for ${provider.toUpperCase()}. Please enter your API key.`
        );
        apiKey = await this.promptApiKey(provider);
        if (!apiKey) {
          vscode.window.showWarningMessage("API key is required to continue");
          return false;
        }
      } else {
        // API key already exists, skip to model selection
        vscode.window.showInformationMessage(
          `✓ Using existing API key for ${provider.toUpperCase()}`
        );
      }

      // Step 3: Select Model
      const model = await this.selectModel(provider);
      if (!model) {
        return false;
      }

      // Clear cached adapter to force re-initialization with new config
      this.adapter = null;

      vscode.window.showInformationMessage(
        `✓ Configuration complete: ${provider.toUpperCase()} - ${model}`
      );
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(`Configuration failed: ${error}`);
      return false;
    }
  }

  /**
   * Initialize and get the LLM adapter
   */
  async getAdapter(): Promise<ILLMAdapter | null> {
    // Return cached adapter if available
    if (this.adapter && this.adapter.isReady()) {
      return this.adapter;
    }

    // Get provider
    let provider = this.getProvider();
    if (!provider) {
      provider = await this.selectProvider();
      if (!provider) {
        vscode.window.showWarningMessage("No LLM provider selected");
        return null;
      }
    }

    // Get API key
    let apiKey = await this.getApiKey(provider);
    if (!apiKey) {
      apiKey = await this.promptApiKey(provider);
      if (!apiKey) {
        vscode.window.showWarningMessage("No API key provided");
        return null;
      }
    }

    // Get model
    let model = this.getModel(provider);
    if (!model) {
      model = await this.selectModel(provider);
    }

    // Create and initialize adapter
    try {
      this.adapter = createAdapter(provider);
      await this.adapter.initialize({
        apiKey,
        model,
      });

      return this.adapter;
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to initialize ${provider}: ${error}`
      );
      return null;
    }
  }

  /**
   * Test the current configuration
   */
  async testConnection(): Promise<boolean> {
    const adapter = await this.getAdapter();
    if (!adapter) {
      return false;
    }

    try {
      const isConnected = await adapter.testConnection();
      if (isConnected) {
        vscode.window.showInformationMessage(
          `✓ Successfully connected to ${this.getProvider()}`
        );
      } else {
        vscode.window.showErrorMessage(
          `✗ Failed to connect to ${this.getProvider()}`
        );
      }
      return isConnected;
    } catch (error) {
      vscode.window.showErrorMessage(`Connection test failed: ${error}`);
      return false;
    }
  }

  /**
   * Generate commit message using LLM
   */
  async generateCommitMessage(stagedChanges: string): Promise<string | null> {
    const adapter = await this.getAdapter();
    if (!adapter) {
      return null;
    }

    try {
      const prompt = `
      ${stagedChanges}`;

      const response = await adapter.generateText(prompt, {
        systemMessage: SYSTEM_PROMPT_GENERATE_COMMIT,
      });

      return response.text.trim();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to generate commit message: ${error}`
      );
      return null;
    }
  }

  /**
   * Reset all configuration
   */
  async resetConfiguration(): Promise<void> {
    const provider = this.getProvider();

    const config = vscode.workspace.getConfiguration(
      LLMConfigService.CONFIG_SECTION
    );
    await config.update(
      LLMConfigService.PROVIDER_KEY,
      undefined,
      vscode.ConfigurationTarget.Global
    );

    if (provider) {
      await config.update(
        `${LLMConfigService.MODEL_KEY}.${provider}`,
        undefined,
        vscode.ConfigurationTarget.Global
      );
      const key = `${LLMConfigService.API_KEY_PREFIX}.${provider}`;
      await this.context.secrets.delete(key);
    }

    this.adapter = null;
    vscode.window.showInformationMessage("LLM configuration has been reset");
  }
}
