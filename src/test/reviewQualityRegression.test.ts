import * as assert from 'assert';
import { createHash } from 'crypto';
import { ReviewMemoryService } from '../services/llm/ReviewMemoryService';
import { mergeSynthesisOutputs } from '../services/llm/orchestrator/SynthesisMerger';
import { MultiAgentExecutor } from '../services/llm/orchestrator/MultiAgentExecutor';
import { AdapterCalibrationService } from '../services/llm/orchestrator/AdapterCalibrationService';
import { TokenEstimatorService } from '../services/llm/TokenEstimatorService';
import {
  AgentPrompt,
  DEFAULT_ORCHESTRATOR_CONFIG,
  StructuredAgentReport,
} from '../services/llm/orchestrator/orchestratorTypes';

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function createExecutor(): MultiAgentExecutor {
  return new MultiAgentExecutor(
    { ...DEFAULT_ORCHESTRATOR_CONFIG },
    new AdapterCalibrationService({ ...DEFAULT_ORCHESTRATOR_CONFIG }, new TokenEstimatorService()),
    new TokenEstimatorService(),
  );
}

suite('Review Quality Regressions', () => {
  test('suppressFinding stores normalizedDescription from finding description, not dismiss reason', async () => {
    const service = new ReviewMemoryService();
    const description = 'Null Check Missing In Auth Flow';

    await service.suppressFinding({
      filePattern: 'src/**/*.ts',
      issueCategory: 'correctness',
      description,
      descriptionHash: sha256(normalize(description)),
      dismissedAt: Date.now(),
    });

    const suppressed = await service.getSuppressedFindings();
    assert.strictEqual(suppressed.length, 1);
    assert.strictEqual(suppressed[0].normalizedDescription, 'null check missing in auth flow');

    const matched = await service.isFindingSuppressed({
      file: 'src/auth/login.ts',
      category: 'correctness',
      description,
    });
    assert.strictEqual(matched, true);
  });

  test('decayPatterns runs at most once per 24 hours', async () => {
    const service = new ReviewMemoryService();
    const now = Date.now();

    await (service as any).write('patterns', [{
      id: 'pattern-1',
      description: 'Old recurring issue',
      category: 'correctness',
      frequencyCount: 4,
      firstSeen: now - 40 * 24 * 60 * 60 * 1000,
      lastSeen: now - 31 * 24 * 60 * 60 * 1000,
      filePatterns: ['src/**/*.ts'],
      averageSeverity: 'major',
      sourceAgents: ['Code Reviewer'],
    }]);

    await service.decayPatterns();
    let patterns = await (service as any).read('patterns');
    assert.strictEqual(patterns[0].frequencyCount, 2);

    await service.decayPatterns();
    patterns = await (service as any).read('patterns');
    assert.strictEqual(patterns[0].frequencyCount, 2);
  });

  test('recordResolution keeps only the newest 1000 records', async () => {
    const service = new ReviewMemoryService();

    for (let index = 0; index < 1005; index++) {
      await service.recordResolution(`CR:correctness:src/file-${index}.ts`, 'resolved', `review-${index}`);
    }

    const records = await (service as any).read('resolutions');
    assert.strictEqual(records.length, 1000);
    assert.strictEqual(records[0].reviewId, 'review-1004');
  });

  test('mergeSynthesisOutputs suppresses findings by exact SHA-256 description hash', () => {
    const description = 'Missing null check in authentication flow';
    const reports: StructuredAgentReport[] = [{
      role: 'Code Reviewer',
      structured: {
        issues: [{
          file: 'src/auth.ts',
          location: 'line 12',
          severity: 'major',
          category: 'correctness',
          description,
          suggestion: 'Add a guard clause',
          confidence: 0.9,
        }],
        affectedSymbols: ['login'],
        qualityVerdict: 'Not Bad',
      },
      raw: '{"issues":[]}',
    }];

    const output = mergeSynthesisOutputs(
      new Map(),
      [{ relativePath: 'src/auth.ts', statusLabel: 'modified', diff: '+x' } as any],
      reports,
      [{
        filePattern: 'src/**/*.ts',
        issueCategory: 'correctness',
        descriptionHash: sha256(normalize(description)),
        dismissedAt: Date.now(),
      }],
      100,
      '### What Changed\nFallback detail',
    );

    assert.ok(!output.includes(description));
  });

  test('applyStructuredAudit removes observer todo items when removals target todo indices', () => {
    const executor = createExecutor();
    const previousAnalysis = JSON.stringify({
      risks: [{ description: 'Risk A', severity: 'high', affectedArea: 'src/a.ts' }],
      todoItems: [{ action: 'Todo A', parallelizable: true }],
      integrationConcerns: [],
    });

    const merged = (executor as any).applyStructuredAudit(
      { outputSchema: 'observer' } as AgentPrompt,
      previousAnalysis,
      {
        verdict: 'NEEDS_REVISION',
        issues: [],
        additions: [],
        removals: [{ findingIndex: 1, reason: 'remove todo' }],
      },
    );

    const parsed = JSON.parse(merged);
    assert.strictEqual(parsed.risks.length, 1);
    assert.strictEqual(parsed.todoItems.length, 0);
  });

  test('extractJsonBody returns the first valid JSON object instead of greedy overmatch', () => {
    const executor = createExecutor();
    const extracted = (executor as any).extractJsonBody(
      'prefix {"first":1} middle text {"second":2}',
    );

    assert.strictEqual(extracted, '{"first":1}');
  });
});
