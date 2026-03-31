import * as assert from 'assert';
import { RiskHypothesisGenerator } from '../services/llm/orchestrator/RiskHypothesisGenerator';
import { TokenEstimatorService } from '../services/llm/TokenEstimatorService';
import {
  CodeReviewerOutput,
  FlowDiagramOutput,
  DependencyGraphData,
  RiskHypothesis,
} from '../services/llm/orchestrator/orchestratorTypes';
import {
  ILLMAdapter,
  GenerateResponse,
  GenerateOptions,
  LLMAdapterConfig,
} from '../llm-adapter/adapterInterface';

// ── Mock ILLMAdapter ──

function createMockAdapter(overrides?: {
  generateTextFn?: (prompt: string, options?: GenerateOptions) => Promise<GenerateResponse>;
}): ILLMAdapter {
  return {
    initialize: async (_config: LLMAdapterConfig) => {},
    generateText: overrides?.generateTextFn ?? (async () => ({
      text: '[]',
      model: 'mock-model',
    })),
    isReady: () => true,
    getModel: () => 'mock-model',
    getProvider: () => 'openai',
    getContextWindow: () => 200000,
    getMaxOutputTokens: () => 4096,
    testConnection: async () => true,
  };
}

// ── Helpers ──

function emptyGraph(): DependencyGraphData {
  return {
    fileDependencies: new Map(),
    symbolMap: new Map(),
    criticalPaths: [],
  };
}

function emptyCR(): CodeReviewerOutput {
  return { issues: [], affectedSymbols: [], qualityVerdict: 'Good' };
}

function emptyFD(): FlowDiagramOutput {
  return { diagrams: [], affectedFlows: [] };
}

function createGenerator(): RiskHypothesisGenerator {
  return new RiskHypothesisGenerator(new TokenEstimatorService());
}

function assertValidHypothesis(h: RiskHypothesis): void {
  assert.ok(typeof h.question === 'string' && h.question.length > 0, `question must be non-empty string, got: "${h.question}"`);
  assert.ok(Array.isArray(h.affectedFiles), 'affectedFiles must be an array');
  h.affectedFiles.forEach(f => assert.ok(typeof f === 'string', `affectedFile must be string, got: ${typeof f}`));
  assert.ok(typeof h.evidenceNeeded === 'string' && h.evidenceNeeded.length > 0, `evidenceNeeded must be non-empty string, got: "${h.evidenceNeeded}"`);
  assert.ok(['high', 'medium', 'low'].includes(h.severityEstimate), `severityEstimate must be high|medium|low, got: "${h.severityEstimate}"`);
  assert.ok(['heuristic', 'llm'].includes(h.source), `source must be heuristic|llm, got: "${h.source}"`);
}

