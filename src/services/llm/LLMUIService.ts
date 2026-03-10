import * as vscode from "vscode";
import {
  API_BASE_URLS,
  CLAUDE_MODELS,
  DEFAULT_CONFIG,
  GEMINI_MODELS,
  LLMProvider,
  MODEL_UI_METADATA,
  OPENAI_MODELS,
  PROVIDER_UI_METADATA
} from "../../constant/llm";
import { OllamaAdapter } from "../../llm-adapter/ollama/OllamaAdapter";

/**
 * Handles all UI interactions for LLM configuration
 * (Quick picks, input boxes, notifications)
 */
export class LLMUIService {
  private static readonly CUSTOM_MODEL_SENTINEL = "__custom_model__";
  /**
   * Show provider selection quick pick with current selection indicator
   */
  async selectProvider(
    currentProvider?: LLMProvider
  ): Promise<LLMProvider | undefined> {
    const providers: LLMProvider[] = ['openai', 'claude', 'gemini', 'ollama', 'custom'];
    const items: vscode.QuickPickItem[] = providers.map((provider) => {
      const metadata = PROVIDER_UI_METADATA[provider];
      const isSelected = currentProvider === provider;
      return {
        label: isSelected
          ? `$(check) ${metadata.displayName}`
          : `${metadata.icon} ${metadata.displayName}`,
        description: metadata.description,
        detail: provider,
        picked: isSelected,
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: "Select LLM Provider",
      title: "Step 1: Choose your AI provider",
      ignoreFocusOut: true,
    });

    return selected ? (selected.detail as LLMProvider) : undefined;
  }

  /**
   * Show model selection for a provider with current selection indicator
   */
  async selectModel(
    provider: LLMProvider,
    currentModel?: string
  ): Promise<string | undefined> {
    let items: vscode.QuickPickItem[] = [];

    // Get available models for the provider
    let availableModels: string[] = [];
    
    if (provider === "ollama") {
      // For Ollama, fetch available models from API
      try {
        availableModels = await OllamaAdapter.getAvailableModels();
        
        if (availableModels.length === 0) {
          this.showWarning("No Ollama models found. Please pull a model first (e.g., 'ollama pull llama3.2')");
          return undefined;
        }
        
        // Build items for Ollama models (use model name as both label and detail)
        items = availableModels.map((modelName) => {
          const isSelected = currentModel === modelName;
          return {
            label: isSelected ? `$(check) ${modelName}` : modelName,
            description: "Local Ollama model",
            detail: modelName,
            picked: isSelected,
          };
        });

        items.push({
          label: currentModel && !availableModels.includes(currentModel)
            ? `$(check) Custom model: ${currentModel}`
            : "Custom model...",
          description: "Enter an Ollama model name manually",
          detail: LLMUIService.CUSTOM_MODEL_SENTINEL,
          picked: Boolean(currentModel && !availableModels.includes(currentModel)),
        });
      } catch (error) {
        this.showError(`Failed to fetch Ollama models: ${error}`);
        return undefined;
      }
    } else if (provider === "custom") {
      return await this.promptCustomModelName(provider, currentModel);
    } else {
      // For other providers, use predefined models
      switch (provider) {
        case "openai":
          availableModels = Object.values(OPENAI_MODELS);
          break;
        case "claude":
          availableModels = Object.values(CLAUDE_MODELS);
          break;
        case "gemini":
          availableModels = Object.values(GEMINI_MODELS);
          break;
      }

      // Build items from metadata
      items = availableModels.map((modelId) => {
        const metadata = MODEL_UI_METADATA[modelId as keyof typeof MODEL_UI_METADATA];
        const isSelected = currentModel === modelId;
        return {
          label: isSelected
            ? `$(check) ${metadata.displayName}`
            : metadata.displayName,
          description: metadata.description,
          detail: modelId,
          picked: isSelected,
        };
      });
    }

    items.push({
      label: currentModel && !availableModels.includes(currentModel)
        ? `$(check) Custom model: ${currentModel}`
        : "Custom model...",
      description: "Enter a model name manually",
      detail: LLMUIService.CUSTOM_MODEL_SENTINEL,
      picked: Boolean(currentModel && !availableModels.includes(currentModel)),
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Select ${provider} model`,
      title: `Step 3: Choose ${provider.toUpperCase()} Model`,
      ignoreFocusOut: true,
    });

    if (!selected) {
      return undefined;
    }

    if (selected.detail === LLMUIService.CUSTOM_MODEL_SENTINEL) {
      return await this.promptCustomModelName(provider, currentModel);
    }

    return selected.detail;
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

    return apiKey;
  }

  async promptBaseURL(
    provider: LLMProvider,
    currentValue?: string
  ): Promise<string | undefined> {
    const defaultValue = currentValue || (provider === "custom" ? API_BASE_URLS.CUSTOM : "");
    const baseURL = await vscode.window.showInputBox({
      prompt: `Enter the ${provider.toUpperCase()} base URL`,
      placeHolder: "https://your-endpoint.example.com/v1",
      value: defaultValue,
      title: `Configure ${provider.toUpperCase()} Base URL`,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Base URL cannot be empty";
        }

        try {
          new URL(value.trim());
          return null;
        } catch {
          return "Base URL must be a valid URL";
        }
      },
    });

    return baseURL?.trim();
  }

  async promptContextWindow(
    provider: LLMProvider,
    currentValue?: number
  ): Promise<number | undefined> {
    const value = await vscode.window.showInputBox({
      prompt: `Enter the ${provider.toUpperCase()} custom model context window`,
      placeHolder: String(DEFAULT_CONFIG.CUSTOM_MODEL_CONTEXT_WINDOW),
      value: String(currentValue ?? DEFAULT_CONFIG.CUSTOM_MODEL_CONTEXT_WINDOW),
      title: `Configure ${provider.toUpperCase()} Custom Model Context Window`,
      ignoreFocusOut: true,
      validateInput: (input) => this.validatePositiveInteger(input, 1024),
    });

    return value ? Number(value.trim()) : undefined;
  }

  async promptMaxOutputTokens(
    provider: LLMProvider,
    currentValue?: number
  ): Promise<number | undefined> {
    const value = await vscode.window.showInputBox({
      prompt: `Enter the ${provider.toUpperCase()} custom model max output tokens`,
      placeHolder: String(DEFAULT_CONFIG.CUSTOM_MODEL_MAX_OUTPUT_TOKENS),
      value: String(currentValue ?? DEFAULT_CONFIG.CUSTOM_MODEL_MAX_OUTPUT_TOKENS),
      title: `Configure ${provider.toUpperCase()} Custom Model Max Output Tokens`,
      ignoreFocusOut: true,
      validateInput: (input) => this.validatePositiveInteger(input, 256),
    });

    return value ? Number(value.trim()) : undefined;
  }

  isCustomModel(provider: LLMProvider, model: string): boolean {
    if (!model) {
      return false;
    }

    if (provider === "custom") {
      return true;
    }

    const knownModelsByProvider: Record<string, string[]> = {
      openai: Object.values(OPENAI_MODELS),
      claude: Object.values(CLAUDE_MODELS),
      gemini: Object.values(GEMINI_MODELS),
    };

    const knownModels = knownModelsByProvider[provider] || [];
    return !knownModels.includes(model);
  }

  private async promptCustomModelName(
    provider: LLMProvider,
    currentModel?: string
  ): Promise<string | undefined> {
    const customModel = await vscode.window.showInputBox({
      prompt: `Enter your ${provider.toUpperCase()} model name`,
      placeHolder: "gpt-4o-mini, claude-custom, local-model, etc.",
      value: currentModel,
      title: `Step 3: Enter ${provider.toUpperCase()} Model`,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Model name cannot be empty";
        }
        return null;
      },
    });

    return customModel?.trim();
  }

  private validatePositiveInteger(value: string, min: number): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return "Value cannot be empty";
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < min) {
      return `Value must be an integer >= ${min}`;
    }

    return null;
  }

  /**
   * Show information message
   */
  showInfo(message: string): void {
    vscode.window.showInformationMessage(message);
  }

  /**
   * Show warning message
   */
  showWarning(message: string): void {
    vscode.window.showWarningMessage(message);
  }

  /**
   * Show error message
   */
  showError(message: string): void {
    vscode.window.showErrorMessage(message);
  }
}
