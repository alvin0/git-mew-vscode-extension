import * as assert from 'assert';
import * as fc from 'fast-check';
import { SessionMemory } from '../services/llm/orchestrator/SessionMemory';
import {
  ActorRole,
  ALLOWED_TRANSITIONS,
  Finding,
  Hypothesis,
  InvalidTransitionError,
} from '../services/llm/orchestrator/executionPlanTypes';
import { SuppressionFilter } from '../services/llm/orchestrator/SuppressionFilter';
import {
  buildImprovementWriterPrompt,
  buildSummaryWriterPrompt,
  shouldActivateImprovementWriter,
  shouldActivateSummaryWriter,
} from '../services/llm/orchestrator/SectionWriters';
import { HybridAssembly } from '../services/llm/orchestrator/HybridAssembly';
import { createMockAdapter } from './helpers/mockLLMAdapter';
import { AdapterCalibrationService } from '../services/llm/orchestrator/AdapterCalibrationService';
import { DEFAULT_ORCHESTRATOR_CONFIG } from '../services/llm/orchestrator/orchestratorTypes';
import { TokenEstimatorService } from '../services/llm/TokenEstimatorService';
import { createMockChangedFile, createMockExecutionPlan } from './fixtures/adaptivePipelineFixtures';
import { TelemetryTestSink, assertEventEmitted } from './helpers/telemetryTestSink';
import { PipelineTelemetryEvent } from '../services/llm/orchestrator/telemetryTypes';

function createFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: overrides.id ?? 'finding-1',
    agentRole: overrides.agentRole ?? 'Code Reviewer',
    category: overrides.category ?? 'correctness',
    severity: overrides.severity ?? 'major',
    confidence: overrides.confidence ?? 0.8,
    status: overrides.status ?? 'proposed',
    file: overrides.file ?? 'src/app.ts',
    lineRange: overrides.lineRange ?? { start: 10, end: 12 },
    description: overrides.description ?? 'Potential null handling issue.',
    suggestion: overrides.suggestion ?? 'Guard the nullable value before access.',
    evidenceRefs: overrides.evidenceRefs ?? [{
      file: 'src/app.ts',
      lineRange: { start: 10, end: 12 },
      toolResultId: null,
      diffLineRef: true,
    }],
    linkedFindingIds: overrides.linkedFindingIds ?? [],
  };
}

function createHypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: overrides.id ?? 'hyp-1',
    sourceAgentRole: overrides.sourceAgentRole ?? 'Code Reviewer',
    category: overrides.category ?? 'integration',
    description: overrides.description ?? 'Consumer modules may not handle the new return shape.',
    affectedFiles: overrides.affectedFiles ?? ['src/app.ts'],
    confidence: overrides.confidence ?? 0.6,
    status: overrides.status ?? 'proposed',
    evidenceRefs: overrides.evidenceRefs ?? [],
    linkedFindingIds: overrides.linkedFindingIds ?? [],
  };
}

