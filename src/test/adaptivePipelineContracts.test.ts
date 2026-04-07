import * as assert from 'assert';
import * as adaptivePipelineFlag from '../services/llm/orchestrator/adaptivePipelineFlag';
import { ReviewMergeService } from '../commands/reviewMerge/reviewMergeService';
import { ReviewStagedChangesService } from '../commands/reviewStagedChanges/reviewStagedChangesService';
import { ReviewMergedBranchService } from '../commands/reviewMergedBranch/reviewMergedBranchService';
import { ReviewSelectedCommitsService } from '../commands/reviewSelectedCommits/reviewSelectedCommitsService';
import { DependencyGraphIndex } from '../services/llm/orchestrator/DependencyGraphIndex';
import { ContextBudgetManager } from '../services/llm/orchestrator/ContextBudgetManager';
import { AgentPromptBuilder } from '../services/llm/orchestrator/AgentPromptBuilder';
import { SharedContextStoreImpl } from '../services/llm/orchestrator/SharedContextStore';
import { SessionMemory } from '../services/llm/orchestrator/SessionMemory';
import { createMockAdapter } from './helpers/mockLLMAdapter';
import { mediumPatchFixture, smallPatchFixture } from './fixtures/diffFixtures';
import { TelemetryTestSink, assertEventEmitted } from './helpers/telemetryTestSink';
import { ContextOrchestratorService } from '../services/llm';
import { StructuredAgentReport } from '../services/llm/orchestrator/orchestratorTypes';
import { PipelineTelemetryEvent } from '../services/llm/orchestrator/telemetryTypes';

type Restorer = () => void;

function patchValue(target: object, key: string, value: unknown, restorers: Restorer[]): void {
  const original = (target as Record<string, unknown>)[key];
  restorers.push(() => {
    (target as Record<string, unknown>)[key] = original;
  });
  (target as Record<string, unknown>)[key] = value;
}

function createBudget(agentRole: string) {
  return {
    agentRole,
    totalBudget: 512,
    diffBudget: 256,
    referenceBudget: 128,
    sharedContextBudget: 64,
    reservedForOutput: 64,
  };
}

function createGraph() {
  return {
    fileDependencies: new Map(),
    symbolMap: new Map(),
    criticalPaths: [],
  };
}

function createReferenceContextResult() {
  return {
    context: 'Reference context',
    metadata: {
      symbolsResolved: 1,
      filesIncluded: 1,
      estimatedTokens: 64,
      triggerReason: 'test',
      candidateSymbols: 1,
      triggered: true,
      truncatedByBudget: false,
    },
  };
}

function createStructuredReports(): StructuredAgentReport[] {
  return [
    {
      role: 'Code Reviewer',
      structured: {
        issues: [
          {
            file: 'src/auth.ts',
            location: 'line 10',
            severity: 'major',
            category: 'correctness',
            description: 'Missing null guard for token access.',
            suggestion: 'Check for token before dereferencing.',
            confidence: 0.91,
          },
        ],
        affectedSymbols: ['login'],
        qualityVerdict: 'Not Bad',
      },
      raw: '### Agent: Code Reviewer\n\nreview raw',
    },
    {
      role: 'Flow Diagram',
      structured: {
        diagrams: [
          {
            name: 'Auth Flow',
            type: 'sequence',
            plantumlCode: '@startuml\nA -> B: auth\n@enduml',
            description: 'Auth flow',
          },
        ],
        affectedFlows: ['login'],
      },
      raw: '### Agent: Flow Diagram\n\nflow raw',
    },
    {
      role: 'Security Analyst',
      structured: {
        vulnerabilities: [
          {
            file: 'src/auth.ts',
            location: 'line 10',
            cweId: 'CWE-476',
            type: 'other',
            severity: 'high',
            confidence: 0.88,
            description: 'Missing null guard for token access.',
            remediation: 'Validate token before dereferencing.',
          },
        ],
        authFlowConcerns: [],
        inputValidationGaps: [],
        dataExposureRisks: [],
      },
      raw: '### Agent: Security Analyst\n\nsecurity raw',
    },
    {
      role: 'Observer',
      structured: {
        risks: [
          {
            description: 'Observer risk',
            severity: 'high',
            affectedArea: 'src/auth.ts',
            confidence: 0.75,
          },
        ],
        todoItems: [
          {
            action: 'Add regression coverage',
            parallelizable: true,
            priority: 'high',
          },
        ],
        integrationConcerns: ['auth integration'],
      },
      raw: '### Agent: Observer\n\nobserver raw',
    },
  ];
}

