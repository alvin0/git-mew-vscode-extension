import { ReviewStagedChangesMessage } from './webviewMessageHandler';

export function validateStagedReviewInput(message: ReviewStagedChangesMessage): string | undefined {
    const { provider, model, language, contextStrategy } = message;

    if (!provider || !model || !language || !contextStrategy) {
        return 'Please select all fields.';
    }

    return undefined;
}
