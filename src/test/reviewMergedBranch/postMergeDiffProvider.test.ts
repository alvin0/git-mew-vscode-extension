// Feature: review-merged-branch-agent-plan, Property 2: Diff parsing tạo UnifiedDiffFile[] hợp lệ
// **Validates: Requirements 1.2, 1.5**

import * as assert from 'assert';
import * as fc from 'fast-check';

/**
 * Replicate the parsing logic from GitService.getMergedBranchDiff(),
 * mapGitStatusChar(), mapGitStatusLabel(), and renderBranchDiffFiles()
 * so we can test the pure parsing pipeline without needing a live git repository.
 *
 * The git diff --name-status output format is:
 *   STATUS\tfilePath
 * e.g. "M\tsrc/index.ts" or "A\tREADME.md"
 */

// ── Replicated GitStatus enum values ──
const GitStatus = {
    INDEX_MODIFIED: 0,
    INDEX_ADDED: 1,
    INDEX_DELETED: 2,
    INDEX_RENAMED: 3,
    INDEX_COPIED: 4,
    MODIFIED: 5,
    DELETED: 6,
} as const;

// ── Replicated types ──
interface UnifiedDiffFile {
    filePath: string;
    relativePath: string;
    diff: string;
    status: number;
    statusLabel: string;
    isDeleted: boolean;
    isBinary: boolean;
    originalFilePath?: string;
}

// ── Replicated parsing functions from GitService ──

function mapGitStatusChar(statusChar: string): number {
    const map: Record<string, number> = {
        'A': GitStatus.INDEX_ADDED,
        'M': GitStatus.MODIFIED,
        'D': GitStatus.INDEX_DELETED,
        'R': GitStatus.INDEX_RENAMED,
        'C': GitStatus.INDEX_COPIED,
    };
    return map[statusChar] ?? GitStatus.MODIFIED;
}

function mapGitStatusLabel(statusChar: string): string {
    const map: Record<string, string> = {
        'A': 'Added', 'M': 'Modified', 'D': 'Deleted',
        'R': 'Renamed', 'C': 'Copied',
    };
    return map[statusChar] ?? 'Modified';
}

/**
 * Parse git diff --name-status output into file entries, then build
 * UnifiedDiffFile[] with provided diff content per file.
 * Replicates the core logic of getMergedBranchDiff() without git calls.
 */
function parseNameStatusAndBuildDiffFiles(
    nameStatusOutput: string,
    diffContentByFile: Record<string, string>,
    workspaceRoot: string = '/workspace'
): UnifiedDiffFile[] {
    if (!nameStatusOutput.trim()) { return []; }

    const fileEntries = nameStatusOutput.trim().split('\n')
        .filter(line => line.trim())
        .map(line => {
            const parts = line.split('\t');
            const status = parts[0].charAt(0);
            const filePath = parts[parts.length - 1];
            const originalPath = parts.length > 2 ? parts[1] : undefined;
            return { status, filePath, originalPath };
        });

    return fileEntries.map(entry => {
        const fullPath = `${workspaceRoot}/${entry.filePath}`;
        const diff = diffContentByFile[entry.filePath] || `diff --git a/${entry.filePath} b/${entry.filePath}\n--- a/${entry.filePath}\n+++ b/${entry.filePath}\n@@ -1,1 +1,1 @@\n-old\n+new`;
        return {
            filePath: fullPath,
            relativePath: entry.filePath,
            diff,
            status: mapGitStatusChar(entry.status),
            statusLabel: mapGitStatusLabel(entry.status),
            isDeleted: entry.status === 'D',
            isBinary: false,
            originalFilePath: entry.originalPath ? `${workspaceRoot}/${entry.originalPath}` : undefined,
        };
    });
}

/**
 * Replicate renderBranchDiffFiles() from GitService.
 */
function renderBranchDiffFiles(files: UnifiedDiffFile[]): string {
    if (files.length === 0) {
        return 'No differences found between the branches.';
    }

    return files.map((file) => {
        let markdown = `\n## ${file.statusLabel}: ${file.relativePath}\n`;
        if (file.isBinary) {
            markdown += '\nBinary file change\n';
            return markdown;
        }
        if (file.diff && file.diff !== 'No diff available') {
            markdown += '\n```diff\n';
            markdown += file.diff;
            markdown += '\n```\n';
        }
        return markdown;
    }).join('').trim() || 'No detailed diff available.';
}

// ── Generators ──

