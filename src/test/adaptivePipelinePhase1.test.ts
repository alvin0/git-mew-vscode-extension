import * as assert from 'assert';
import * as fc from 'fast-check';
import * as path from 'path';
import {
  ALLOWED_TRANSITIONS,
  DuplicateFindingError,
  FindingNotFoundError,
  Finding,
  InvalidTransitionError,
} from '../services/llm/orchestrator/executionPlanTypes';
import {
  computeMetadataStats,
  renderChangedFiles,
  renderCodeQuality,
  renderFlowDiagram,
  renderImprovementsFallback,
  renderRisks,
  renderSummaryFallback,
  renderTodo,
} from '../services/llm/orchestrator/DeterministicRenderer';
import { HybridAssembly } from '../services/llm/orchestrator/HybridAssembly';
import { LegacyStructuredReportAdapter } from '../services/llm/orchestrator/adaptivePipelineTypes';
import { SharedContextStoreImpl } from '../services/llm/orchestrator/SharedContextStore';
import { SuppressionFilter, globMatch, normalize, sha256, wordOverlapRatio } from '../services/llm/orchestrator/SuppressionFilter';
import { CodeReviewerOutput, StructuredAgentReport } from '../services/llm/orchestrator/orchestratorTypes';
import { SuppressedFinding } from '../services/llm/reviewMemoryTypes';
import { createMockExecutionPlan } from './fixtures/adaptivePipelineFixtures';
import { smallPatchFixture } from './fixtures/diffFixtures';
import { assertMarkdownSnapshot } from './helpers/markdownSnapshotHelper';
import { mergeSynthesisOutputs } from '../services/llm/orchestrator/SynthesisMerger';

function extractSection(report: string, heading: string, nextHeading?: string): string {
  const start = report.indexOf(heading);
  assert.notStrictEqual(start, -1, `Heading ${heading} not found.`);
  const from = report.slice(start);
  if (!nextHeading) {
    return from.trim();
  }
  const end = from.indexOf(nextHeading);
  return (end === -1 ? from : from.slice(0, end)).trim();
}

function findSnapshot(...parts: string[]): string {
  return path.resolve(__dirname, '../../src/test/fixtures/goldenSnapshots', ...parts);
}

