import { ReviewMergeMessage } from './webviewMessageHandler';

export function validateMergeRequestInput(message: ReviewMergeMessage): string | undefined {
    const { baseBranch, compareBranch, provider, model, language, contextStrategy } = message;

    if (!baseBranch || !compareBranch || !provider || !model || !language || !contextStrategy) {
        return 'Please select all fields.';
    }

    if (baseBranch === compareBranch) {
        return 'Base and compare branches must be different.';
    }

    return undefined;
}
