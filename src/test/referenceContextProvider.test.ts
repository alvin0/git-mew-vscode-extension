import * as assert from 'assert';
import { UnifiedDiffFile } from '../services/llm';
import {
  computeReferenceExpansionTokenCap,
  extractCandidateSymbolsFromDiff,
  shouldAutoExpandReferenceContext,
} from '../commands/reviewShared/referenceContextProvider';

function createDiffFile(relativePath: string, diff: string): UnifiedDiffFile {
  return {
    filePath: `/workspace/${relativePath}`,
    relativePath,
    diff,
    status: 0,
    statusLabel: 'Modified',
    isDeleted: false,
    isBinary: false,
  };
}

suite('ReviewReferenceContextProvider helpers', () => {
  test('extractCandidateSymbolsFromDiff enforces per-file and global limits', () => {
    const fileA = createDiffFile(
      'src/a.ts',
      [
        '@@ -1,2 +1,2 @@',
        '+const FeatureAlpha = buildFeatureAlpha(inputValue)',
        '+const FeatureBeta = buildFeatureBeta(otherValue)',
        '+const FeatureGamma = buildFeatureGamma(thirdValue)',
        '+const FeatureDelta = buildFeatureDelta(extraValue)',
        '+const FeatureEpsilon = buildFeatureEpsilon(lastValue)',
      ].join('\n')
    );
    const fileB = createDiffFile(
      'src/b.ts',
      [
        '@@ -1,2 +1,2 @@',
        '+const HandlerOne = createHandlerOne(payloadOne)',
        '+const HandlerTwo = createHandlerTwo(payloadTwo)',
        '+const HandlerThree = createHandlerThree(payloadThree)',
        '+const HandlerFour = createHandlerFour(payloadFour)',
        '+const HandlerFive = createHandlerFive(payloadFive)',
      ].join('\n')
    );

    const candidates = extractCandidateSymbolsFromDiff([fileA, fileB], 6, 3);
    assert.strictEqual(candidates.length, 6);
    assert.strictEqual(
      candidates.filter((candidate) => candidate.filePath === fileA.filePath).length,
      3
    );
    assert.strictEqual(
      candidates.filter((candidate) => candidate.filePath === fileB.filePath).length,
      3
    );
  });

  test('shouldAutoExpandReferenceContext triggers for hierarchical strategy', () => {
    const decision = shouldAutoExpandReferenceContext({
      mode: 'auto',
      strategy: 'auto',
      effectiveStrategy: 'hierarchical',
      model: 'gpt-4.1',
      contextWindow: 128000,
      systemMessage: 'system',
      directPrompt: 'prompt',
      changedFileCount: 1,
    });

    assert.strictEqual(decision.triggered, true);
    assert.strictEqual(decision.triggerReason, 'hierarchical');
  });

  test('shouldAutoExpandReferenceContext triggers for file-count threshold', () => {
    const decision = shouldAutoExpandReferenceContext({
      mode: 'auto',
      strategy: 'direct',
      model: 'gpt-4.1',
      contextWindow: 128000,
      systemMessage: 'system',
      directPrompt: 'short prompt',
      changedFileCount: 3,
    });

    assert.strictEqual(decision.triggered, true);
    assert.strictEqual(decision.triggerReason, 'file-count');
  });

  test('computeReferenceExpansionTokenCap follows hard cap', () => {
    assert.strictEqual(computeReferenceExpansionTokenCap(16000), 4000);
    assert.strictEqual(computeReferenceExpansionTokenCap(32000), 4500);
    assert.strictEqual(computeReferenceExpansionTokenCap(128000), 4500);
  });
});