suite('RiskHypothesisGenerator', () => {

  // ── Rule 1: API change — symbol in changed file with >= 2 references ──

  test('Rule 1 (API change): symbol in changed file with 3 references → hypothesis about consumer impact', async () => {
    const gen = createGenerator();
    const cr: CodeReviewerOutput = {
      issues: [{ file: 'src/api.ts', location: '10', severity: 'minor', category: 'maintainability', description: 'refactored API', suggestion: 'ok' }],
      affectedSymbols: ['fetchData'],
      qualityVerdict: 'Good',
    };
    const graph: DependencyGraphData = {
      fileDependencies: new Map(),
      symbolMap: new Map([
        ['fetchData', { definedIn: 'src/api.ts', referencedBy: ['src/a.ts', 'src/b.ts', 'src/c.ts'], type: 'function' }],
      ]),
      criticalPaths: [],
    };

    const result = await gen.generate(cr, emptyFD(), graph, createMockAdapter());

    const rule1 = result.find(h => h.question.includes('fetchData'));
    assert.ok(rule1, 'Should generate hypothesis about fetchData');
    assert.ok(rule1!.question.includes('consumers') || rule1!.question.includes('3'), 'Should mention consumers or count');
    assert.ok(rule1!.affectedFiles.includes('src/api.ts'), 'Should include the defining file');
    assert.ok(rule1!.affectedFiles.includes('src/a.ts'), 'Should include consumer files');
    assert.strictEqual(rule1!.source, 'heuristic');
    assertValidHypothesis(rule1!);
  });

  // ── Rule 2: Cross-file chain — criticalPath with >= 3 changed files ──

  test('Rule 2 (Cross-file chain): criticalPath with 3 changed files → hypothesis about data flow consistency', async () => {
    const gen = createGenerator();
    const graph: DependencyGraphData = {
      fileDependencies: new Map(),
      symbolMap: new Map(),
      criticalPaths: [
        { files: ['src/a.ts', 'src/b.ts', 'src/c.ts'], changedFileCount: 3, description: 'A → B → C' },
      ],
    };

    const result = await gen.generate(emptyCR(), emptyFD(), graph, createMockAdapter());

    const rule2 = result.find(h => h.question.includes('data flow') || h.question.includes('dependency chain') || h.question.includes('consistent'));
    assert.ok(rule2, 'Should generate hypothesis about data flow consistency');
    assert.ok(rule2!.affectedFiles.length >= 3, 'Should include all files in the chain');
    assert.strictEqual(rule2!.source, 'heuristic');
    assertValidHypothesis(rule2!);
  });

  // ── Rule 3: Deleted export — CR issue with severity 'critical' ──

  test('Rule 3 (Deleted export): CR issue with severity critical → hypothesis about consumers', async () => {
    const gen = createGenerator();
    const cr: CodeReviewerOutput = {
      issues: [{
        file: 'src/service.ts',
        location: '5',
        severity: 'critical',
        category: 'correctness',
        description: 'exported function removed',
        suggestion: 'check consumers',
      }],
      affectedSymbols: ['doWork'],
      qualityVerdict: 'Critical',
    };
    const graph: DependencyGraphData = {
      fileDependencies: new Map([
        ['src/service.ts', { imports: [], importedBy: ['src/handler.ts', 'src/controller.ts'] }],
      ]),
      symbolMap: new Map(),
      criticalPaths: [],
    };

    const result = await gen.generate(cr, emptyFD(), graph, createMockAdapter());

    const rule3 = result.find(h => h.question.includes('Critical issue') || h.question.includes('consumers'));
    assert.ok(rule3, 'Should generate hypothesis about consumers of critical issue');
    assert.ok(rule3!.affectedFiles.includes('src/service.ts'), 'Should include the file with the issue');
    assert.strictEqual(rule3!.severityEstimate, 'high');
    assertValidHypothesis(rule3!);
  });

  // ── Rule 4: New dependency — CR issue mentioning 'import' ──

  test('Rule 4 (New dependency): CR issue mentioning import → hypothesis about circular dependency', async () => {
    const gen = createGenerator();
    const cr: CodeReviewerOutput = {
      issues: [{
        file: 'src/module.ts',
        location: '1',
        severity: 'minor',
        category: 'maintainability',
        description: 'new import added from external package',
        suggestion: 'verify necessity',
      }],
      affectedSymbols: [],
      qualityVerdict: 'Good',
    };

    const result = await gen.generate(cr, emptyFD(), emptyGraph(), createMockAdapter());

    const rule4 = result.find(h => h.question.toLowerCase().includes('circular') || h.question.toLowerCase().includes('dependencies'));
    assert.ok(rule4, 'Should generate hypothesis about circular dependencies');
    assert.ok(rule4!.affectedFiles.includes('src/module.ts'), 'Should include the file with the import issue');
    assert.strictEqual(rule4!.severityEstimate, 'medium');
    assertValidHypothesis(rule4!);
  });

  // ── Rule 5: Error handling — CR issue with category 'correctness' ──

  test('Rule 5 (Error handling): CR issue with category correctness → hypothesis about caller preparedness', async () => {
    const gen = createGenerator();
    const cr: CodeReviewerOutput = {
      issues: [{
        file: 'src/parser.ts',
        location: '20',
        severity: 'major',
        category: 'correctness',
        description: 'missing null check in parser',
        suggestion: 'add null guard',
      }],
      affectedSymbols: ['parse'],
      qualityVerdict: 'Not Bad',
    };

    const result = await gen.generate(cr, emptyFD(), emptyGraph(), createMockAdapter());

    const rule5 = result.find(h => h.question.includes('Correctness') || h.question.includes('callers'));
    assert.ok(rule5, 'Should generate hypothesis about caller preparedness');
    assert.ok(rule5!.affectedFiles.includes('src/parser.ts'), 'Should include the file with correctness issue');
    assert.strictEqual(rule5!.severityEstimate, 'high');
    assertValidHypothesis(rule5!);
  });

  // ── Rule 6: Config change — file matching *.config.ts ──

  test('Rule 6 (Config change): changed file matching *.config.ts → hypothesis about environment compatibility', async () => {
    const gen = createGenerator();
    const cr: CodeReviewerOutput = {
      issues: [{
        file: 'src/app.config.ts',
        location: '3',
        severity: 'minor',
        category: 'maintainability',
        description: 'updated timeout value',
        suggestion: 'verify across envs',
      }],
      affectedSymbols: [],
      qualityVerdict: 'Good',
    };
    const graph: DependencyGraphData = {
      fileDependencies: new Map([
        ['src/app.config.ts', { imports: [], importedBy: [] }],
      ]),
      symbolMap: new Map(),
      criticalPaths: [],
    };

    const result = await gen.generate(cr, emptyFD(), graph, createMockAdapter());

    const rule6 = result.find(h => h.question.includes('Configuration') || h.question.includes('environment'));
    assert.ok(rule6, 'Should generate hypothesis about environment compatibility');
    assert.ok(rule6!.affectedFiles.some(f => f.includes('config')), 'Should include config file');
    assert.strictEqual(rule6!.severityEstimate, 'medium');
    assertValidHypothesis(rule6!);
  });

  // ── Rule 7: Test gap — CR issue with category 'testing' ──

  test('Rule 7 (Test gap): CR issue with category testing → hypothesis about test coverage', async () => {
    const gen = createGenerator();
    const cr: CodeReviewerOutput = {
      issues: [{
        file: 'src/validator.ts',
        location: '15',
        severity: 'minor',
        category: 'testing',
        description: 'no test coverage for new validation logic',
        suggestion: 'add unit tests',
      }],
      affectedSymbols: ['validate'],
      qualityVerdict: 'Not Bad',
    };

    const result = await gen.generate(cr, emptyFD(), emptyGraph(), createMockAdapter());

    const rule7 = result.find(h => h.question.includes('Testing') || h.question.includes('test coverage'));
    assert.ok(rule7, 'Should generate hypothesis about test coverage');
    assert.ok(rule7!.affectedFiles.includes('src/validator.ts'), 'Should include the file with testing issue');
    assert.strictEqual(rule7!.severityEstimate, 'medium');
    assertValidHypothesis(rule7!);
  });

  // ── Rule 8: Schema change — issue containing "migration" keyword ──

  test('Rule 8 (Schema change): CR issue containing migration keyword → hypothesis about query/DTO updates', async () => {
    const gen = createGenerator();
    const cr: CodeReviewerOutput = {
      issues: [{
        file: 'src/db/migration-001.ts',
        location: '1',
        severity: 'major',
        category: 'correctness',
        description: 'database migration adds new column',
        suggestion: 'update DTOs',
      }],
      affectedSymbols: [],
      qualityVerdict: 'Not Bad',
    };

    const result = await gen.generate(cr, emptyFD(), emptyGraph(), createMockAdapter());

    const rule8 = result.find(h => h.question.includes('Schema') || h.question.includes('queries') || h.question.includes('DTOs'));
    assert.ok(rule8, 'Should generate hypothesis about schema/DTO updates');
    assert.ok(rule8!.affectedFiles.some(f => f.includes('migration')), 'Should include migration file');
    assert.strictEqual(rule8!.severityEstimate, 'high');
    assertValidHypothesis(rule8!);
  });

  // ── generate() with all rules triggering: max 8 hypotheses ──

  test('generate() with all rules triggering: returns at most 8 hypotheses', async () => {
    const gen = createGenerator();

    // CR output that triggers rules 3, 4, 5, 6, 7, 8
    const cr: CodeReviewerOutput = {
      issues: [
        { file: 'src/api.ts', location: '1', severity: 'critical', category: 'correctness', description: 'critical import change with migration impact', suggestion: 'fix' },
        { file: 'src/module.ts', location: '2', severity: 'minor', category: 'testing', description: 'new import added', suggestion: 'test' },
        { file: 'src/app.config.ts', location: '3', severity: 'minor', category: 'maintainability', description: 'config updated', suggestion: 'verify' },
      ],
      affectedSymbols: ['fetchData', 'processData'],
      qualityVerdict: 'Critical',
    };

    // Graph that triggers rules 1 and 2
    const graph: DependencyGraphData = {
      fileDependencies: new Map([
        ['src/api.ts', { imports: [], importedBy: ['src/handler.ts', 'src/controller.ts'] }],
        ['src/app.config.ts', { imports: [], importedBy: [] }],
      ]),
      symbolMap: new Map([
        ['fetchData', { definedIn: 'src/api.ts', referencedBy: ['src/a.ts', 'src/b.ts', 'src/c.ts'], type: 'function' }],
        ['processData', { definedIn: 'src/api.ts', referencedBy: ['src/d.ts', 'src/e.ts'], type: 'function' }],
      ]),
      criticalPaths: [
        { files: ['src/api.ts', 'src/module.ts', 'src/handler.ts'], changedFileCount: 3, description: 'chain' },
      ],
    };

    const result = await gen.generate(cr, emptyFD(), graph, createMockAdapter());

    assert.ok(result.length <= 8, `Should return at most 8 hypotheses, got ${result.length}`);
    assert.ok(result.length > 0, 'Should return at least some hypotheses');
    result.forEach(h => assertValidHypothesis(h));
  });

  // ── generate() with LLM call success ──

  test('generate() with LLM call success: LLM hypotheses have source llm, total ≤ 8', async () => {
    const gen = createGenerator();
    const cr: CodeReviewerOutput = {
      issues: [{ file: 'src/a.ts', location: '1', severity: 'minor', category: 'maintainability', description: 'minor change', suggestion: 'ok' }],
      affectedSymbols: [],
      qualityVerdict: 'Good',
    };

    const llmResponse: GenerateResponse = {
      text: JSON.stringify([
        { question: 'LLM risk: could the refactor break the auth flow?', affectedFiles: ['src/auth.ts'], evidenceNeeded: 'check auth tests', severityEstimate: 'high' },
        { question: 'LLM risk: is the error boundary handling updated?', affectedFiles: ['src/error.ts'], evidenceNeeded: 'review error boundary', severityEstimate: 'medium' },
      ]),
      model: 'mock-model',
    };

    const adapter = createMockAdapter({
      generateTextFn: async () => llmResponse,
    });

    const result = await gen.generate(cr, emptyFD(), emptyGraph(), adapter);

    assert.ok(result.length <= 8, `Total should be ≤ 8, got ${result.length}`);
    const llmHypotheses = result.filter(h => h.source === 'llm');
    assert.ok(llmHypotheses.length >= 1, 'Should have at least 1 LLM hypothesis');
    llmHypotheses.forEach(h => {
      assert.strictEqual(h.source, 'llm');
      assertValidHypothesis(h);
    });
  });

  // ── generate() with LLM call failure ──

  test('generate() with LLM call failure: returns heuristic hypotheses only, no error thrown', async () => {
    const gen = createGenerator();
    const cr: CodeReviewerOutput = {
      issues: [{ file: 'src/a.ts', location: '1', severity: 'major', category: 'correctness', description: 'bug found', suggestion: 'fix' }],
      affectedSymbols: [],
      qualityVerdict: 'Not Bad',
    };

    const adapter = createMockAdapter({
      generateTextFn: async () => { throw new Error('LLM service unavailable'); },
    });

    // Should not throw
    const result = await gen.generate(cr, emptyFD(), emptyGraph(), adapter);

    assert.ok(Array.isArray(result), 'Should return an array');
    result.forEach(h => {
      assert.strictEqual(h.source, 'heuristic', 'All hypotheses should be heuristic when LLM fails');
      assertValidHypothesis(h);
    });
  });

  // ── generate() with LLM returning invalid JSON ──

  test('generate() with LLM returning invalid JSON: falls back to heuristic hypotheses only', async () => {
    const gen = createGenerator();
    const cr: CodeReviewerOutput = {
      issues: [{ file: 'src/a.ts', location: '1', severity: 'major', category: 'correctness', description: 'issue found', suggestion: 'fix' }],
      affectedSymbols: [],
      qualityVerdict: 'Not Bad',
    };

    const adapter = createMockAdapter({
      generateTextFn: async () => ({
        text: 'This is not valid JSON at all {{{',
        model: 'mock-model',
      }),
    });

    const result = await gen.generate(cr, emptyFD(), emptyGraph(), adapter);

    assert.ok(Array.isArray(result), 'Should return an array');
    result.forEach(h => {
      assert.strictEqual(h.source, 'heuristic', 'All hypotheses should be heuristic when LLM returns invalid JSON');
      assertValidHypothesis(h);
    });
  });

  // ── generate() with empty Phase 1 findings ──

  test('generate() with empty Phase 1 findings: returns empty array or minimal hypotheses from graph only', async () => {
    const gen = createGenerator();

    const result = await gen.generate(emptyCR(), emptyFD(), emptyGraph(), createMockAdapter());

    assert.ok(Array.isArray(result), 'Should return an array');
    // With empty CR, empty FD, and empty graph, no heuristic rules trigger
    // LLM may return empty too since summaries are empty
    assert.ok(result.length <= 8, 'Should respect max limit');
    result.forEach(h => assertValidHypothesis(h));
  });

  // ── Each hypothesis has required fields ──

  test('each hypothesis has required fields: question, affectedFiles, evidenceNeeded, severityEstimate, source', async () => {
    const gen = createGenerator();
    const cr: CodeReviewerOutput = {
      issues: [
        { file: 'src/api.ts', location: '1', severity: 'critical', category: 'correctness', description: 'critical bug', suggestion: 'fix' },
        { file: 'src/module.ts', location: '2', severity: 'minor', category: 'testing', description: 'missing tests', suggestion: 'add tests' },
      ],
      affectedSymbols: ['fetchData'],
      qualityVerdict: 'Critical',
    };
    const graph: DependencyGraphData = {
      fileDependencies: new Map([
        ['src/api.ts', { imports: [], importedBy: ['src/handler.ts'] }],
      ]),
      symbolMap: new Map([
        ['fetchData', { definedIn: 'src/api.ts', referencedBy: ['src/a.ts', 'src/b.ts'], type: 'function' }],
      ]),
      criticalPaths: [],
    };

    const result = await gen.generate(cr, emptyFD(), graph, createMockAdapter());

    assert.ok(result.length > 0, 'Should generate at least one hypothesis');
    result.forEach((h, i) => {
      assertValidHypothesis(h);
      // Extra: verify affectedFiles contains only strings
      assert.ok(h.affectedFiles.every(f => typeof f === 'string' && f.length > 0),
        `Hypothesis ${i}: all affectedFiles should be non-empty strings`);
    });
  });
});
