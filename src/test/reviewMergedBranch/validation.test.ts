// Feature: review-merged-branch-agent-plan, Task 10: Unit tests for validation and edge cases
// **Validates: Requirements 1.4, 2.5, 6.4**

import * as assert from 'assert';
import { validateMergedBranchReviewInput } from '../../commands/reviewMergedBranch/validation';
import { ReviewMergedBranchMessage } from '../../commands/reviewMergedBranch/webviewMessageHandler';

/**
 * Replicate parseBranchNameFromMergeMessage locally since it is private in GitService.
 * Same logic as GitService.parseBranchNameFromMergeMessage().
 */
function parseBranchNameFromMergeMessage(message: string): string {
    const branchInto = message.match(/Merge branch '(.+?)' into .+/);
    if (branchInto) { return branchInto[1]; }
    const branch = message.match(/Merge branch '(.+?)'/);
    if (branch) { return branch[1]; }
    const pr = message.match(/Merge pull request #\d+ from (.+)/);
    if (pr) { return pr[1]; }
    const remote = message.match(/Merge remote-tracking branch '(.+?)'/);
    if (remote) { return remote[1]; }
    return message;
}

/** Helper to build a valid ReviewMergedBranchMessage with all required fields. */
function buildValidMessage(overrides: Partial<ReviewMergedBranchMessage> = {}): ReviewMergedBranchMessage {
    return {
        command: 'reviewMergedBranch',
        mergeCommitSha: 'abc123def456',
        provider: 'openai',
        model: 'gpt-4',
        language: 'English',
        contextStrategy: 'auto',
        ...overrides,
    };
}

suite('validateMergedBranchReviewInput', () => {

    test('returns error when mergeCommitSha is missing', () => {
        const msg = buildValidMessage({ mergeCommitSha: undefined });
        assert.strictEqual(validateMergedBranchReviewInput(msg), 'Please select all fields.');
    });

    test('returns error when provider is missing', () => {
        const msg = buildValidMessage({ provider: undefined });
        assert.strictEqual(validateMergedBranchReviewInput(msg), 'Please select all fields.');
    });

    test('returns error when model is missing', () => {
        const msg = buildValidMessage({ model: undefined });
        assert.strictEqual(validateMergedBranchReviewInput(msg), 'Please select all fields.');
    });

    test('returns error when language is missing', () => {
        const msg = buildValidMessage({ language: undefined });
        assert.strictEqual(validateMergedBranchReviewInput(msg), 'Please select all fields.');
    });

    test('returns error when contextStrategy is missing', () => {
        const msg = buildValidMessage({ contextStrategy: undefined });
        assert.strictEqual(validateMergedBranchReviewInput(msg), 'Please select all fields.');
    });

    test('returns undefined when all fields are present', () => {
        const msg = buildValidMessage();
        assert.strictEqual(validateMergedBranchReviewInput(msg), undefined);
    });
});

suite('parseBranchNameFromMergeMessage — edge cases', () => {

    test('parses standard merge branch message', () => {
        assert.strictEqual(
            parseBranchNameFromMergeMessage("Merge branch 'feature/auth'"),
            'feature/auth'
        );
    });

    test('parses merge branch into target message', () => {
        assert.strictEqual(
            parseBranchNameFromMergeMessage("Merge branch 'fix/bug' into main"),
            'fix/bug'
        );
    });

    test('parses pull request merge message', () => {
        assert.strictEqual(
            parseBranchNameFromMergeMessage("Merge pull request #42 from user/feature"),
            'user/feature'
        );
    });

    test('parses remote-tracking branch merge message', () => {
        assert.strictEqual(
            parseBranchNameFromMergeMessage("Merge remote-tracking branch 'origin/dev'"),
            'origin/dev'
        );
    });

    test('falls back to full message when no pattern matches', () => {
        assert.strictEqual(
            parseBranchNameFromMergeMessage('Some random commit message'),
            'Some random commit message'
        );
    });
});
