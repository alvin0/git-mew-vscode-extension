// Feature: review-merged-branch-agent-plan, Property 6
// **Validates: Requirements 2.3**

import * as assert from 'assert';
import * as fc from 'fast-check';
import { generateMergedBranchWebviewContent } from '../../commands/reviewMergedBranch/webviewContentGenerator';
import { MergedBranchInfo } from '../../services/utils/gitService';

/**
 * Property-based test for HTML rendering of merged branch information.
 *
 * Verifies that generateMergedBranchWebviewContent() produces HTML
 * containing the branch name, formatted merge date, and merge author
 * for every branch passed in.
 */

// ── Generator ──
// Use safe strings (no HTML special chars) to avoid encoding issues
// when checking for direct containment in the rendered HTML.

const safeBranchInfoArb: fc.Arbitrary<MergedBranchInfo> = fc.record({
    branchName: fc.stringMatching(/^[a-zA-Z0-9\/_-]{1,30}$/),
    mergeCommitSha: fc.stringMatching(/^[0-9a-f]{40}$/),
    mergeDate: fc.date({ min: new Date('2020-01-01'), max: new Date('2026-12-31') }),
    mergeAuthor: fc.stringMatching(/^[a-zA-Z0-9 _-]{1,30}$/),
    mergeMessage: fc.string({ minLength: 1 }),
});

// ── Property 6: Rendered HTML contains complete branch information ──

suite('Property 6: Rendered HTML contains complete branch information', () => {

    test('HTML contains branchName, date string, and mergeAuthor for each branch', () => {
        fc.assert(
            fc.property(
                safeBranchInfoArb,
                (info) => {
                    const html = generateMergedBranchWebviewContent([info]);

                    // branchName should appear in the rendered HTML
                    assert.ok(
                        html.includes(info.branchName),
                        `HTML should contain branchName "${info.branchName}"`
                    );

                    // mergeDate formatted via toLocaleDateString() should appear
                    const dateString = info.mergeDate.toLocaleDateString();
                    assert.ok(
                        html.includes(dateString),
                        `HTML should contain date string "${dateString}"`
                    );

                    // mergeAuthor should appear in the rendered HTML
                    assert.ok(
                        html.includes(info.mergeAuthor),
                        `HTML should contain mergeAuthor "${info.mergeAuthor}"`
                    );
                }
            ),
            { numRuns: 150 }
        );
    });
});
