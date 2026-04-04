import * as vscode from "vscode";
import { LLMProvider } from "../constant/llm";
import { LLMService } from "../services/llm";

const PROVIDERS_WITH_API_KEYS: LLMProvider[] = ["openai", "claude", "gemini", "custom"];

/**
 * Register command to update stored API keys for supported providers
 */
export function registerManageApiKeysCommand(
  llmService: LLMService
): vscode.Disposable {
  return vscode.commands.registerCommand("git-mew.manage-api-keys", async () => {
    try {
      const providerItems = await Promise.all(
        PROVIDERS_WITH_API_KEYS.map(async (provider) => {
          const existingKey = await llmService.getApiKey(provider);
          return {
            label: existingKey
              ? `$(key) ${provider.toUpperCase()}`
              : `$(circle-slash) ${provider.toUpperCase()}`,
            description: existingKey ? "API key saved" : "No API key saved",
            detail: provider,
          };
        })
      );

      const selected = await vscode.window.showQuickPick(providerItems, {
        title: "Manage API Keys",
        placeHolder: "Select provider to update API key",
        ignoreFocusOut: true,
      });

      if (!selected) {
        return;
      }

      const provider = selected.detail as LLMProvider;
      if (provider === "custom") {
        vscode.window.showWarningMessage(
          "Custom provider must expose an OpenAI-compatible chat/completions interface."
        );
      }

      const newKey = await vscode.window.showInputBox({
        title: `Update ${provider.toUpperCase()} API Key`,
        prompt: `Enter a new ${provider.toUpperCase()} API key`,
        placeHolder: "sk-...",
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return "API key cannot be empty";
          }

          return null;
        },
      });

      if (!newKey) {
        return;
      }

      await llmService.setApiKey(provider, newKey.trim());
      if (provider === "custom") {
        const currentBaseURL = llmService.getBaseURL(provider);
        const baseURL = await vscode.window.showInputBox({
          title: "Update CUSTOM Base URL",
          prompt: "Enter the custom provider base URL",
          placeHolder: "https://your-endpoint.example.com/v1",
          value: currentBaseURL,
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

        if (!baseURL) {
          return;
        }

        await llmService.setBaseURL(provider, baseURL.trim());
      }

      vscode.window.showInformationMessage(
        `Updated ${provider.toUpperCase()} API key successfully.`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error updating API key: ${error}`);
      console.error("Error updating API key:", error);
    }
  });
}
