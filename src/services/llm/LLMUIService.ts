import * as vscode from "vscode";
import {
  CLAUDE_MODELS,
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
  /**
   * Show provider selection quick pick with current selection indicator
   */
  async selectProvider(
    currentProvider?: LLMProvider
  ): Promise<LLMProvider | undefined> {
    const providers: LLMProvider[] = ['openai', 'claude', 'gemini', 'ollama'];
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
      } catch (error) {
        this.showError(`Failed to fetch Ollama models: ${error}`);
        return undefined;
      }
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

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Select ${provider} model`,
      title: `Step 3: Choose ${provider.toUpperCase()} Model`,
      ignoreFocusOut: true,
    });

    return selected?.detail;
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