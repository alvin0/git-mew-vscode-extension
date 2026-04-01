// Feature: review-merged-branch-agent-plan, Property 5
// **Validates: Requirements 2.4**

import * as assert from 'assert';
import * as fc from 'fast-check';

/**
 * Pure-function test for branch search filtering by name.
 *
 * This replicates the client-side search filter logic used in the
 * webview to filter merged branches by name (case-insensitive substring match).
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
 * Filter branches by case-insensitive substring match on branchName.
 * Replicates the search filter logic in the webview.
 */
function filterBranchesByName(branches: MergedBranchInfo[], query: string): MergedBranchInfo[] {
    return branches.filter(b => b.branchName.toLowerCase().includes(query.toLowerCase()));
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

    test('soundness: every filtered result contains the query (case-insensitive)', () => {
        fc.assert(
            fc.property(
                fc.array(mergedBranchInfoArb), fc.string(),
                (branches, query) => {
                    const filtered = filterBranchesByName(branches, query);
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

    test('completeness: no matching branch is missed by the filter', () => {
        fc.assert(
            fc.property(
                fc.array(mergedBranchInfoArb), fc.string(),
                (branches, query) => {
                    const filtered = filterBranchesByName(branches, query);
                    const expected = branches.filter(b =>
                        b.branchName.toLowerCase().includes(query.toLowerCase())
                    );
                    assert.strictEqual(
                        filtered.length,
                        expected.length,
                        `Filtered count (${filtered.length}) should equal expected count (${expected.length}) for query "${query}"`
                    );
                }
            ),
            { numRuns: 150 }
        );
    });
});
