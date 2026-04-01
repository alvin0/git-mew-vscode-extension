// Feature: review-merged-branch-agent-plan, Property 5
// **Validates: Requirements 2.4**

import * as assert from 'assert';
import * as fc from 'fast-check';

/**
 * Pure-function test for merged branch search by name.
 *
 * This replicates the effective UX contract: search is case-insensitive,
 * results remain sorted by mergeDate DESC, and the UI caps results to 20.
 */

interface MergedBranchInfo {
    branchName: string;
    mergeCommitSha: string;
    mergeDate: Date;
    mergeAuthor: string;
    mergeMessage: string;
}

// ── Pure function under test ──

/**
 * Filter branches by case-insensitive substring match on branchName,
 * then keep the most recent matches first and cap the result size.
 */
function searchBranchesByName(branches: MergedBranchInfo[], query: string, limit: number = 20): MergedBranchInfo[] {
    return branches
        .filter(b => b.branchName.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => b.mergeDate.getTime() - a.mergeDate.getTime())
        .slice(0, limit);
}

// ── Generator ──

const mergedBranchInfoArb: fc.Arbitrary<MergedBranchInfo> = fc.record({
    branchName: fc.string({ minLength: 1 }),
    mergeCommitSha: fc.stringMatching(/^[0-9a-f]{40}$/),
    mergeDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2026-12-31') }),
    mergeAuthor: fc.string({ minLength: 1 }),
    mergeMessage: fc.string({ minLength: 1 }),
});

// ── Property 5: Branch search filters correctly by name ──

suite('Property 5: Branch search filters correctly by name', () => {

    test('soundness: every search result contains the query (case-insensitive)', () => {
        fc.assert(
            fc.property(
                fc.array(mergedBranchInfoArb), fc.string(),
                (branches, query) => {
                    const filtered = searchBranchesByName(branches, query);
                    const lowerQuery = query.toLowerCase();
                    for (const b of filtered) {
                        assert.ok(
                            b.branchName.toLowerCase().includes(lowerQuery),
                            `Filtered branch "${b.branchName}" should contain query "${query}" (case-insensitive)`
                        );
                    }
                }
            ),
            { numRuns: 150 }
        );
    });

    test('results stay sorted by mergeDate descending', () => {
        fc.assert(
            fc.property(
                fc.array(mergedBranchInfoArb), fc.string(),
                (branches, query) => {
                    const filtered = searchBranchesByName(branches, query);
                    for (let i = 0; i < filtered.length - 1; i++) {
                        assert.ok(
                            filtered[i].mergeDate.getTime() >= filtered[i + 1].mergeDate.getTime(),
                            `Search result at ${i} should be newer than or equal to result at ${i + 1}`
                        );
                    }
                }
            ),
            { numRuns: 150 }
        );
    });

    test('search results are capped at 20 items', () => {
        fc.assert(
            fc.property(
                fc.array(mergedBranchInfoArb, { minLength: 0, maxLength: 200 }),
                fc.string(),
                (branches, query) => {
                    const filtered = searchBranchesByName(branches, query);
                    assert.ok(filtered.length <= 20);
                }
            ),
            { numRuns: 150 }
        );
    });
});