suite('Adaptive Pipeline Phase 1', () => {
  const structuredReports: StructuredAgentReport[] = [
    {
      role: 'Code Reviewer',
      structured: {
        issues: [
          {
            file: 'src/auth.ts',
            location: 'line 10',
            severity: 'major',
            category: 'correctness',
            description: 'Missing null check before accessing token.',
            suggestion: 'Add a guard clause before reading token fields.',
            confidence: 0.9,
          },
        ],
        affectedSymbols: ['login'],
        qualityVerdict: 'Not Bad',
      },
      raw: '{"issues":[]}',
    },
    {
      role: 'Flow Diagram',
      structured: {
        diagrams: [
          {
            name: 'Login Flow',
            type: 'sequence',
            plantumlCode: '@startuml\nAlice -> Bob: auth\n@enduml',
            description: 'Authentication flow update.',
          },
        ],
        affectedFlows: ['login'],
      },
      raw: '{"diagrams":[]}',
    },
    {
      role: 'Observer',
      structured: {
        risks: [
          {
            description: 'Login flow may skip validation on missing token.',
            severity: 'high',
            affectedArea: 'src/auth.ts',
            confidence: 0.8,
          },
        ],
        todoItems: [
          {
            action: 'Add regression test for empty token.',
            parallelizable: true,
            priority: 'high',
          },
        ],
        integrationConcerns: ['Auth service integration'],
      },
      raw: '{"risks":[]}',
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
            confidence: 0.82,
            description: 'Missing null check before accessing token.',
            remediation: 'Validate token before dereferencing it.',
          },
        ],
        authFlowConcerns: [],
        inputValidationGaps: [],
        dataExposureRisks: [],
      },
      raw: '{"vulnerabilities":[]}',
    },
  ];

  test('execution plan transition matrix and custom errors are available', () => {
    const plan = createMockExecutionPlan();
    assert.strictEqual(plan.patchIntent, 'mixed');
    assert.ok(ALLOWED_TRANSITIONS.specialist_agent.create.includes('proposed'));
    assert.strictEqual(new InvalidTransitionError('observer', 'proposed', 'suppressed').name, 'InvalidTransitionError');
    assert.strictEqual(new DuplicateFindingError('x').name, 'DuplicateFindingError');
    assert.strictEqual(new FindingNotFoundError('x').name, 'FindingNotFoundError');
  });

  test('suppression filter removes only matching legacy findings', () => {
    const result = SuppressionFilter.applyToLegacyReports(structuredReports, [{
      filePattern: 'src/**/*.ts',
      issueCategory: 'correctness',
      descriptionHash: sha256(normalize('Missing null check before accessing token.')),
      normalizedDescription: 'missing null check before accessing token.',
      dismissedAt: Date.now(),
    }]);

    const codeReviewer = result.filteredReports.find((report) => report.role === 'Code Reviewer');
    const observer = result.filteredReports.find((report) => report.role === 'Observer');
    assert.strictEqual(result.suppressedCount, 1);
    assert.strictEqual(codeReviewer?.structured.issues.length, 0);
    assert.strictEqual(observer?.structured.risks.length, 1);
  });

  test('suppression helpers preserve overlap boundaries', () => {
    assert.ok(wordOverlapRatio('missing null check before token access', 'missing null check before token access') >= 0.7);
    assert.ok(wordOverlapRatio('missing null check', 'completely unrelated finding') < 0.7);
  });

  test('suppression filter handles empty inputs and glob edge cases', () => {
    const empty = SuppressionFilter.applyToLegacyReports([], []);
    assert.strictEqual(empty.suppressedCount, 0);
    assert.strictEqual(empty.filteredReports.length, 0);
    assert.ok(globMatch('src/auth/login.ts', 'src/**/auth*') === false);
    assert.ok(globMatch('src/auth.ts', 'src/**/auth*'));
    assert.ok(globMatch('src/nested/file.ts', '**/*.ts'));
  });

  test('suppression filter leaves Flow Diagram reports untouched explicitly', () => {
    const flowOnly = structuredReports.filter((report) => report.role === 'Flow Diagram');
    const result = SuppressionFilter.applyToLegacyReports(flowOnly, [{
      filePattern: 'src/**/*.ts',
      issueCategory: 'correctness',
      descriptionHash: sha256(normalize('Missing null check before accessing token.')),
      normalizedDescription: 'missing null check before accessing token.',
      dismissedAt: Date.now(),
    }]);

    assert.strictEqual(result.suppressedCount, 0);
    assert.deepStrictEqual(result.filteredReports, flowOnly);
  });

  test('suppression filtering property matches hash or overlap threshold', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 32 }).filter((value) => value.trim().length > 0),
        fc.boolean(),
        async (description, useHashMatch) => {
          const normalized = normalize(description);
          const rule: SuppressedFinding = {
            filePattern: 'src/**/*.ts',
            issueCategory: 'correctness',
            descriptionHash: useHashMatch ? sha256(normalized) : sha256('something else'),
            normalizedDescription: useHashMatch ? undefined : normalized,
            dismissedAt: Date.now(),
          };

          const report: StructuredAgentReport = {
            role: 'Code Reviewer',
            structured: {
              issues: [{
                file: 'src/example.ts',
                location: 'line 1',
                severity: 'minor',
                category: 'correctness',
                description,
                suggestion: 'fix',
                confidence: 0.7,
              }],
              affectedSymbols: [],
              qualityVerdict: 'Safe',
            },
            raw: '{}',
          };

          const result = SuppressionFilter.applyToLegacyReports([report], [rule]);
          assert.strictEqual(result.suppressedCount, 1);
          assert.strictEqual((result.filteredReports[0].structured as CodeReviewerOutput).issues.length, 0);
        },
      ),
      { numRuns: 25 },
    );
  });

  test('suppression filter parity keeps legacy merged report free of suppressed findings', () => {
    const suppressedFinding: SuppressedFinding = {
      filePattern: 'src/**/*.ts',
      issueCategory: 'correctness',
      descriptionHash: sha256(normalize('Missing null check before accessing token.')),
      normalizedDescription: 'missing null check before accessing token.',
      dismissedAt: Date.now(),
    };

    const filtered = SuppressionFilter.applyToLegacyReports(structuredReports, [suppressedFinding]);
    const legacyReport = mergeSynthesisOutputs(
      new Map(),
      smallPatchFixture.changes,
      structuredReports,
      [suppressedFinding],
      100,
      'Detailed change body that is intentionally long enough to survive fallback rendering in legacy mode.',
      'English',
    );
    const codeQualitySection = extractSection(legacyReport, '## 5. Code Quality Assessment', '## 6. Improvement Suggestions');

    assert.strictEqual((filtered.filteredReports.find((report) => report.role === 'Code Reviewer')?.structured as CodeReviewerOutput).issues.length, 0);
    assert.ok(!codeQualitySection.includes('Missing null check before accessing token.'));
  });

  test('deterministic renderer emits stable sections', () => {
    const flow = structuredReports.find((report) => report.role === 'Flow Diagram')?.structured;
    const codeReviewer = structuredReports.find((report) => report.role === 'Code Reviewer')?.structured;
    const observer = structuredReports.find((report) => report.role === 'Observer')?.structured;
    const security = structuredReports.find((report) => report.role === 'Security Analyst')?.structured;
    const suppressedFindings: SuppressedFinding[] = [];

    const first = [
      renderChangedFiles(smallPatchFixture.changes),
      renderSummaryFallback(structuredReports),
      renderFlowDiagram(flow, 'English'),
      renderCodeQuality(codeReviewer, suppressedFindings, 'English'),
      renderImprovementsFallback(codeReviewer, security, suppressedFindings, 'English').markdown,
      renderTodo(observer, 'English'),
      renderRisks(observer, security, suppressedFindings, 'English'),
    ].join('\n\n');

    const second = [
      renderChangedFiles(smallPatchFixture.changes),
      renderSummaryFallback(structuredReports),
      renderFlowDiagram(flow, 'English'),
      renderCodeQuality(codeReviewer, suppressedFindings, 'English'),
      renderImprovementsFallback(codeReviewer, security, suppressedFindings, 'English').markdown,
      renderTodo(observer, 'English'),
      renderRisks(observer, security, suppressedFindings, 'English'),
    ].join('\n\n');

    assert.strictEqual(first, second);
  });

  test('deterministic renderer parity matches synthesis merger fallback sections', () => {
    const report = mergeSynthesisOutputs(
      new Map(),
      smallPatchFixture.changes,
      structuredReports,
      [],
      100,
      'Detailed change body that is intentionally long enough to survive fallback rendering in legacy mode.',
      'English',
    );
    const flow = structuredReports.find((item) => item.role === 'Flow Diagram')?.structured;
    const codeReviewer = structuredReports.find((item) => item.role === 'Code Reviewer')?.structured;
    const observer = structuredReports.find((item) => item.role === 'Observer')?.structured;
    const security = structuredReports.find((item) => item.role === 'Security Analyst')?.structured;

    assert.strictEqual(extractSection(report, '## 1. Changed File Paths', '## 2. Summary of Changes'), renderChangedFiles(smallPatchFixture.changes));
    assert.strictEqual(extractSection(report, '## 4. Flow Diagram', '## 5. Code Quality Assessment'), renderFlowDiagram(flow, 'English'));
    assert.strictEqual(extractSection(report, '## 5. Code Quality Assessment', '## 6. Improvement Suggestions'), renderCodeQuality(codeReviewer, [], 'English'));
    assert.strictEqual(extractSection(report, '## 7. Observer TODO List', '## 8. Potential Hidden Risks'), renderTodo(observer, 'English'));
    assert.strictEqual(extractSection(report, '## 8. Potential Hidden Risks', '<!-- Review Metadata:'), renderRisks(observer, security, [], 'English'));
  });

  test('golden snapshots lock deterministic sections and empty states', () => {
    const flow = structuredReports.find((report) => report.role === 'Flow Diagram')?.structured;
    const codeReviewer = structuredReports.find((report) => report.role === 'Code Reviewer')?.structured;
    const observer = structuredReports.find((report) => report.role === 'Observer')?.structured;
    const security = structuredReports.find((report) => report.role === 'Security Analyst')?.structured;

    assertMarkdownSnapshot(renderChangedFiles(smallPatchFixture.changes), findSnapshot('changedFiles.md'));
    assertMarkdownSnapshot(renderFlowDiagram(flow, 'English'), findSnapshot('flowDiagram.md'));
    assertMarkdownSnapshot(renderCodeQuality(codeReviewer, [], 'English'), findSnapshot('codeQuality.md'));
    assertMarkdownSnapshot(renderTodo(observer, 'English'), findSnapshot('todo.md'));
    assertMarkdownSnapshot(renderRisks(observer, security, [], 'English'), findSnapshot('risks.md'));
    assertMarkdownSnapshot(renderFlowDiagram(undefined, 'Vietnamese'), findSnapshot('emptyDiagram.vi.md'));
    assertMarkdownSnapshot(renderTodo(undefined, 'Japanese'), findSnapshot('emptyTodo.ja.md'));
    assertMarkdownSnapshot(renderRisks(undefined, undefined, [], 'English'), findSnapshot('emptyRisks.en.md'));
  });

  test('deterministic rendering property is idempotent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...smallPatchFixture.changes.map((item) => item.relativePath)), { minLength: 1, maxLength: smallPatchFixture.changes.length }),
        async () => {
          const flow = structuredReports.find((report) => report.role === 'Flow Diagram')?.structured;
          const codeReviewer = structuredReports.find((report) => report.role === 'Code Reviewer')?.structured;
          const observer = structuredReports.find((report) => report.role === 'Observer')?.structured;
          const security = structuredReports.find((report) => report.role === 'Security Analyst')?.structured;

          const first = [
            renderChangedFiles(smallPatchFixture.changes),
            renderFlowDiagram(flow, 'English'),
            renderCodeQuality(codeReviewer, [], 'English'),
            renderTodo(observer, 'English'),
            renderRisks(observer, security, [], 'English'),
          ].join('\n\n');
          const second = [
            renderChangedFiles(smallPatchFixture.changes),
            renderFlowDiagram(flow, 'English'),
            renderCodeQuality(codeReviewer, [], 'English'),
            renderTodo(observer, 'English'),
            renderRisks(observer, security, [], 'English'),
          ].join('\n\n');

          assert.strictEqual(first, second);
        },
      ),
      { numRuns: 25 },
    );
  });

  test('severity sorting property keeps higher severity findings first in rendered sections', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom<Finding['severity']>('critical', 'major', 'minor', 'suggestion'), { minLength: 4, maxLength: 8 }),
        async (severities) => {
          const report: StructuredAgentReport = {
            role: 'Code Reviewer',
            structured: {
              issues: severities.map((severity, index) => ({
                file: 'src/sort.ts',
                location: `line ${index + 1}`,
                severity,
                category: 'correctness',
                description: `issue-${severity}-${index}`,
                suggestion: 'fix',
                confidence: 0.8,
              })),
              affectedSymbols: [],
              qualityVerdict: 'Safe',
            },
            raw: '{}',
          };

          const markdown = renderImprovementsFallback(report.structured, undefined, [], 'English').markdown;
          const actualOrder = markdown
            .split('\n')
            .filter((line) => line.includes('**Issue**'))
            .map((line) => line.match(/issue-(critical|major|minor|suggestion)-\d+/)?.[1] ?? '');
          const expectedOrder = [...severities].sort((left, right) => {
            const weights: Record<Finding['severity'], number> = { critical: 4, major: 3, minor: 2, suggestion: 1 };
            return weights[right] - weights[left];
          });

          assert.deepStrictEqual(actualOrder, expectedOrder);
        },
      ),
      { numRuns: 25 },
    );
  });

  test('hybrid assembly preserves 8-section report structure and metadata footer', () => {
    const assembly = new HybridAssembly();
    const report = assembly.assemble({
      structuredReports,
      changedFiles: smallPatchFixture.changes,
      detailChangeReport: 'This section explains the detail change in a sufficiently long form for the sanitizer to keep intact.',
      language: 'English',
      reviewDurationMs: 123,
      suppressedFindings: [],
    });

    assert.ok(assembly.validateReportStructure(report));
    assert.ok(report.includes('## 3. Detail Change'));
    assert.ok(report.includes('cross_validated=1'));
  });

  test('hybrid assembly falls back when detail change content is too short', () => {
    const assembly = new HybridAssembly();
    const report = assembly.assemble({
      structuredReports,
      changedFiles: smallPatchFixture.changes,
      detailChangeReport: 'short',
      language: 'English',
      reviewDurationMs: 123,
      suppressedFindings: [],
    });

    assert.ok(report.includes('Detail change not available'));
  });

  test('hybrid assembly report structure parity matches legacy report shape', () => {
    const assembly = new HybridAssembly();
    const adaptive = assembly.assemble({
      structuredReports,
      changedFiles: smallPatchFixture.changes,
      detailChangeReport: 'This section explains the detail change in a sufficiently long form for the sanitizer to keep intact.',
      language: 'English',
      reviewDurationMs: 123,
      suppressedFindings: [],
    });
    const legacy = mergeSynthesisOutputs(
      new Map(),
      smallPatchFixture.changes,
      structuredReports,
      [],
      123,
      'This section explains the detail change in a sufficiently long form for the sanitizer to keep intact.',
      'English',
    );

    const headings = (text: string) => text.match(/^## .+$/gm) ?? [];
    assert.deepStrictEqual(headings(adaptive), headings(legacy));
    assert.ok(/<!-- Review Metadata: .+ -->/s.test(adaptive));
    assert.ok(/<!-- Review Metadata: .+ -->/s.test(legacy));
  });

  test('report structure invariant property holds across languages and optional detail content', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('English', 'Vietnamese', 'Japanese'),
        fc.option(fc.string({ minLength: 0, maxLength: 120 }), { nil: undefined }),
        async (language, detailChangeReport) => {
          const assembly = new HybridAssembly();
          const report = assembly.assemble({
            structuredReports,
            changedFiles: smallPatchFixture.changes,
            detailChangeReport,
            language,
            reviewDurationMs: 111,
            suppressedFindings: [],
          });
          assert.ok(assembly.validateReportStructure(report));
        },
      ),
      { numRuns: 25 },
    );
  });

  test('legacy structured report adapter reconstructs structured reports from shared store', () => {
    const store = new SharedContextStoreImpl();
    store.addAgentFindings('Code Reviewer', [{ agentRole: 'Code Reviewer', type: 'issue', data: structuredReports[0].structured, timestamp: Date.now() }]);
    store.addAgentFindings('Flow Diagram', [{ agentRole: 'Flow Diagram', type: 'flow', data: structuredReports[1].structured, timestamp: Date.now() }]);
    store.addAgentFindings('Observer', [{ agentRole: 'Observer', type: 'risk', data: structuredReports[2].structured, timestamp: Date.now() }]);

    const reports = LegacyStructuredReportAdapter.fromSharedStore(store, [
      '### Agent: Code Reviewer\n\n{}',
      '### Agent: Flow Diagram\n\n{}',
      '### Agent: Observer\n\n{}',
    ]);

    assert.strictEqual(reports.length, 3);
    assert.strictEqual(reports[0].role, 'Code Reviewer');
    assert.strictEqual(reports[2].role, 'Observer');
    assert.deepStrictEqual((reports[0].structured as CodeReviewerOutput).issues[0], (structuredReports[0].structured as CodeReviewerOutput).issues[0]);
    assert.ok(reports[0].raw.startsWith('### Agent: Code Reviewer'));
  });

  test('metadata stats include observer findings', () => {
    const codeReviewer = structuredReports.find((report) => report.role === 'Code Reviewer')?.structured;
    const security = structuredReports.find((report) => report.role === 'Security Analyst')?.structured;
    const observer = structuredReports.find((report) => report.role === 'Observer')?.structured;
    const stats = computeMetadataStats(codeReviewer, security, observer, []);

    assert.strictEqual(stats.totalFindings, 3);
    assert.strictEqual(stats.byAgent.OB, 1);
  });

  test('detail change pass-through property keeps long content', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 60, maxLength: 120 }), async (body) => {
        const assembly = new HybridAssembly();
        const sanitized = assembly.sanitizeDetailChange(body);
        assert.ok(sanitized.includes(body.trim()));
      }),
      { numRuns: 25 },
    );
  });

  test('provenance tagging property assigns expected tags and cross validation markers', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (includeCrossValidation) => {
        const assembly = new HybridAssembly();
        const findings: Finding[] = [
          {
            id: 'cr',
            agentRole: 'Code Reviewer',
            category: 'correctness',
            severity: 'major',
            confidence: 0.9,
            status: 'verified',
            file: 'src/example.ts',
            lineRange: { start: 1, end: 2 },
            description: 'token validation missing in auth flow',
            suggestion: 'fix',
            evidenceRefs: [],
            linkedFindingIds: [],
          },
          {
            id: 'sa',
            agentRole: 'Security Analyst',
            category: 'security',
            severity: 'major',
            confidence: 0.9,
            status: 'verified',
            file: 'src/example.ts',
            lineRange: { start: 1, end: 2 },
            description: includeCrossValidation ? 'token validation missing in auth flow' : 'another separate issue',
            suggestion: 'fix',
            evidenceRefs: [],
            linkedFindingIds: [],
          },
          {
            id: 'ob',
            agentRole: 'Observer',
            category: 'integration',
            severity: 'minor',
            confidence: 0.7,
            status: 'verified',
            file: 'src/example.ts',
            lineRange: { start: 1, end: 2 },
            description: 'observer concern',
            suggestion: 'review',
            evidenceRefs: [],
            linkedFindingIds: [],
          },
        ];

        const tagged = assembly.tagFindings(findings);
        assert.ok(tagged.find((item) => item.id === 'cr')?.provenance.includes('[CR]'));
        assert.ok(tagged.find((item) => item.id === 'sa')?.provenance.includes('[SA]'));
        assert.ok(tagged.find((item) => item.id === 'ob')?.provenance.includes('[OB]'));
        assert.strictEqual(tagged.find((item) => item.id === 'cr')?.provenance.includes('[XV]') ?? false, includeCrossValidation);
      }),
      { numRuns: 25 },
    );
  });
});
