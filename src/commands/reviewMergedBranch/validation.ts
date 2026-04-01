import { ReviewMergedBranchMessage } from './webviewMessageHandler';

export function validateMergedBranchReviewInput(message: ReviewMergedBranchMessage): string | undefined {
    const { mergeCommitSha, provider, model, language, contextStrategy } = message;

    if (!mergeCommitSha || !provider || !model || !language || !contextStrategy) {
        return 'Please select all fields.';
    }

    return undefined;
}
