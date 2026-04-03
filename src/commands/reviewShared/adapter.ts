import * as vscode from 'vscode';
import { createAdapter, ILLMAdapter, LLMProvider } from '../../llm-adapter';
import { LLMService } from '../../services/llm';
import { isCustomModelSelection } from './preferences';

export async function resolveProviderApiKey(
    llmService: LLMService,
    provider: LLMProvider
): Promise<string | undefined> {
    if (provider === 'ollama') {
        return 'not-required';
    }

    let key = await llmService.getApiKey(provider);
    if (key) {
        // Sanitize stored key — may contain invisible/non-ASCII chars from earlier paste
        key = key.replace(/[^\x20-\x7E]/g, '').trim() || undefined;
    }
    if (!key) {
        const newKey = await vscode.window.showInputBox({
            prompt: `Enter API Key for ${provider.toUpperCase()}`,
            placeHolder: 'Your API Key',
            ignoreFocusOut: true,
        });

        if (newKey) {
            const sanitized = newKey.replace(/[^\x20-\x7E]/g, '').trim();
            await llmService.setApiKey(provider, sanitized);
            key = sanitized;
        } else {
            vscode.window.showWarningMessage(
                `No API key provided for ${provider.toUpperCase()}. Please configure it first to proceed.`
            );
            return undefined;
        }
    }

    return key;
}

export async function resolveCustomProviderBaseUrl(
    llmService: LLMService,
    provider: LLMProvider
): Promise<string | undefined> {
    if (provider !== 'custom') {
        return undefined;
    }

    vscode.window.showWarningMessage(
        'Custom provider must expose an OpenAI-compatible /chat/completions interface.'
    );

    let baseURL = llmService.getBaseURL(provider);
    if (!baseURL) {
        const newBaseURL = await vscode.window.showInputBox({
            prompt: 'Enter Custom provider base URL',
            placeHolder: 'https://your-endpoint.example.com/v1',
            ignoreFocusOut: true,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Base URL cannot be empty';
                }

                try {
                    new URL(value.trim());
                    return null;
                } catch {
                    return 'Base URL must be a valid URL';
                }
            },
        });

        if (newBaseURL) {
            baseURL = newBaseURL.trim();
            await llmService.setBaseURL(provider, baseURL);
        }
    }

    return baseURL;
}

export async function createInitializedAdapter(
    llmService: LLMService,
    provider: LLMProvider,
    model: string,
    apiKey: string,
    baseURL?: string
): Promise<ILLMAdapter> {
    const adapter = createAdapter(provider);
    const usesCustomCapabilities = isCustomModelSelection(provider, model);

    await adapter.initialize({
        apiKey,
        model,
        baseURL,
        contextWindow: usesCustomCapabilities ? llmService.getCustomModelContextWindow(provider) : undefined,
        maxOutputTokens: usesCustomCapabilities ? llmService.getCustomModelMaxOutputTokens(provider) : undefined
    });

    return adapter;
}
