import * as assert from 'assert';
import * as fc from 'fast-check';
import { ContextOrchestratorService } from '../services/llm';
import { ContextGatherer } from '../services/llm/orchestrator/ContextGatherer';
import { ContextBudgetManager, DEFAULT_BUDGET_CONFIG } from '../services/llm/orchestrator/ContextBudgetManager';
import { MultiAgentExecutor } from '../services/llm/orchestrator/MultiAgentExecutor';
import { SharedContextStoreImpl } from '../services/llm/orchestrator/SharedContextStore';
import { AdapterCalibrationService } from '../services/llm/orchestrator/AdapterCalibrationService';
import { createMockAdapter } from './helpers/mockLLMAdapter';
import { TokenEstimatorService } from '../services/llm/TokenEstimatorService';
import {
  AgentBudgetAllocation,
  AgentPrompt,
  AgentPromptBuildContext,
  ContextOrchestratorConfig,
  DEFAULT_ORCHESTRATOR_CONFIG,
  DependencyGraphData,
  PhasedAgentConfig,
} from '../services/llm/orchestrator/orchestratorTypes';
import {
  largePatchFixture,
  mediumPatchFixture,
  refactorPatchFixture,
  securityPatchFixture,
  smallPatchFixture,
} from './fixtures/diffFixtures';
import { createMockChangedFile, createMockExecutionPlan } from './fixtures/adaptivePipelineFixtures';
import { TelemetryTestSink, assertEventEmitted } from './helpers/telemetryTestSink';
import { PipelineTelemetryEvent } from '../services/llm/orchestrator/telemetryTypes';

function createBugfixFixture() {
  const changes = [
    createMockChangedFile({
      relativePath: 'src/login.ts',
      filePath: 'src/login.ts',
      diff: '@@ -1,4 +1,5 @@\n export function login(token?: string) {\n-  return token!.trim();\n+  if (!token) return "";\n+  return token.trim();\n }\n',
    }),
    createMockChangedFile({
      relativePath: 'tests/login.spec.ts',
      filePath: 'tests/login.spec.ts',
      diff: '@@ -1,1 +1,4 @@\n+it("returns empty string when token missing", () => {\n+  expect(login()).toBe("");\n+});\n',
    }),
  ];
  return {
    changes,
    diffText: changes.map((change) => `diff --git a/${change.relativePath} b/${change.relativePath}\n${change.diff}`).join('\n\n'),
  };
}

function createMixedFixture() {
  const changes = [
    createMockChangedFile({
      relativePath: 'src/existing-feature.ts',
      filePath: 'src/existing-feature.ts',
      diff: '@@ -1,3 +1,5 @@\n export function buildFeature() {\n-  return false;\n+  if (flag) {\n+    return true;\n+  }\n+  return false;\n }\n',
    }),
    createMockChangedFile({
      relativePath: 'src/refactor/helpers.ts',
      filePath: 'src/refactor/helpers.ts',
      statusLabel: 'renamed',
      diff: '@@ -1,4 +1,4 @@\n-export const oldName = true;\n-export function oldHelper() { return true; }\n+export const newName = false;\n+export function newHelper(flag: boolean) { return flag; }\n',
    }),
  ];
  return {
    changes,
    diffText: changes.map((change) => `diff --git a/${change.relativePath} b/${change.relativePath}\n${change.diff}`).join('\n\n'),
  };
}

function createGraph(importedByCounts: Record<string, number>): DependencyGraphData {
  return {
    fileDependencies: new Map(
      Object.entries(importedByCounts).map(([file, count]) => [
        file,
        {
          imports: [],
          importedBy: Array.from({ length: count }, (_, index) => `${file}-consumer-${index}.ts`),
        },
      ]),
    ),
    symbolMap: new Map(),
    criticalPaths: [],
  };
}

function createBudget(agentRole: string, totalBudget: number = 4000): AgentBudgetAllocation {
  return {
    agentRole,
    totalBudget,
    diffBudget: Math.floor(totalBudget * 0.5),
    referenceBudget: Math.floor(totalBudget * 0.2),
    sharedContextBudget: Math.floor(totalBudget * 0.3),
    reservedForOutput: 512,
  };
}

