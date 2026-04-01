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

    test('webview result handler does not depend on description-only tab state', () => {
        const html = generateMergedBranchWebviewContent([]);

        assert.ok(
            html.includes('Review ready'),
            'Merged branch webview should use the single-review result handler'
        );
        assert.ok(
            !html.includes('Switch tabs to inspect the review and MR description.'),
            'Merged branch webview should not use the tabbed review/description result copy'
        );
        assert.ok(
            !html.includes('descriptionTab.classList'),
            'Merged branch webview script should not toggle a missing description tab'
        );
        assert.ok(
            !html.includes("currentDescription = ''"),
            'Merged branch webview script should not reference description-only state'
        );
    });

    test('webview exposes review and diff tabs for merged branch output', () => {
        const html = generateMergedBranchWebviewContent([]);

        assert.ok(
            html.includes('data-tab="review"'),
            'Merged branch webview should expose a review tab'
        );
        assert.ok(
            html.includes('data-tab="diff"'),
            'Merged branch webview should expose a diff tab'
        );
        assert.ok(
            html.includes('id="diff-tab"'),
            'Merged branch webview should render a diff pane'
        );
        assert.ok(
            html.includes('function switchTab(targetTab)'),
            'Merged branch webview should define tab switching logic'
        );
    });

    test('webview limits initial branch rendering and searches older branches via extension messages', () => {
        const html = generateMergedBranchWebviewContent([]);

        assert.ok(
            html.includes('Showing the 20 most recent merged branches'),
            'Merged branch webview should explain the top-20 default list'
        );
        assert.ok(
            html.includes("command: 'searchMergedBranches'"),
            'Merged branch webview should trigger server-side branch search'
        );
        assert.ok(
            !html.includes("item.style.display = name.includes(query) ? '' : 'none';"),
            'Merged branch webview should not filter large branch lists purely client-side'
        );
    });

    test('webview renders at most 20 initial merged branch items', () => {
        const branches: MergedBranchInfo[] = Array.from({ length: 25 }, (_, index) => ({
            branchName: `feature/${index}`,
            mergeCommitSha: `${index}`.padStart(40, '0'),
            mergeDate: new Date(`2026-03-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`),
            mergeAuthor: `author-${index}`,
            mergeMessage: `Merge branch 'feature/${index}' into main`,
        }));

        const html = generateMergedBranchWebviewContent(branches);

        assert.ok(
            html.includes('feature/19'),
            'Merged branch webview should keep the 20th visible branch in the initial HTML'
        );
        assert.ok(
            !html.includes('feature/20'),
            'Merged branch webview should not include branches beyond the initial top-20 window'
        );
    });
});
