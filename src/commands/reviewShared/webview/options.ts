import { MODEL_UI_METADATA, PROVIDER_UI_METADATA } from '../../../constant/llm';
import { LLMProvider } from '../../../llm-adapter';

export function buildBranchOptionsHtml(branches: string[], currentBranch?: string): string {
    return branches.map((branch) => {
        const isCurrent = branch === currentBranch;
        return `<option value="${branch}"${isCurrent ? ' selected' : ''}>${branch}${isCurrent ? ' (current)' : ''}</option>`;
    }).join('\n');
}

export function buildProviderOptionsHtml(providers?: LLMProvider[], currentProvider?: LLMProvider): string {
    if (!providers) {
        return '';
    }

    return providers.map((provider) => {
        const metadata = PROVIDER_UI_METADATA[provider];
        const isSelected = currentProvider === provider;
        return `<option value="${provider}"${isSelected ? ' selected' : ''}>${metadata.displayName}</option>`;
    }).join('\n');
}

export function buildModelOptionsMap(
    providers?: LLMProvider[],
    availableModels?: Record<string, string[]>,
    currentProvider?: LLMProvider,
    currentModel?: string
): Record<string, string> {
    const modelOptionsMap: Record<string, string> = {};

    if (!providers || !availableModels) {
        return modelOptionsMap;
    }

    for (const provider of providers) {
        const models = [...(availableModels[provider] || [])];
        if (currentProvider === provider && currentModel && !models.includes(currentModel)) {
            models.unshift(currentModel);
        }

        modelOptionsMap[provider] = models.map((modelId) => {
            const isSelected = currentProvider === provider && currentModel === modelId;
            const metadata = provider !== 'ollama'
                ? MODEL_UI_METADATA[modelId as keyof typeof MODEL_UI_METADATA]
                : undefined;
            const displayName = metadata?.displayName || modelId;
            return `<option value="${modelId}"${isSelected ? ' selected' : ''}>${displayName}</option>`;
        }).join('\n');
    }

    return modelOptionsMap;
}

export function buildLanguageOptionsHtml(savedLanguage?: string): string {
    const languages = [
        { value: 'English', label: 'English' },
        { value: 'Vietnamese', label: 'Tiếng Việt (Vietnamese)' },
        { value: 'Japanese', label: '日本語 (Japanese)' },
        { value: 'Korean', label: '한국어 (Korean)' },
        { value: 'Chinese', label: '中文 (Chinese)' },
        { value: 'French', label: 'Français (French)' },
        { value: 'German', label: 'Deutsch (German)' },
        { value: 'Spanish', label: 'Español (Spanish)' }
    ];

    return languages.map((lang) => {
        const isSelected = savedLanguage === lang.value || (!savedLanguage && lang.value === 'Vietnamese');
        return `<option value="${lang.value}"${isSelected ? ' selected' : ''}>${lang.label}</option>`;
    }).join('\n');
}