function createExecutor(config: ContextOrchestratorConfig = DEFAULT_ORCHESTRATOR_CONFIG): MultiAgentExecutor {
  return new MultiAgentExecutor(
    config,
    new AdapterCalibrationService(config, new TokenEstimatorService()),
    new TokenEstimatorService(),
  );
}

suite('Adaptive Pipeline Phase 2', () => {
  test('ContextGatherer classifies feature/refactor/bugfix/mixed fixtures and detects risk flags', () => {
    const gatherer = new ContextGatherer(new TokenEstimatorService());
    const featurePlan = gatherer.analyze({
      changes: mediumPatchFixture.changes,
      diffText: mediumPatchFixture.diffText,
      diffTokens: 6000,
      contextWindow: 32768,
    });
    const refactorPlan = gatherer.analyze({
      changes: refactorPatchFixture.changes,
      diffText: refactorPatchFixture.diffText,
      diffTokens: 1200,
      contextWindow: 32768,
    });
    const bugfixFixture = createBugfixFixture();
    const bugfixPlan = gatherer.analyze({
      changes: bugfixFixture.changes,
      diffText: bugfixFixture.diffText,
      diffTokens: 1800,
      contextWindow: 32768,
    });
    const mixedFixture = createMixedFixture();
    const mixedPlan = gatherer.analyze({
      changes: mixedFixture.changes,
      diffText: mixedFixture.diffText,
      diffTokens: 2200,
      contextWindow: 32768,
    });
    const securityPlan = gatherer.analyze({
      changes: securityPatchFixture.changes,
      diffText: securityPatchFixture.diffText,
      diffTokens: 2000,
      contextWindow: 32768,
    });

    assert.strictEqual(featurePlan.patchIntent, 'feature');
    assert.strictEqual(featurePlan.patchSize, 'medium');
    assert.strictEqual(refactorPlan.patchIntent, 'refactor');
    assert.strictEqual(bugfixPlan.patchIntent, 'bugfix');
    assert.strictEqual(mixedPlan.patchIntent, 'mixed');
    assert.strictEqual(securityPlan.riskFlags.securitySensitive, true);
  });

  test('ContextGatherer patch size boundaries use safety-first OR logic', () => {
    const gatherer = new ContextGatherer(new TokenEstimatorService());
    assert.strictEqual((gatherer as any).classifyPatchSize(9, 2999), 'small');
    assert.strictEqual((gatherer as any).classifyPatchSize(10, 100), 'medium');
    assert.strictEqual((gatherer as any).classifyPatchSize(2, 3000), 'medium');
    assert.strictEqual((gatherer as any).classifyPatchSize(30, 14999), 'medium');
    assert.strictEqual((gatherer as any).classifyPatchSize(31, 100), 'large');
    assert.strictEqual((gatherer as any).classifyPatchSize(1, 15001), 'large');
  });

  test('ContextGatherer hotspot ranking orders files by importedBy count and degrades without graph', () => {
    const gatherer = new ContextGatherer(new TokenEstimatorService());
    const changes = [
      createMockChangedFile({ relativePath: 'src/a.ts', filePath: 'src/a.ts' }),
      createMockChangedFile({ relativePath: 'src/b.ts', filePath: 'src/b.ts' }),
      createMockChangedFile({ relativePath: 'src/c.ts', filePath: 'src/c.ts' }),
    ];
    const graph = createGraph({
      'src/a.ts': 2,
      'src/b.ts': 5,
      'src/c.ts': 1,
    });

    assert.deepStrictEqual((gatherer as any).identifyHotspots(changes, graph), ['src/b.ts', 'src/a.ts', 'src/c.ts']);
    assert.deepStrictEqual((gatherer as any).identifyHotspots(changes, undefined), []);
  });

  test('dependency graph provisioning distinguishes available, unavailable, and partial modes', () => {
    const orchestrator = new ContextOrchestratorService();
    const changes = [
      createMockChangedFile({ relativePath: 'src/a.ts', filePath: 'src/a.ts' }),
      createMockChangedFile({ relativePath: 'src/b.ts', filePath: 'src/b.ts' }),
    ];

    assert.strictEqual((orchestrator as any).determineGraphAvailability(changes, undefined), 'unavailable');
    assert.strictEqual((orchestrator as any).determineGraphAvailability(changes, {
      fileDependencies: new Map([['src/a.ts', { imports: [], importedBy: [] }]]),
      symbolMap: new Map(),
      criticalPaths: [],
    }), 'partial');
    assert.strictEqual((orchestrator as any).determineGraphAvailability(changes, {
      fileDependencies: new Map([
        ['src/a.ts', { imports: [], importedBy: [] }],
        ['src/b.ts', { imports: [], importedBy: [] }],
      ]),
      symbolMap: new Map(),
      criticalPaths: [],
    }), 'available');
  });

  test('ContextGatherer fallback returns static-budget plan when heuristic analysis throws', () => {
    const gatherer = new ContextGatherer(new TokenEstimatorService());
    (gatherer as any).classifyPatchSize = () => { throw new Error('boom'); };

    const plan = gatherer.analyze({
      changes: smallPatchFixture.changes,
      diffText: smallPatchFixture.diffText,
      diffTokens: 500,
      contextWindow: 32768,
    });

    assert.strictEqual(plan.fallbackPolicy, 'static-budget');
    assert.deepStrictEqual(plan.agentBudgets, DEFAULT_BUDGET_CONFIG.agentBudgetRatios);
  });

  test('Property 9: adaptive budget boost respects security and refactor boosts', async () => {
    const gatherer = new ContextGatherer(new TokenEstimatorService());
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (securitySensitive) => {
        const budgets = (gatherer as any).computeAgentBudgets(
          securitySensitive ? 'mixed' : 'refactor',
          {
            securitySensitive,
            crossModule: false,
            highChurn: false,
            apiContractChange: false,
          },
          DEFAULT_BUDGET_CONFIG.agentBudgetRatios,
        ) as Record<string, number>;

        if (securitySensitive) {
          assert.ok(budgets['Security Analyst'] >= DEFAULT_BUDGET_CONFIG.agentBudgetRatios['Security Analyst']);
        } else {
          assert.ok(budgets['Flow Diagram'] >= DEFAULT_BUDGET_CONFIG.agentBudgetRatios['Flow Diagram']);
        }
      }),
    );
  });

  test('ContextGatherer preserves boosted agent ratios and marks improvement writer as runtime-eligible', () => {
    const gatherer = new ContextGatherer(new TokenEstimatorService());
    const plan = gatherer.analyze({
      changes: securityPatchFixture.changes,
      diffText: securityPatchFixture.diffText,
      diffTokens: 3200,
      contextWindow: 32768,
    });
    const refactorPlan = gatherer.analyze({
      changes: refactorPatchFixture.changes,
      diffText: refactorPatchFixture.diffText,
      diffTokens: 3200,
      contextWindow: 32768,
    });

    assert.strictEqual(plan.sectionWriters.improvements, true);
    assert.ok((plan.sectionWriterBudgets?.improvements ?? 0) >= 512);
    assert.strictEqual(plan.agentBudgets['Security Analyst'], DEFAULT_BUDGET_CONFIG.agentBudgetRatios['Security Analyst'] * 1.2);
    assert.strictEqual(refactorPlan.agentBudgets['Flow Diagram'], DEFAULT_BUDGET_CONFIG.agentBudgetRatios['Flow Diagram'] * 1.15);
    assert.ok(Object.values(plan.agentBudgets).reduce((sum, value) => sum + value, 0) <= 1.000001);
    assert.ok(Object.values(refactorPlan.agentBudgets).reduce((sum, value) => sum + value, 0) <= 1.000001);
  });

  test('Property 8: ContextGatherer output remains ExecutionPlan-schema compliant', async () => {
    const gatherer = new ContextGatherer(new TokenEstimatorService());
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 1, maxLength: 8 }),
        async (counts) => {
          const changes = counts.map((count, index) =>
            createMockChangedFile({
              relativePath: `src/file-${index}.ts`,
              filePath: `src/file-${index}.ts`,
              diff: `@@ -1,1 +1,${count + 1} @@\n${Array.from({ length: count + 1 }, () => '+export const value = true;').join('\n')}`,
            }),
          );
          const diffText = changes.map((change) => change.diff).join('\n');
          const plan = gatherer.analyze({
            changes,
            diffText,
            diffTokens: Math.max(128, Math.ceil(diffText.length / 4)),
            contextWindow: 32768,
          });

          assert.ok(['feature', 'refactor', 'bugfix', 'mixed'].includes(plan.patchIntent));
          assert.ok(Object.values(plan.riskFlags).every((value) => typeof value === 'boolean'));
          assert.ok(plan.enabledAgents.length > 0);
          assert.ok(Object.values(plan.agentBudgets).reduce((sum, value) => sum + value, 0) <= 1.000001);
          assert.ok(['static-budget', 'skip-agent', 'abort'].includes(plan.fallbackPolicy));
        },
      ),
    );
  });

  test('Property 10: hotspot ordering follows descending importedBy counts', async () => {
    const gatherer = new ContextGatherer(new TokenEstimatorService());
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 12 }), { minLength: 2, maxLength: 8 }),
        async (counts) => {
          const uniqueCounts = counts.map((count, index) => count + index);
          const changes = uniqueCounts.map((_, index) =>
            createMockChangedFile({
              relativePath: `src/hot-${index}.ts`,
              filePath: `src/hot-${index}.ts`,
            }),
          );
          const graph = createGraph(
            Object.fromEntries(uniqueCounts.map((count, index) => [`src/hot-${index}.ts`, count])),
          );

          const ranked = (gatherer as any).identifyHotspots(changes, graph) as string[];
          const actualCounts = ranked.map((file) => graph.fileDependencies.get(file)?.importedBy.length ?? 0);
          const sortedCounts = [...actualCounts].sort((left, right) => right - left);
          assert.deepStrictEqual(actualCounts, sortedCounts);
        },
      ),
    );
  });

  test('ContextBudgetManager allocates from ExecutionPlan ratios and computes section-writer budgets', () => {
    const manager = new ContextBudgetManager(DEFAULT_BUDGET_CONFIG, new TokenEstimatorService());
    const plan = createMockExecutionPlan({
      agentBudgets: {
        'Code Reviewer': 0.25,
        'Flow Diagram': 0.15,
        'Observer': 0.20,
        'Security Analyst': 0.40,
      },
      sectionWriters: { summary: true, improvements: true },
      sectionWriterBudgets: { summary: 900, improvements: 1200 },
    });

    const pool = manager.computeAllocatablePool(32768, 2000, 5000);
    assert.strictEqual(pool, 32768 - 4096 - 2000 - 5000);

    const allocations = manager.allocateFromExecutionPlan(plan, 32768, 1024, 2000, 4000);
    assert.strictEqual(allocations.length, 4);
    assert.ok(allocations.find((budget) => budget.agentRole === 'Security Analyst')!.totalBudget >
      allocations.find((budget) => budget.agentRole === 'Flow Diagram')!.totalBudget);

    const writerBudgets = manager.allocateSectionWriterBudgets(plan, 32768, 1024, 2000);
    assert.deepStrictEqual(writerBudgets.map((budget) => budget.agentRole), ['Summary Writer', 'Improvement Writer']);
    assert.strictEqual(writerBudgets[0].totalBudget, 900);
    assert.strictEqual(writerBudgets[1].totalBudget, 1200);
  });

  test('Property 11: plan-based budget allocation stays under 90% safety threshold', async () => {
    const manager = new ContextBudgetManager(DEFAULT_BUDGET_CONFIG, new TokenEstimatorService());
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 100000, max: 200000 }),
        fc.record({
          cr: fc.double({ min: 0.05, max: 0.9, noNaN: true }),
          fd: fc.double({ min: 0.05, max: 0.9, noNaN: true }),
          ob: fc.double({ min: 0.05, max: 0.9, noNaN: true }),
          sa: fc.double({ min: 0.05, max: 0.9, noNaN: true }),
        }),
        async (contextWindow, ratios) => {
          const plan = createMockExecutionPlan({
            agentBudgets: {
              'Code Reviewer': ratios.cr,
              'Flow Diagram': ratios.fd,
              'Observer': ratios.ob,
              'Security Analyst': ratios.sa,
            },
          });
          const allocations = manager.allocateFromExecutionPlan(plan, contextWindow, 1024, 1500, 3000);
          const total = allocations.reduce(
            (sum, budget) => sum + budget.diffBudget + budget.referenceBudget + budget.sharedContextBudget,
            0,
          );
          assert.ok(total <= Math.floor(contextWindow * 0.9));
        },
      ),
    );
  });

  test('MultiAgentExecutor skips disabled agents while preserving enabled order', async () => {
    const executionOrder: string[] = [];
    const adapter = createMockAdapter({
      async generateText(prompt) {
        if (prompt.includes('CR')) {
          executionOrder.push('Code Reviewer');
          return { text: '{"issues":[],"affectedSymbols":[],"qualityVerdict":"Good"}', model: 'mock', totalTokens: 50 };
        }
        if (prompt.includes('SA')) {
          executionOrder.push('Security Analyst');
          return { text: '{"vulnerabilities":[],"authFlowConcerns":[],"inputValidationGaps":[],"dataExposureRisks":[]}', model: 'mock', totalTokens: 50 };
        }
        executionOrder.push('Observer');
        return { text: '{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock', totalTokens: 50 };
      },
    });
    const executor = createExecutor();
    const store = new SharedContextStoreImpl();
    const phaseConfig: PhasedAgentConfig = {
      phase1: [
        { role: 'Code Reviewer', systemMessage: 'sys', prompt: 'CR', outputSchema: 'code-reviewer', selfAudit: false, maxIterations: 1 },
        { role: 'Flow Diagram', systemMessage: 'sys', prompt: 'FD', outputSchema: 'flow-diagram', selfAudit: false, maxIterations: 1 },
        { role: 'Security Analyst', systemMessage: 'sys', prompt: 'SA', outputSchema: 'security-analyst', selfAudit: false, maxIterations: 1 },
      ],
      phase2: [],
      sharedStore: store,
      promptBuilder: {
        buildObserverPrompt: () => ({ role: 'Observer', systemMessage: 'sys', prompt: 'OB', outputSchema: 'observer', selfAudit: false, maxIterations: 1 }),
        buildDiffSummary: () => 'summary',
      } as never,
      buildContext: { fullDiff: 'diff', changedFiles: [], language: 'English' },
      budgetAllocations: [
        createBudget('Code Reviewer'),
        createBudget('Flow Diagram'),
        createBudget('Security Analyst'),
        createBudget('Observer'),
      ],
    };

    const reports = await executor.executePhasedAgents(
      phaseConfig,
      adapter,
      undefined,
      undefined,
      createMockExecutionPlan({
        enabledAgents: ['Code Reviewer', 'Security Analyst', 'Observer'],
        disabledAgents: [{ role: 'Flow Diagram', reason: 'no control-flow signal' }],
      }),
    );

    assert.deepStrictEqual(executionOrder, ['Code Reviewer', 'Security Analyst', 'Observer']);
    assert.ok(reports.every((report) => !report.startsWith('### Agent: Flow Diagram')));
    assert.deepStrictEqual(executor.getLastSkippedAgents(), [{ role: 'Flow Diagram', reason: 'no control-flow signal' }]);
  });

  test('AdapterCalibrationService emits truncation telemetry with allocated budget', () => {
    const calibration = new AdapterCalibrationService(DEFAULT_ORCHESTRATOR_CONFIG, new TokenEstimatorService());
    const events: Array<{ agentRole: string; tokensTruncated: number; budgetAllocated?: number }> = [];
    calibration.setTruncationHandler((payload) => events.push(payload));
    (calibration as any).estimateTokens = (text: string) => Math.ceil(text.length / 2);
    const adapter = createMockAdapter({
      getContextWindow: () => 4096,
    });

    calibration.safeTruncatePrompt(
      'x'.repeat(9000),
      'system',
      adapter,
      undefined,
      'Code Reviewer',
      undefined,
      2048,
    );

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].agentRole, 'Code Reviewer');
    assert.strictEqual(events[0].budgetAllocated, 2048);
    assert.ok(events[0].tokensTruncated > 0);
  });

  test('runAdaptivePipeline falls back to static budgets when ContextGatherer throws and still completes', async () => {
    const orchestrator = new ContextOrchestratorService();
    const telemetry = new TelemetryTestSink();
    const store = new SharedContextStoreImpl();
    const reports = [
      '### Agent: Code Reviewer\n\n{"issues":[],"affectedSymbols":[],"qualityVerdict":"Good"}',
      '### Agent: Flow Diagram\n\n{"diagrams":[],"affectedFlows":[]}',
      '### Agent: Security Analyst\n\n{"vulnerabilities":[],"authFlowConcerns":[],"inputValidationGaps":[],"dataExposureRisks":[]}',
      '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}',
    ];
    (orchestrator as any).contextGatherer.analyze = () => { throw new Error('planner failed'); };
    (orchestrator as any).multiAgentExecutor.executePhasedAgents = async () => {
      store.addAgentFindings('Code Reviewer', [{ agentRole: 'Code Reviewer', type: 'issue', data: { issues: [], affectedSymbols: [], qualityVerdict: 'Good' }, timestamp: Date.now() }]);
      store.addAgentFindings('Flow Diagram', [{ agentRole: 'Flow Diagram', type: 'flow', data: { diagrams: [], affectedFlows: [] }, timestamp: Date.now() }]);
      store.addAgentFindings('Security Analyst', [{ agentRole: 'Security Analyst', type: 'security', data: { vulnerabilities: [], authFlowConcerns: [], inputValidationGaps: [], dataExposureRisks: [] }, timestamp: Date.now() }]);
      store.addAgentFindings('Observer', [{ agentRole: 'Observer', type: 'risk', data: { risks: [], todoItems: [], integrationConcerns: [] }, timestamp: Date.now() }]);
      return reports;
    };
    (orchestrator as any).multiAgentExecutor.getLastAgentTokenUsage = () => ({});
    (orchestrator as any).multiAgentExecutor.getLastSkippedAgents = () => ([]);

    const result = await orchestrator.runAdaptivePipeline({
      adapter: createMockAdapter(),
      phaseConfig: {
        phase1: [
          { role: 'Code Reviewer', systemMessage: 'sys', prompt: 'prompt' },
          { role: 'Flow Diagram', systemMessage: 'sys', prompt: 'prompt' },
          { role: 'Detail Change', systemMessage: 'sys', prompt: 'prompt' },
          { role: 'Security Analyst', systemMessage: 'sys', prompt: 'prompt' },
        ],
        phase2: [],
        sharedStore: store,
        promptBuilder: {} as never,
        buildContext: {
          fullDiff: smallPatchFixture.diffText,
          changedFiles: smallPatchFixture.changes,
          language: 'English',
        } as AgentPromptBuildContext,
        budgetAllocations: [
          createBudget('Code Reviewer'),
          createBudget('Flow Diagram'),
          createBudget('Security Analyst'),
          createBudget('Observer'),
        ],
      },
      sharedStore: store,
      suppressedFindings: [],
      changedFiles: smallPatchFixture.changes,
      language: 'English',
      reviewDurationMs: 100,
      telemetryEmitter: telemetry,
    });

    assert.ok(result.review.length > 0);
    assertEventEmitted(telemetry, PipelineTelemetryEvent.PIPELINE_COMPLETE, (payload) => payload.pipelineMode === 'adaptive');
  });
});