function seedSharedStore(store: SharedContextStoreImpl, reports: StructuredAgentReport[]): void {
  for (const report of reports) {
    const type =
      report.role === 'Code Reviewer' ? 'issue' :
      report.role === 'Flow Diagram' ? 'flow' :
      report.role === 'Security Analyst' ? 'security' :
      'risk';

    store.addAgentFindings(report.role, [{
      agentRole: report.role,
      type,
      data: report.structured,
      timestamp: Date.now(),
    }]);
  }
}

function createGitServiceStub() {
  const diff = 'diff --git a/src/auth.ts b/src/auth.ts';
  const changes = smallPatchFixture.changes;

  return {
    getWorkspaceRoot: () => '/workspace/git-mew',
    getCurrentBranch: async () => 'feature/adaptive',
    getBranchDiffFiles: async () => changes,
    renderBranchDiffFiles: () => diff,
    buildReviewReferenceContext: async () => createReferenceContextResult(),
    normalizeGeneratedPaths: (text: string) => text,
    getCustomReviewMergeSystemPrompt: async () => undefined,
    getCustomReviewMergeAgentPrompt: async () => undefined,
    getCustomReviewMergeRules: async () => undefined,
    getCustomDescriptionMergeSystemPrompt: async () => undefined,
    hasStagedFiles: async () => true,
    getStagedDiffFiles: async () => changes,
    renderStagedDiffFiles: () => diff,
    getMergedBranchDiff: async () => ({ changes, diff }),
    getCommitRangeDiff: async () => ({ changes, diff }),
  };
}

function installPipelineStubs(restorers: Restorer[]): void {
  patchValue(DependencyGraphIndex.prototype as unknown as object, 'build', async () => createGraph(), restorers);
  patchValue(ContextBudgetManager.prototype as unknown as object, 'allocateAgentBudgets', function () {
    return [
      createBudget('Code Reviewer'),
      createBudget('Flow Diagram'),
      createBudget('Security Analyst'),
      createBudget('Observer'),
    ];
  }, restorers);
  patchValue(ContextBudgetManager.prototype as unknown as object, 'enforceGlobalBudget', function (budgets: unknown) {
    return budgets;
  }, restorers);
  patchValue(ContextBudgetManager.prototype as unknown as object, 'allocateSynthesisBudgets', function () {
    return [
      createBudget('Summary & Detail'),
      createBudget('Improvement Suggestions'),
      createBudget('Risk & TODO'),
      createBudget('Diagram & Assessment'),
    ];
  }, restorers);
  patchValue(ContextBudgetManager.prototype as unknown as object, 'computeMaxSymbols', function () { return 8; }, restorers);
  patchValue(ContextBudgetManager.prototype as unknown as object, 'computeMaxReferenceFiles', function () { return 4; }, restorers);
  patchValue(ContextBudgetManager.prototype as unknown as object, 'computeReferenceContextBudget', function () { return 1024; }, restorers);

  patchValue(AgentPromptBuilder.prototype as unknown as object, 'buildCodeReviewerPrompt', () => ({ role: 'Code Reviewer', systemMessage: 'sys', prompt: 'prompt' }), restorers);
  patchValue(AgentPromptBuilder.prototype as unknown as object, 'buildFlowDiagramPrompt', () => ({ role: 'Flow Diagram', systemMessage: 'sys', prompt: 'prompt' }), restorers);
  patchValue(AgentPromptBuilder.prototype as unknown as object, 'buildSecurityAgentPrompt', () => ({ role: 'Security Analyst', systemMessage: 'sys', prompt: 'prompt' }), restorers);
  patchValue(AgentPromptBuilder.prototype as unknown as object, 'buildDetailChangePrompt', () => ({ role: 'Detail Change', systemMessage: 'sys', prompt: 'prompt' }), restorers);
  patchValue(AgentPromptBuilder.prototype as unknown as object, 'buildSummaryDetailAgentPrompt', () => ({ role: 'Summary & Detail', systemMessage: 'sys', prompt: 'prompt' }), restorers);
  patchValue(AgentPromptBuilder.prototype as unknown as object, 'buildImprovementSuggestionsAgentPrompt', () => ({ role: 'Improvement Suggestions', systemMessage: 'sys', prompt: 'prompt' }), restorers);
  patchValue(AgentPromptBuilder.prototype as unknown as object, 'buildRiskTodoAgentPrompt', () => ({ role: 'Risk & TODO', systemMessage: 'sys', prompt: 'prompt' }), restorers);
  patchValue(AgentPromptBuilder.prototype as unknown as object, 'buildDiagramAssessmentAgentPrompt', () => ({ role: 'Diagram & Assessment', systemMessage: 'sys', prompt: 'prompt' }), restorers);
  patchValue(AgentPromptBuilder.prototype as unknown as object, 'buildChangeAnalyzerPrompt', () => ({ role: 'Change Analyzer', systemMessage: 'sys', prompt: 'prompt' }), restorers);
  patchValue(AgentPromptBuilder.prototype as unknown as object, 'buildContextInvestigatorPrompt', () => ({ role: 'Context Investigator', systemMessage: 'sys', prompt: 'prompt' }), restorers);
  patchValue(AgentPromptBuilder.prototype as unknown as object, 'buildDiffSummary', () => 'Diff summary', restorers);
  patchValue(AgentPromptBuilder.prototype as unknown as object, 'buildSynthesizerPrompt', () => 'Synth prompt', restorers);
  patchValue(AgentPromptBuilder.prototype as unknown as object, 'buildDescriptionSynthesizerPrompt', () => 'Description prompt', restorers);
}