/** Random file path segments — alphanumeric with common extensions */
const fileSegmentArb = fc.stringMatching(/^[a-z][a-z0-9_-]{0,14}$/);
const fileExtArb = fc.constantFrom('.ts', '.js', '.py', '.md', '.json', '.css', '.html');
const relativePathArb = fc.tuple(
    fc.array(fileSegmentArb, { minLength: 0, maxLength: 3 }),
    fileSegmentArb,
    fileExtArb
).map(([dirs, name, ext]) => [...dirs, `${name}${ext}`].join('/'));

/** Random git status characters */
const statusCharArb = fc.constantFrom('A', 'M', 'D');

/** Random diff hunk content */
const diffHunkArb = fc.tuple(relativePathArb, fc.nat({ max: 500 }), fc.nat({ max: 20 }))
    .map(([filePath, startLine, lineCount]) => {
        const start = startLine + 1;
        return `diff --git a/${filePath} b/${filePath}\n--- a/${filePath}\n+++ b/${filePath}\n@@ -${start},${lineCount} +${start},${lineCount} @@\n-old line\n+new line`;
    });

/** A single name-status entry with its diff content */
const fileEntryArb = fc.tuple(statusCharArb, relativePathArb, diffHunkArb)
    .map(([status, filePath, diffContent]) => ({
        nameStatusLine: `${status}\t${filePath}`,
        filePath,
        diffContent,
    }));

suite('Property 2: Diff parsing creates valid UnifiedDiffFile[]', () => {

    test('each parsed UnifiedDiffFile has all required non-empty fields', () => {
        fc.assert(
            fc.property(
                fc.array(fileEntryArb, { minLength: 1, maxLength: 10 }),
                (entries) => {
                    const nameStatusOutput = entries.map(e => e.nameStatusLine).join('\n');
                    const diffContentByFile: Record<string, string> = {};
                    for (const entry of entries) {
                        diffContentByFile[entry.filePath] = entry.diffContent;
                    }

                    const changes = parseNameStatusAndBuildDiffFiles(nameStatusOutput, diffContentByFile);

                    assert.strictEqual(changes.length, entries.length);

                    for (const file of changes) {
                        assert.ok(file.filePath !== '', 'filePath must not be empty');
                        assert.ok(file.relativePath !== '', 'relativePath must not be empty');
                        assert.ok(file.diff !== '', 'diff must not be empty');
                        assert.ok(file.statusLabel !== '', 'statusLabel must not be empty');
                    }
                }
            ),
            { numRuns: 150 }
        );
    });

    test('diff rendered string is not empty when there is at least 1 file', () => {
        fc.assert(
            fc.property(
                fc.array(fileEntryArb, { minLength: 1, maxLength: 10 }),
                (entries) => {
                    const nameStatusOutput = entries.map(e => e.nameStatusLine).join('\n');
                    const diffContentByFile: Record<string, string> = {};
                    for (const entry of entries) {
                        diffContentByFile[entry.filePath] = entry.diffContent;
                    }

                    const changes = parseNameStatusAndBuildDiffFiles(nameStatusOutput, diffContentByFile);
                    const rendered = renderBranchDiffFiles(changes);

                    assert.ok(rendered.length > 0, 'rendered diff string must not be empty');
                    assert.ok(rendered !== 'No differences found between the branches.',
                        'rendered diff should not be the empty-state message when files exist');
                }
            ),
            { numRuns: 150 }
        );
    });

    test('status mapping produces correct labels for known status chars', () => {
        fc.assert(
            fc.property(
                statusCharArb, relativePathArb,
                (status, filePath) => {
                    const nameStatusOutput = `${status}\t${filePath}`;
                    const changes = parseNameStatusAndBuildDiffFiles(nameStatusOutput, {});

                    assert.strictEqual(changes.length, 1);
                    const file = changes[0];

                    const expectedLabels: Record<string, string> = {
                        'A': 'Added', 'M': 'Modified', 'D': 'Deleted',
                    };
                    assert.strictEqual(file.statusLabel, expectedLabels[status]);
                    assert.strictEqual(file.isDeleted, status === 'D');
                }
            ),
            { numRuns: 150 }
        );
    });

    test('empty name-status output produces empty array', () => {
        const changes = parseNameStatusAndBuildDiffFiles('', {});
        assert.strictEqual(changes.length, 0);

        const rendered = renderBranchDiffFiles(changes);
        assert.strictEqual(rendered, 'No differences found between the branches.');
    });
});
