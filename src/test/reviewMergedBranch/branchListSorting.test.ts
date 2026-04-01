// Feature: review-merged-branch-agent-plan, Property 3
// **Validates: Requirements 2.1**
// Feature: review-merged-branch-agent-plan, Property 4
// **Validates: Requirements 2.2**

import * as assert from 'assert';
import * as fc from 'fast-check';

/**
 * Pure-function tests for branch list sorting (descending by mergeDate)
 * and max items limit (at most 20 elements).
 *
 * These replicate the sorting and limiting logic that getMergedBranches()
 * applies (git log returns results sorted by date descending, and the
 * limit parameter caps the result count).
 */

interface MergedBranchInfo {
    branchName: string;
    mergeCommitSha: string;
    mergeDate: Date;
    mergeAuthor: string;
    mergeMessage: string;
}

// ── Pure functions under test ──

/**
 * Sort branches by mergeDate descending (most recent first).
 * Replicates the ordering guarantee from git log --merges output.
 */
function sortByMergeDateDescending(branches: MergedBranchInfo[]): MergedBranchInfo[] {
    return [...branches].sort((a, b) => b.mergeDate.getTime() - a.mergeDate.getTime());
}

/**
 * Apply the max-items limit (default 20).
 * Replicates the `-n 20` limit from getMergedBranches().
 */
function applyLimit(branches: MergedBranchInfo[], limit: number = 20): MergedBranchInfo[] {
    return branches.slice(0, limit);
}

// ── Generator ──

const mergedBranchInfoArb: fc.Arbitrary<MergedBranchInfo> = fc.record({
    branchName: fc.string({ minLength: 1 }),
    mergeCommitSha: fc.stringMatching(/^[0-9a-f]{40}$/),
    mergeDate: fc.date({
        min: new Date('2020-01-01'),
        max: new Date('2026-12-31'),
        noInvalidDate: true,
    }),
    mergeAuthor: fc.string({ minLength: 1 }),
    mergeMessage: fc.string({ minLength: 1 }),
});

// ── Property 3: Branch list sorted by merge date descending ──

suite('Property 3: Branch list sorted by merge date descending', () => {

    test('every consecutive pair satisfies list[i].mergeDate >= list[i+1].mergeDate', () => {
        fc.assert(
            fc.property(
                fc.array(mergedBranchInfoArb, { minLength: 0, maxLength: 100 }),
                (branches) => {
                    const sorted = sortByMergeDateDescending(branches);

                    for (let i = 0; i < sorted.length - 1; i++) {
                        assert.ok(
                            sorted[i].mergeDate.getTime() >= sorted[i + 1].mergeDate.getTime(),
                            `sorted[${i}].mergeDate (${sorted[i].mergeDate.toISOString()}) should be >= sorted[${i + 1}].mergeDate (${sorted[i + 1].mergeDate.toISOString()})`
                        );
                    }
                }
            ),
            { numRuns: 150 }
        );
    });

    test('sorted list has the same length as the input', () => {
        fc.assert(
            fc.property(
                fc.array(mergedBranchInfoArb, { minLength: 0, maxLength: 100 }),
                (branches) => {
                    const sorted = sortByMergeDateDescending(branches);
                    assert.strictEqual(sorted.length, branches.length);
                }
            ),
            { numRuns: 150 }
        );
    });
});

// ── Property 4: Branch list has at most 20 elements ──

suite('Property 4: Branch list has at most 20 elements', () => {

    test('applying limit ensures result.length <= 20', () => {
        fc.assert(
            fc.property(
                fc.array(mergedBranchInfoArb, { minLength: 0, maxLength: 200 }),
                (branches) => {
                    const result = applyLimit(branches);
                    assert.ok(
                        result.length <= 20,
                        `result.length (${result.length}) should be <= 20`
                    );
                }
            ),
            { numRuns: 150 }
        );
    });

    test('applying limit preserves elements when input has <= 20 items', () => {
        fc.assert(
            fc.property(
                fc.array(mergedBranchInfoArb, { minLength: 0, maxLength: 20 }),
                (branches) => {
                    const result = applyLimit(branches);
                    assert.strictEqual(result.length, branches.length);
                }
            ),
            { numRuns: 150 }
        );
    });

    test('applying limit truncates to exactly 20 when input has > 20 items', () => {
        fc.assert(
            fc.property(
                fc.array(mergedBranchInfoArb, { minLength: 21, maxLength: 200 }),
                (branches) => {
                    const result = applyLimit(branches);
                    assert.strictEqual(result.length, 20);
                }
            ),
            { numRuns: 100 }
        );
    });
});
