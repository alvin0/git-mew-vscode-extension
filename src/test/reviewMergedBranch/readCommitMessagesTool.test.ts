import * as assert from 'assert';
import { readCommitMessagesTool } from '../../llm-tools/tools/readCommitMessages';

suite('readCommitMessages Tool', () => {
  test('uses compareBranch merge commit by default and formats returned commit history', async () => {
    let capturedMergeCommitSha = '';
    let capturedLimit = 0;

    const result = await readCommitMessagesTool.execute(
      { maxCount: 2 },
      {
        llmAdapter: {} as any,
        compareBranch: 'abc123mergecommit',
        gitService: {
          async getMergedBranchCommitMessages(mergeCommitSha: string, limit: number) {
            capturedMergeCommitSha = mergeCommitSha;
            capturedLimit = limit;
            return [
              {
                commitSha: '1111111111111111111111111111111111111111',
                authoredAt: new Date('2026-03-01T10:00:00.000Z'),
                author: 'Alice',
                subject: 'feat: add review summary',
                body: 'Adds the initial summary pipeline for merged branch review.',
              },
              {
                commitSha: '2222222222222222222222222222222222222222',
                authoredAt: new Date('2026-03-02T11:00:00.000Z'),
                author: 'Bob',
                subject: 'fix: tighten observer prompt',
                body: '',
              },
            ];
          },
        },
      },
    );

    assert.strictEqual(capturedMergeCommitSha, 'abc123mergecommit');
    assert.strictEqual(capturedLimit, 2);
    assert.ok(result.description.includes('feat: add review summary'));
    assert.ok(result.description.includes('fix: tighten observer prompt'));
    assert.ok(result.description.includes('oldest to newest'));
  });

  test('returns an actionable error when git service is unavailable', async () => {
    const result = await readCommitMessagesTool.execute(
      {},
      { llmAdapter: {} as any },
    );

    assert.ok(result.error);
    assert.ok(result.description.includes('git service was not provided'));
  });
});