suite('Adaptive Pipeline Phase 3', () => {
  test('Property 1: Finding/Hypothesis round-trip preservation', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        async (file, description) => {
          const memory = new SessionMemory();
          const finding = createFinding({
            id: `finding-${file}`,
            file,
            description,
            linkedFindingIds: ['missing-related-id'],
          });
          const hypothesis = createHypothesis({
            id: `hyp-${file}`,
            description: `${description}-hyp`,
            linkedFindingIds: [finding.id],
          });

          memory.addFinding(finding, 'specialist_agent');
          memory.transitionFindingStatus(finding.id, 'verified', 'self_audit');
          memory.addHypothesis(hypothesis, 'specialist_agent');
          memory.transitionHypothesisStatus(hypothesis.id, 'verified', 'observer');

          assert.deepStrictEqual(memory.getFindings({ status: ['verified'] })[0], {
            ...finding,
            status: 'verified',
          });
          assert.deepStrictEqual(memory.getHypotheses({ status: ['verified'] })[0], {
            ...hypothesis,
            status: 'verified',
          });
        },
      ),
    );
  });

  test('Property 2: Ownership enforcement accepts only allowed transitions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<ActorRole>('specialist_agent', 'self_audit', 'observer', 'suppression_filter', 'section_writer', 'deterministic_renderer', 'hybrid_assembly'),
        fc.constantFrom('proposed', 'verified', 'rejected', 'suppressed'),
        fc.constantFrom('proposed', 'verified', 'rejected', 'suppressed'),
        async (actor, currentStatus, targetStatus) => {
          const memory = new SessionMemory();
          const finding = createFinding({ id: `${actor}-${currentStatus}-${targetStatus}` });
          memory.addFinding(finding, 'specialist_agent');
          if (currentStatus !== 'proposed') {
            try {
              memory.transitionFindingStatus(finding.id, currentStatus as any, currentStatus === 'verified' ? 'self_audit' : 'observer');
            } catch {
              return;
            }
          }

          const allowed = ((ALLOWED_TRANSITIONS[actor] as Record<string, readonly string[]>)[currentStatus] ?? []).includes(targetStatus);
          if (allowed) {
            memory.transitionFindingStatus(finding.id, targetStatus as any, actor);
            assert.strictEqual(memory.getFindings({ status: [targetStatus as any] })[0]?.status, targetStatus);
          } else {
            assert.throws(() => memory.transitionFindingStatus(finding.id, targetStatus as any, actor), InvalidTransitionError);
          }
        },
      ),
    );
  });

  test('Property 3: renderable filtering excludes rejected findings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('proposed', 'verified', 'rejected', 'suppressed'), { minLength: 4, maxLength: 12 }),
        async (statuses) => {
          const memory = new SessionMemory();
          statuses.forEach((status, index) => {
            const id = `finding-${index}`;
            memory.addFinding(createFinding({ id }), 'specialist_agent');
            if (status === 'verified') {
              memory.transitionFindingStatus(id, 'verified', 'self_audit');
            } else if (status === 'rejected') {
              memory.transitionFindingStatus(id, 'rejected', 'self_audit');
            } else if (status === 'suppressed') {
              memory.transitionFindingStatus(id, 'verified', 'self_audit');
              memory.transitionFindingStatus(id, 'suppressed', 'suppression_filter');
            }
          });

          assert.ok(memory.getRenderableFindings().every((finding) => finding.status === 'proposed' || finding.status === 'verified'));
        },
      ),
    );
  });

  test('SessionMemory contract transitions and bridge APIs work', () => {
    const memory = new SessionMemory();
    const finding = createFinding({ id: 'contract-finding' });
    memory.addFinding(finding, 'specialist_agent');
    memory.transitionFindingStatus(finding.id, 'verified', 'self_audit');
    memory.transitionFindingStatus(finding.id, 'suppressed', 'suppression_filter');
    assert.strictEqual(memory.getFindings({ status: ['suppressed'] }).length, 1);

    memory.addAgentFindings('Code Reviewer', [{
      agentRole: 'Code Reviewer',
      type: 'issue',
      data: {
        issues: [{
          file: 'src/bridge.ts',
          location: '12',
          severity: 'major',
          category: 'correctness',
          description: 'Legacy bridge issue',
          suggestion: 'Fix legacy bridge issue',
          confidence: 0.8,
        }],
        affectedSymbols: [],
        qualityVerdict: 'Good',
      },
      timestamp: Date.now(),
    }]);
    assert.strictEqual(memory.getAgentFindings('Code Reviewer').length, 1);
    assert.ok(memory.getFindings({ agentRole: 'Code Reviewer', status: ['proposed', 'verified'] }).length >= 1);
  });

  test('SuppressionFilter transitions verified findings to suppressed in SessionMemory', () => {
    const memory = new SessionMemory();
    const finding = createFinding({
      id: 'suppress-me',
      file: 'src/auth/login.ts',
      category: 'correctness',
      description: 'Token validation is skipped for expired sessions.',
    });
    memory.addFinding(finding, 'specialist_agent');
    memory.transitionFindingStatus(finding.id, 'verified', 'self_audit');

    const result = SuppressionFilter.applyToSessionMemory(memory, [{
      filePattern: 'src/**/*.ts',
      issueCategory: 'correctness',
      descriptionHash: '',
      normalizedDescription: 'token validation is skipped for expired sessions.',
      dismissedAt: Date.now(),
    }]);

    assert.strictEqual(result.suppressedCount, 1);
    assert.strictEqual(memory.getFindings({ status: ['suppressed'] }).length, 1);
  });

  test('Property 7: Section Writer activation rules follow execution plan and finding thresholds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'small' | 'medium' | 'large'>('small', 'medium', 'large'),
        fc.array(fc.constantFrom<'critical' | 'major' | 'minor' | 'suggestion'>('critical', 'major', 'minor', 'suggestion'), { minLength: 0, maxLength: 6 }),
        async (patchSize, severities) => {
          const plan = createMockExecutionPlan({ patchSize });
          const findings = severities.map((severity, index) => createFinding({ id: `f-${index}`, severity }));
          assert.strictEqual(shouldActivateSummaryWriter(plan), patchSize !== 'small');
          assert.strictEqual(
            shouldActivateImprovementWriter(findings),
            findings.length >= 3 || findings.some((finding) => finding.severity === 'critical' || finding.severity === 'major'),
          );
        },
      ),
    );
  });

  test('Section Writer fallback keeps report complete and emits telemetry', async () => {
    const memory = new SessionMemory();
    memory.addFinding(createFinding({ id: 'f-1', severity: 'major' }), 'specialist_agent');
    memory.transitionFindingStatus('f-1', 'verified', 'self_audit');
    memory.addAgentFindings('Flow Diagram', [{
      agentRole: 'Flow Diagram',
      type: 'flow',
      data: { diagrams: [], affectedFlows: [] },
      timestamp: Date.now(),
    }]);
    memory.addAgentFindings('Observer', [{
      agentRole: 'Observer',
      type: 'risk',
      data: { risks: [], todoItems: [], integrationConcerns: [] },
      timestamp: Date.now(),
    }]);

    const adapter = createMockAdapter({
      async generateText() {
        throw new Error('writer timeout');
      },
    });
    const calibration = new AdapterCalibrationService(DEFAULT_ORCHESTRATOR_CONFIG, new TokenEstimatorService());
    const telemetry = new TelemetryTestSink();
    const assembly = new HybridAssembly();
    const result = await assembly.assembleAdaptive({
      sessionMemory: memory,
      executionPlan: createMockExecutionPlan({
        patchSize: 'large',
        sectionWriters: { summary: true, improvements: true },
        sectionWriterBudgets: { summary: 600, improvements: 600 },
      }),
      adapter,
      calibration,
      changedFiles: [createMockChangedFile({ relativePath: 'src/app.ts', filePath: 'src/app.ts' })],
      language: 'English',
      reviewDurationMs: 100,
      suppressedFindings: [],
      telemetryEmitter: telemetry,
    });

    assert.ok(result.review.includes('## 2. Summary of Changes'));
    assert.ok(result.review.includes('## 6. Improvement Suggestions'));
    assert.ok(result.review.includes('## 8. Potential Hidden Risks'));
    assertEventEmitted(telemetry, PipelineTelemetryEvent.SECTION_WRITER_FALLBACK);
  });

  test('Section writer prompts are built from structured findings only', () => {
    const findings = [
      createFinding({ id: 'summary-1', severity: 'critical' }),
      createFinding({ id: 'summary-2', category: 'security', agentRole: 'Security Analyst' }),
    ];
    const summaryPrompt = buildSummaryWriterPrompt({
      findings,
      changedFiles: [createMockChangedFile({ relativePath: 'src/app.ts', filePath: 'src/app.ts' })],
      language: 'English',
      tokenBudget: 500,
    });
    const improvementsPrompt = buildImprovementWriterPrompt({
      findings,
      language: 'English',
      tokenBudget: 500,
    });

    assert.ok(summaryPrompt.includes('## Renderable Findings'));
    assert.ok(improvementsPrompt.includes('### correctness') || improvementsPrompt.includes('### security'));
  });
});