function createReviewMemoryStub() {
  const calls = {
    savePatterns: [] as unknown[],
    saveReviewSummary: [] as unknown[],
  };

  return {
    calls,
    memory: {
      getPatterns: async () => [],
      getSuppressedFindings: async () => [],
      getRelevantHistory: async () => [],
      getResolutionRate: async () => 0,
      getAgentResolutionRates: async () => ({}),
      getHistoricalDismissRates: async () => ({}),
      decayPatterns: async () => {},
      savePatterns: async (value: unknown) => { calls.savePatterns.push(value); },
      saveReviewSummary: async (value: unknown) => { calls.saveReviewSummary.push(value); },
    },
  };
}

suite('Adaptive Pipeline Contracts', () => {
  const restorers: Restorer[] = [];

  teardown(() => {
    while (restorers.length > 0) {
      restorers.pop()?.();
    }
  });

  test('runAdaptivePipeline emits the required telemetry events and preserves SharedContextStore compatibility', async () => {
    const reports = createStructuredReports();
    const store = new SharedContextStoreImpl();
    const orchestrator = new ContextOrchestratorService();
    const sink = new TelemetryTestSink();

    patchValue((orchestrator as unknown as { multiAgentExecutor: { executePhasedAgents: unknown } }).multiAgentExecutor as unknown as object, 'executePhasedAgents', async () => {
      seedSharedStore(store, reports);
      return reports.map((report) => report.raw);
    }, restorers);

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
          fullDiff: 'diff',
          changedFiles: smallPatchFixture.changes,
          language: 'English',
        },
        budgetAllocations: [createBudget('Code Reviewer')],
      },
      sharedStore: store,
      suppressedFindings: [],
      changedFiles: smallPatchFixture.changes,
      language: 'English',
      reviewDurationMs: 123,
      telemetryEmitter: sink,
    });

    assert.strictEqual(store.getAgentFindings('Code Reviewer').length, 1);
    assert.strictEqual(result.intermediateData.structuredReports.length, 4);
    assertEventEmitted(sink, PipelineTelemetryEvent.PIPELINE_START, (payload) => payload.changedFiles === smallPatchFixture.changes.length);
    assert.strictEqual(sink.events.filter((event) => event.name === PipelineTelemetryEvent.AGENT_COMPLETE).length, 4);
    assertEventEmitted(sink, PipelineTelemetryEvent.ASSEMBLY_COMPLETE, (payload) => payload.sectionsRendered === 8);
    assertEventEmitted(sink, PipelineTelemetryEvent.PIPELINE_COMPLETE, (payload) => {
      const phaseLatencies = payload.phaseLatencies as { assembly: number } | undefined;
      const outputCompleteness = payload.outputCompleteness as { totalFindings: number } | undefined;
      return Boolean(phaseLatencies && phaseLatencies.assembly >= 0 && outputCompleteness && outputCompleteness.totalFindings >= 3);
    });
  });

  test('runAdaptivePipeline uses reviewStartTimeMs for final metadata duration and runtime section-writer telemetry', async () => {
    const reports = createStructuredReports();
    const store = new SessionMemory();
    const orchestrator = new ContextOrchestratorService();
    const sink = new TelemetryTestSink();
    const startTimeMs = Date.now() - 650;
    const adapter = createMockAdapter({
      async generateText(prompt) {
        if (prompt.includes('## 2. Summary of Changes')) {
          return {
            text: '## 2. Summary of Changes\n\nThis summary writer output is intentionally long enough to pass the quality threshold and prove runtime activation.',
            model: 'mock-model',
            totalTokens: 60,
          };
        }
        if (prompt.includes('## 6. Improvement Suggestions')) {
          return {
            text: '## 6. Improvement Suggestions\n\nThis improvement writer output is intentionally long enough to pass the quality threshold and prove runtime activation.',
            model: 'mock-model',
            totalTokens: 60,
          };
        }
        return {
          text: 'mock response',
          model: 'mock-model',
          totalTokens: 20,
        };
      },
    });

    patchValue((orchestrator as unknown as { multiAgentExecutor: { executePhasedAgents: unknown } }).multiAgentExecutor as unknown as object, 'executePhasedAgents', async () => {
      seedSharedStore(store, reports);
      return reports.map((report) => report.raw);
    }, restorers);
    patchValue((orchestrator as unknown as { multiAgentExecutor: { getLastAgentTokenUsage: unknown } }).multiAgentExecutor as unknown as object, 'getLastAgentTokenUsage', () => ({
      'Code Reviewer': 100,
      'Flow Diagram': 80,
      'Security Analyst': 90,
      'Observer': 75,
    }), restorers);
    patchValue((orchestrator as unknown as { multiAgentExecutor: { getLastSkippedAgents: unknown } }).multiAgentExecutor as unknown as object, 'getLastSkippedAgents', () => [], restorers);

    const result = await orchestrator.runAdaptivePipeline({
      adapter,
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
          fullDiff: mediumPatchFixture.diffText,
          changedFiles: mediumPatchFixture.changes,
          language: 'English',
        },
        budgetAllocations: [
          createBudget('Code Reviewer'),
          createBudget('Flow Diagram'),
          createBudget('Security Analyst'),
          createBudget('Observer'),
        ],
      },
      sharedStore: store,
      suppressedFindings: [],
      changedFiles: mediumPatchFixture.changes,
      language: 'English',
      reviewDurationMs: 123,
      reviewStartTimeMs: startTimeMs,
      telemetryEmitter: sink,
    });

    const durationMatch = result.review.match(/duration=(\d+)ms/);
    assert.ok(durationMatch, 'Review metadata footer should contain duration');
    assert.ok(Number(durationMatch![1]) >= 500, 'Duration should include time since reviewStartTimeMs, not stale input.reviewDurationMs');
    assertEventEmitted(sink, PipelineTelemetryEvent.PIPELINE_COMPLETE, (payload) => {
      const sectionWritersEnabled = payload.sectionWritersEnabled as { summary: boolean; improvements: boolean } | undefined;
      return sectionWritersEnabled?.summary === true && sectionWritersEnabled.improvements === true;
    });
  });

  test('review entry points keep the same ReviewResult contract under both flag states', async () => {
    installPipelineStubs(restorers);
    const reports = createStructuredReports();
    const gitService = createGitServiceStub();
    const adapter = createMockAdapter();

    const scenarios = [
      {
        createService: () => new ReviewMergeService(gitService as never, {} as never),
        run: (service: ReviewMergeService) => service.generateReview('main', 'feature', 'openai', 'mock-model', 'English', 'auto'),
      },
      {
        createService: () => new ReviewStagedChangesService(gitService as never, {} as never),
        run: (service: ReviewStagedChangesService) => service.generateReview('openai', 'mock-model', 'English', 'auto'),
      },
      {
        createService: () => new ReviewMergedBranchService(gitService as never, {} as never),
        run: (service: ReviewMergedBranchService) => service.generateReview('merge-sha', 'openai', 'mock-model', 'English', 'auto'),
      },
      {
        createService: () => new ReviewSelectedCommitsService(gitService as never, {} as never),
        run: (service: ReviewSelectedCommitsService) => service.generateReview('oldest', 'newest', 2, 'openai', 'mock-model', 'English', 'auto'),
      },
    ];

    for (const scenario of scenarios) {
      const adaptiveCalls = { runAdaptivePipeline: 0, executeSynthesisAgentReports: 0, generateMultiAgentFinalText: 0 };

      const adaptiveService = scenario.createService() as unknown as {
        prepareAdapter: unknown;
        contextOrchestrator: Record<string, unknown>;
      };
      patchValue(adaptiveService as unknown as object, 'prepareAdapter', async () => ({ adapter }), restorers);
      patchValue(adaptiveService.contextOrchestrator as object, 'runAdaptivePipeline', async (input: { sharedStore?: SharedContextStoreImpl }) => {
        adaptiveCalls.runAdaptivePipeline += 1;
        if (input.sharedStore instanceof SharedContextStoreImpl) {
          seedSharedStore(input.sharedStore, reports);
        }
        return {
          review: 'review body',
          intermediateData: {
            structuredReports: reports,
            suppressionResult: {
              filteredReports: reports,
              suppressedCount: 0,
              suppressedFindingIds: [],
            },
          },
        };
      }, restorers);
      patchValue(adaptiveService.contextOrchestrator as object, 'executeSynthesisAgentReports', async () => {
        adaptiveCalls.executeSynthesisAgentReports += 1;
        return new Map();
      }, restorers);
      patchValue(adaptiveService.contextOrchestrator as object, 'generateMultiAgentFinalText', async () => {
        adaptiveCalls.generateMultiAgentFinalText += 1;
        return 'legacy review body';
      }, restorers);
      patchValue(adaptivePipelineFlag as unknown as object, 'shouldUseAdaptivePipeline', () => true, restorers);
      const adaptiveResult = await scenario.run(adaptiveService as never) as unknown as Record<string, unknown>;

      const legacyService = scenario.createService() as unknown as {
        prepareAdapter: unknown;
        contextOrchestrator: Record<string, unknown>;
      };
      patchValue(legacyService as unknown as object, 'prepareAdapter', async () => ({ adapter }), restorers);
      patchValue(legacyService.contextOrchestrator as object, 'executePhasedAgentReports', async (phaseConfig: { sharedStore: SharedContextStoreImpl }) => {
        seedSharedStore(phaseConfig.sharedStore, reports);
        return reports.map((report) => report.raw);
      }, restorers);
      patchValue(legacyService.contextOrchestrator as object, 'executeSynthesisAgentReports', async () => {
        return new Map([
          ['Summary & Detail', '## 2. Summary of Changes\nlegacy'],
          ['Improvement Suggestions', '## 6. Improvement Suggestions\nlegacy'],
          ['Risk & TODO', '## 7. Observer TODO List\nlegacy\n\n## 8. Potential Hidden Risks\nlegacy'],
          ['Diagram & Assessment', '## 4. Flow Diagram\nlegacy\n\n## 5. Code Quality Assessment\nlegacy'],
        ]);
      }, restorers);
      patchValue(legacyService.contextOrchestrator as object, 'generateMultiAgentFinalText', async () => 'review body', restorers);
      patchValue(adaptivePipelineFlag as unknown as object, 'shouldUseAdaptivePipeline', () => false, restorers);
      const legacyResult = await scenario.run(legacyService as never) as unknown as Record<string, unknown>;

      assert.deepStrictEqual(Object.keys(adaptiveResult).sort(), Object.keys(legacyResult).sort());
      assert.strictEqual(adaptiveResult.success, true);
      assert.strictEqual(legacyResult.success, true);
      assert.ok(typeof adaptiveResult.review === 'string');
      assert.ok(typeof legacyResult.review === 'string');
      assert.strictEqual(adaptiveCalls.runAdaptivePipeline, 1);
      assert.strictEqual(adaptiveCalls.executeSynthesisAgentReports, 0);
      assert.strictEqual(adaptiveCalls.generateMultiAgentFinalText, 0);
    }
  });

  test('legacy merge and staged flows still execute synthesis when the adaptive flag is disabled', async () => {
    installPipelineStubs(restorers);
    const reports = createStructuredReports();
    const gitService = createGitServiceStub();
    const adapter = createMockAdapter();
    const services = [
      new ReviewMergeService(gitService as never, {} as never),
      new ReviewStagedChangesService(gitService as never, {} as never),
    ];

    for (const service of services) {
      const calls = { adaptive: 0, synthesis: 0 };
      patchValue(service as unknown as object, 'prepareAdapter', async () => ({ adapter }), restorers);
      patchValue((service as unknown as { contextOrchestrator: Record<string, unknown> }).contextOrchestrator as object, 'runAdaptivePipeline', async () => {
        calls.adaptive += 1;
        return { review: 'unexpected', intermediateData: { structuredReports: [], suppressionResult: { filteredReports: [], suppressedCount: 0, suppressedFindingIds: [] } } };
      }, restorers);
      patchValue((service as unknown as { contextOrchestrator: Record<string, unknown> }).contextOrchestrator as object, 'executePhasedAgentReports', async (phaseConfig: { sharedStore: SharedContextStoreImpl }) => {
        seedSharedStore(phaseConfig.sharedStore, reports);
        return reports.map((report) => report.raw);
      }, restorers);
      patchValue((service as unknown as { contextOrchestrator: Record<string, unknown> }).contextOrchestrator as object, 'executeSynthesisAgentReports', async () => {
        calls.synthesis += 1;
        return new Map();
      }, restorers);
      patchValue(adaptivePipelineFlag as unknown as object, 'shouldUseAdaptivePipeline', () => false, restorers);

      const result = service instanceof ReviewMergeService
        ? await service.generateReview('main', 'feature', 'openai', 'mock-model', 'English', 'auto')
        : await service.generateReview('openai', 'mock-model', 'English', 'auto');

      assert.strictEqual(result.success, true);
      assert.strictEqual(calls.adaptive, 0);
      assert.strictEqual(calls.synthesis, 1);
    }
  });

  test('review memory autosave arguments stay stable across flag toggles', async () => {
    installPipelineStubs(restorers);
    const reports = createStructuredReports();
    const gitService = createGitServiceStub();
    const adapter = createMockAdapter();
    const adaptiveMemory = createReviewMemoryStub();
    const legacyMemory = createReviewMemoryStub();
    const adaptiveService = new ReviewMergeService(gitService as never, {} as never);
    const legacyService = new ReviewMergeService(gitService as never, {} as never);
    adaptiveService.setReviewMemory(adaptiveMemory.memory as never);
    legacyService.setReviewMemory(legacyMemory.memory as never);

    patchValue(adaptiveService as unknown as object, 'prepareAdapter', async () => ({ adapter }), restorers);
    patchValue(legacyService as unknown as object, 'prepareAdapter', async () => ({ adapter }), restorers);
    patchValue((adaptiveService as unknown as { contextOrchestrator: Record<string, unknown> }).contextOrchestrator as object, 'runAdaptivePipeline', async (input: { sharedStore: SharedContextStoreImpl }) => {
      seedSharedStore(input.sharedStore, reports);
      return {
        review: 'review body',
        intermediateData: {
          structuredReports: reports,
          suppressionResult: { filteredReports: reports, suppressedCount: 0, suppressedFindingIds: [] },
        },
      };
    }, restorers);
    patchValue((legacyService as unknown as { contextOrchestrator: Record<string, unknown> }).contextOrchestrator as object, 'executePhasedAgentReports', async (phaseConfig: { sharedStore: SharedContextStoreImpl }) => {
      seedSharedStore(phaseConfig.sharedStore, reports);
      return reports.map((report) => report.raw);
    }, restorers);
    patchValue((legacyService as unknown as { contextOrchestrator: Record<string, unknown> }).contextOrchestrator as object, 'executeSynthesisAgentReports', async () => new Map(), restorers);

    patchValue(adaptivePipelineFlag as unknown as object, 'shouldUseAdaptivePipeline', () => true, restorers);
    await adaptiveService.generateReview('main', 'feature', 'openai', 'mock-model', 'English', 'auto');
    patchValue(adaptivePipelineFlag as unknown as object, 'shouldUseAdaptivePipeline', () => false, restorers);
    await legacyService.generateReview('main', 'feature', 'openai', 'mock-model', 'English', 'auto');

    assert.strictEqual(adaptiveMemory.calls.savePatterns.length, 1);
    assert.strictEqual(legacyMemory.calls.savePatterns.length, 1);
    assert.deepStrictEqual(
      Object.keys(adaptiveMemory.calls.saveReviewSummary[0] as Record<string, unknown>).sort(),
      Object.keys(legacyMemory.calls.saveReviewSummary[0] as Record<string, unknown>).sort(),
    );
  });

  test('phase 3 adaptive path uses SessionMemory without leaking session internals into review memory payloads', async () => {
    installPipelineStubs(restorers);
    const reports = createStructuredReports();
    const gitService = createGitServiceStub();
    const adapter = createMockAdapter();
    const adaptiveMemory = createReviewMemoryStub();
    const adaptiveService = new ReviewMergeService(gitService as never, {} as never);
    adaptiveService.setReviewMemory(adaptiveMemory.memory as never);

    patchValue(adaptiveService as unknown as object, 'prepareAdapter', async () => ({ adapter }), restorers);
    patchValue((adaptiveService as unknown as { contextOrchestrator: Record<string, unknown> }).contextOrchestrator as object, 'runAdaptivePipeline', async (input: { sharedStore: SharedContextStoreImpl }) => {
      assert.ok(input.sharedStore instanceof SessionMemory, 'Adaptive Phase 3 path should instantiate SessionMemory');
      seedSharedStore(input.sharedStore, reports);
      return {
        review: 'review body',
        intermediateData: {
          structuredReports: reports,
          suppressionResult: { filteredReports: reports, suppressedCount: 0, suppressedFindingIds: [] },
        },
      };
    }, restorers);
    patchValue(adaptivePipelineFlag as unknown as object, 'shouldUseAdaptivePipeline', () => true, restorers);

    const result = await adaptiveService.generateReview('main', 'feature', 'openai', 'mock-model', 'English', 'auto');

    assert.strictEqual(result.success, true);
    assert.strictEqual(adaptiveMemory.calls.saveReviewSummary.length, 1);
    const payload = adaptiveMemory.calls.saveReviewSummary[0] as Record<string, unknown>;
    assert.ok(!('sessionMemory' in payload), 'Review memory payload should not contain SessionMemory internals');
    assert.ok(!('findings' in payload), 'Review memory payload should not contain raw session findings');
    assert.ok(!('hypotheses' in payload), 'Review memory payload should not contain raw session hypotheses');
    assert.ok(!('executionPlan' in payload), 'Review memory payload should not contain execution plan internals');
  });

  test('MR description flow is unaffected by the adaptive review flag', async () => {
    installPipelineStubs(restorers);
    const gitService = createGitServiceStub();
    const service = new ReviewMergeService(gitService as never, {} as never);
    patchValue(service as unknown as object, 'prepareAdapter', async () => ({ adapter: createMockAdapter() }), restorers);
    patchValue((service as unknown as { contextOrchestrator: Record<string, unknown> }).contextOrchestrator as object, 'generateMultiAgentDescription', async () => 'description body', restorers);

    patchValue(adaptivePipelineFlag as unknown as object, 'shouldUseAdaptivePipeline', () => true, restorers);
    const adaptive = await service.generateDescription('main', 'feature', 'openai', 'mock-model', 'English', 'auto');
    patchValue(adaptivePipelineFlag as unknown as object, 'shouldUseAdaptivePipeline', () => false, restorers);
    const legacy = await service.generateDescription('main', 'feature', 'openai', 'mock-model', 'English', 'auto');

    assert.deepStrictEqual(adaptive, legacy);
  });

  test('PlantUML repair flow is unaffected by the adaptive review flag', async () => {
    const service = new ReviewMergeService(createGitServiceStub() as never, {} as never);
    patchValue(service as unknown as object, 'prepareAdapter', async () => ({
      adapter: createMockAdapter({
        response: {
          text: '```plantuml\n@startuml\nAlice -> Bob: ok\n@enduml\n```',
        },
      }),
    }), restorers);

    patchValue(adaptivePipelineFlag as unknown as object, 'shouldUseAdaptivePipeline', () => true, restorers);
    const adaptive = await service.repairPlantUml('openai', 'mock-model', 'English', 'auto', 'broken', 'syntax error');
    patchValue(adaptivePipelineFlag as unknown as object, 'shouldUseAdaptivePipeline', () => false, restorers);
    const legacy = await service.repairPlantUml('openai', 'mock-model', 'English', 'auto', 'broken', 'syntax error');

    assert.deepStrictEqual(adaptive, legacy);
  });
});
