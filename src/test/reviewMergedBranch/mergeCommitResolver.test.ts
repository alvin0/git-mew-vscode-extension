// Feature: review-merged-branch-agent-plan, Property 1: Merge commit parsing trích xuất đầy đủ thông tin
// **Validates: Requirements 1.1**

import * as assert from 'assert';
import * as fc from 'fast-check';

/**
 * Replicate the parsing logic from GitService.getMergedBranches() and
 * GitService.parseBranchNameFromMergeMessage() so we can test the pure
 * parsing pipeline without needing a live git repository.
 *
 * The git log format is: %H|%ai|%an|%s
 * Each line: `${sha}|${date}|${author}|${message}`
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

interface MergedBranchInfo {
    branchName: string;
    mergeCommitSha: string;
    mergeDate: Date;
    mergeAuthor: string;
    mergeMessage: string;
}

function parseGitLogOutput(output: string): MergedBranchInfo[] {
    if (!output.trim()) { return []; }
    return output.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
            const [sha, date, author, ...messageParts] = line.split('|');
            const message = messageParts.join('|');
            return {
                mergeCommitSha: sha,
                mergeDate: new Date(date),
                mergeAuthor: author,
                mergeMessage: message,
                branchName: parseBranchNameFromMergeMessage(message),
            };
        });
}

// ── Generators ──

/** Random 40-char lowercase hex SHA */
const shaArb = fc.stringMatching(/^[0-9a-f]{40}$/);

/** Random ISO-ish date string like git's %ai format: 2024-03-15 10:30:00 +0000 */
const isoDateArb = fc.date({ min: new Date('2020-01-01T00:00:00.000Z'), max: new Date('2026-12-31T23:59:59.999Z'), noInvalidDate: true })
    .map(d => d.toISOString().replace('T', ' ').replace('Z', ' +0000'));

/** Random author name — letters and spaces, no pipe chars */
const authorArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z ]{0,28}[a-zA-Z]$/);

/** Random branch name — alphanumeric with slashes and dashes */
const branchNameArb = fc.stringMatching(/^[a-z][a-z0-9\/_-]{0,38}[a-z0-9]$/);

suite('Property 1: Merge commit parsing extracts complete information', () => {

    test('parsing a standard merge message extracts sha, author, and branchName correctly', () => {
        fc.assert(
            fc.property(
                shaArb, isoDateArb, authorArb, branchNameArb,
                (sha, date, author, branchName) => {
                    const line = `${sha}|${date}|${author}|Merge branch '${branchName}'`;
                    const results = parseGitLogOutput(line);

                    assert.strictEqual(results.length, 1);
                    const result = results[0];
                    assert.strictEqual(result.mergeCommitSha, sha);
                    assert.strictEqual(result.mergeAuthor, author);
                    assert.strictEqual(result.branchName, branchName);
                    assert.strictEqual(result.mergeMessage, `Merge branch '${branchName}'`);
                    assert.ok(result.mergeDate instanceof Date);
                    assert.ok(!isNaN(result.mergeDate.getTime()), 'mergeDate should be a valid date');
                }
            ),
            { numRuns: 150 }
        );
    });

    test('parsing a "merge into" message extracts branchName correctly', () => {
        fc.assert(
            fc.property(
                shaArb, isoDateArb, authorArb, branchNameArb,
                (sha, date, author, branchName) => {
                    const line = `${sha}|${date}|${author}|Merge branch '${branchName}' into main`;
                    const results = parseGitLogOutput(line);

                    assert.strictEqual(results.length, 1);
                    const result = results[0];
                    assert.strictEqual(result.mergeCommitSha, sha);
                    assert.strictEqual(result.mergeAuthor, author);
                    assert.strictEqual(result.branchName, branchName);
                }
            ),
            { numRuns: 150 }
        );
    });

    test('parsing multiple git log lines extracts all entries', () => {
        const entryArb = fc.tuple(shaArb, isoDateArb, authorArb, branchNameArb);
        fc.assert(
            fc.property(
                fc.array(entryArb, { minLength: 1, maxLength: 10 }),
                (entries) => {
                    const output = entries
                        .map(([sha, date, author, branch]) =>
                            `${sha}|${date}|${author}|Merge branch '${branch}'`)
                        .join('\n');

                    const results = parseGitLogOutput(output);
                    assert.strictEqual(results.length, entries.length);

                    for (let i = 0; i < entries.length; i++) {
                        const [sha, , author, branch] = entries[i];
                        assert.strictEqual(results[i].mergeCommitSha, sha);
                        assert.strictEqual(results[i].mergeAuthor, author);
                        assert.strictEqual(results[i].branchName, branch);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
