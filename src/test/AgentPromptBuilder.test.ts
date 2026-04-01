import * as assert from 'assert';
import { AgentPromptBuilder } from '../services/llm/orchestrator/AgentPromptBuilder';
import {
  ContextBudgetManager,
  DEFAULT_BUDGET_CONFIG,
} from '../services/llm/orchestrator/ContextBudgetManager';
import { TokenEstimatorService } from '../services/llm/TokenEstimatorService';
import {
  AgentBudgetAllocation,
  AgentPromptBuildContext,
  CodeReviewerOutput,
  FlowDiagramOutput,
  ObserverOutput,
  StructuredAgentReport,
  DependencyGraphData,
  RiskHypothesis,
} from '../services/llm/orchestrator/orchestratorTypes';
import { SharedContextStoreImpl } from '../services/llm/orchestrator/SharedContextStore';
import { REVIEW_OUTPUT_CONTRACT } from '../prompts/reviewOutputContract';
import { UnifiedDiffFile } from '../services/llm/contextTypes';
import {
  findReferencesTool,
  getDiagnosticsTool,
  readFileTool,
  getSymbolDefinitionTool,
  readCommitMessagesTool,
  searchCodeTool,
} from '../llm-tools/tools';

// ── Helpers ──

function createBuilder(): AgentPromptBuilder {
  const budgetManager = new ContextBudgetManager(DEFAULT_BUDGET_CONFIG, new TokenEstimatorService());
  return new AgentPromptBuilder(budgetManager, new TokenEstimatorService());
}

function createBudget(overrides?: Partial<AgentBudgetAllocation>): AgentBudgetAllocation {
  return {
    agentRole: 'Code Reviewer',
    totalBudget: 50000,
    diffBudget: 20000,
    referenceBudget: 10000,
    sharedContextBudget: 5000,
    reservedForOutput: 8000,
    ...overrides,
  };
}

function createChangedFile(overrides?: Partial<UnifiedDiffFile>): UnifiedDiffFile {
  return {
    filePath: '/workspace/src/auth.ts',
    relativePath: 'src/auth.ts',
    diff: `--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -10,6 +10,8 @@ function login\n context line\n-  old line\n+  new line\n context line`,
    status: 1,
    statusLabel: 'modified',
    isDeleted: false,
    isBinary: false,
    ...overrides,
  };
}

/** Diff with a mix of structural and logic-only changes */
const MIXED_DIFF = `diff --git a/src/service.ts b/src/service.ts
--- a/src/service.ts
+++ b/src/service.ts
@@ -1,10 +1,12 @@ module header
-import { OldDep } from './old';
+import { NewDep } from './new';
 context line
-function processData(input: string): void {
+export function processData(input: string, flag: boolean): void {
   const x = 1;
-  if (x > 0) {
+  if (x > 0 && flag) {
     console.log('yes');
+    const temp = x + 1;
   }
 }`;

/** Diff with only logic changes (no structural) */
const LOGIC_ONLY_DIFF = `diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -5,4 +5,6 @@ function helper
   const a = 1;
-  if (a > 0) {
+  if (a > 0 && b > 0) {
     result = a + b;
+    const temp = result * 2;
   }`;

function createBuildContext(overrides?: Partial<AgentPromptBuildContext>): AgentPromptBuildContext {
  return {
    fullDiff: MIXED_DIFF,
    changedFiles: [createChangedFile()],
    language: 'typescript',
    ...overrides,
  };
}

function createDependencyGraph(): DependencyGraphData {
  return {
    fileDependencies: new Map([
      ['src/auth.ts', { imports: ['src/utils.ts'], importedBy: ['src/app.ts'] }],
      ['src/utils.ts', { imports: [], importedBy: ['src/auth.ts'] }],
    ]),
    symbolMap: new Map([
      ['login', { definedIn: 'src/auth.ts', referencedBy: ['src/app.ts', 'src/test.ts'], type: 'function' }],
    ]),
    criticalPaths: [
      { files: ['src/auth.ts', 'src/utils.ts', 'src/app.ts'], changedFileCount: 3, description: 'Chain: auth.ts → utils.ts → app.ts (3 changed files)' },
    ],
  };
}

suite('AgentPromptBuilder', () => {

  // ── buildCodeReviewerPrompt ──

  test('buildCodeReviewerPrompt: prompt contains full diff, does NOT contain REVIEW_OUTPUT_CONTRACT or other role instructions', () => {
    const builder = createBuilder();
    const ctx = createBuildContext();
    const budget = createBudget();

    const result = builder.buildCodeReviewerPrompt(ctx, budget);

    // Prompt should contain the full diff text
    assert.ok(result.prompt.includes('import { NewDep }'), 'Prompt should contain full diff content');
    assert.ok(result.prompt.includes('processData'), 'Prompt should contain function names from diff');

    // System message should NOT contain REVIEW_OUTPUT_CONTRACT
    assert.ok(!result.systemMessage.includes('Hard requirements'), 'System message should not contain REVIEW_OUTPUT_CONTRACT');
    assert.ok(!result.systemMessage.includes('Changed File Paths'), 'System message should not contain output contract sections');

    // System message should NOT contain Flow Diagram or Observer instructions
    assert.ok(!result.systemMessage.includes('Flow Diagram Agent'), 'System message should not contain Flow Diagram instructions');
    assert.ok(!result.systemMessage.includes('Observer Agent'), 'System message should not contain Observer instructions');

    // System message SHOULD contain Code Reviewer instructions
    assert.ok(result.systemMessage.includes('Code Reviewer'), 'System message should contain Code Reviewer instructions');
  });

  test('buildCodeReviewerPrompt: tools array includes all required tools', () => {
    const builder = createBuilder();
    const ctx = createBuildContext();
    const budget = createBudget();

    const result = builder.buildCodeReviewerPrompt(ctx, budget);

    assert.ok(result.tools, 'Tools should be defined');
    const toolIds = result.tools!.map(t => t.id);

    assert.ok(toolIds.includes(findReferencesTool.id), 'Should include findReferencesTool');
    assert.ok(toolIds.includes(getDiagnosticsTool.id), 'Should include getDiagnosticsTool');
    assert.ok(toolIds.includes(readFileTool.id), 'Should include readFileTool');
    assert.ok(toolIds.includes(getSymbolDefinitionTool.id), 'Should include getSymbolDefinitionTool');
    assert.ok(toolIds.includes(searchCodeTool.id), 'Should include searchCodeTool');
    assert.ok(toolIds.includes('query_context'), 'Should include queryContextTool');
  });

  test('buildCodeReviewerPrompt: additional review-specific tools can be injected per workflow', () => {
    const builder = createBuilder();
    const ctx = createBuildContext({ additionalTools: [readCommitMessagesTool] });
    const budget = createBudget();

    const result = builder.buildCodeReviewerPrompt(ctx, budget);
    const toolIds = result.tools!.map(t => t.id);

    assert.ok(toolIds.includes(readCommitMessagesTool.id), 'Should include merged-branch commit history tool when provided');
  });

  test('buildObserverPrompt: additional review-specific tools can be injected per workflow', () => {
    const builder = createBuilder();
    const ctx = createBuildContext({ additionalTools: [readCommitMessagesTool] });
    const budget = createBudget({ agentRole: 'Observer' });

    const result = builder.buildObserverPrompt(ctx, budget);
    const toolIds = result.tools!.map(t => t.id);

    assert.ok(toolIds.includes(readCommitMessagesTool.id), 'Observer should receive merged-branch commit history tool when provided');
  });

  test('buildDetailChangePrompt: uses full diff and supports additional workflow tools', () => {
    const builder = createBuilder();
    const ctx = createBuildContext({ additionalTools: [readCommitMessagesTool] });
    const budget = createBudget({ agentRole: 'Detail Change' });

    const result = builder.buildDetailChangePrompt(ctx, budget);
    const toolIds = result.tools!.map(t => t.id);

    assert.ok(result.prompt.includes('import { NewDep }'), 'Detail Change prompt should include full diff');
    assert.ok(result.systemMessage.includes('Detail Change Agent'), 'System message should identify the detail agent');
    assert.ok(toolIds.includes(readCommitMessagesTool.id), 'Detail Change should receive merged-branch commit history tool when provided');
  });

  test('all review agent prompts include custom system prompt, custom rules, and custom agent instructions', () => {
    const builder = createBuilder();
    const ctx = createBuildContext({
      customSystemPrompt: 'Repository policy: prioritize auditability.',
      customRules: 'Never suggest skipping tests.',
      customAgentInstructions: 'Mention cross-module impact when relevant.',
    });

    const prompts = [
      builder.buildCodeReviewerPrompt(ctx, createBudget()),
      builder.buildFlowDiagramPrompt(ctx, createBudget({ agentRole: 'Flow Diagram' })),
      builder.buildObserverPrompt(ctx, createBudget({ agentRole: 'Observer' })),
      builder.buildDetailChangePrompt(ctx, createBudget({ agentRole: 'Detail Change' })),
    ];

    for (const prompt of prompts) {
      assert.ok(prompt.systemMessage.includes('Repository policy: prioritize auditability.'), `${prompt.role} should include custom system prompt`);
      assert.ok(prompt.systemMessage.includes('Never suggest skipping tests.'), `${prompt.role} should include custom rules`);
      assert.ok(prompt.systemMessage.includes('Mention cross-module impact when relevant.'), `${prompt.role} should include custom agent instructions`);
    }
  });

  test('buildCodeReviewerPrompt: returned AgentPrompt has phase: 1, outputSchema: code-reviewer, selfAudit: true', () => {
    const builder = createBuilder();
    const ctx = createBuildContext();
    const budget = createBudget();

    const result = builder.buildCodeReviewerPrompt(ctx, budget);

    assert.strictEqual(result.phase, 1);
    assert.strictEqual(result.outputSchema, 'code-reviewer');
    assert.strictEqual(result.selfAudit, true);
    assert.strictEqual(result.role, 'Code Reviewer');
  });

  // ── buildFlowDiagramPrompt ──

  test('buildFlowDiagramPrompt: prompt contains structural diff only, not logic-only changes', () => {
    const builder = createBuilder();
    const ctx = createBuildContext({ fullDiff: MIXED_DIFF });
    const budget = createBudget({ agentRole: 'Flow Diagram' });

    const result = builder.buildFlowDiagramPrompt(ctx, budget);

    // Structural changes should be present
    assert.ok(
      result.prompt.includes('import') || result.prompt.includes('export function'),
      'Prompt should contain structural changes (import or function sig)',
    );

    // Logic-only changes should NOT be present (the if/else change)
    // The line `+  if (x > 0 && flag) {` is logic-only, should be filtered out
    assert.ok(
      !result.prompt.includes('if (x > 0 && flag)'),
      'Prompt should NOT contain logic-only changes like if/else modifications',
    );

    // Variable assignment should NOT be present
    assert.ok(
      !result.prompt.includes('const temp = x + 1'),
      'Prompt should NOT contain variable assignment changes',
    );
  });

  test('buildFlowDiagramPrompt: prompt contains dependency graph serialized as critical-paths', () => {
    const builder = createBuilder();
    const graph = createDependencyGraph();
    const ctx = createBuildContext({ dependencyGraph: graph });
    const budget = createBudget({ agentRole: 'Flow Diagram' });

    const result = builder.buildFlowDiagramPrompt(ctx, budget);

    // critical-paths serialization should include critical path descriptions
    assert.ok(
      result.prompt.includes('Critical Paths') || result.prompt.includes('critical'),
      'Prompt should contain critical paths section from dependency graph',
    );
  });

  // ── buildObserverPrompt ──

  test('buildObserverPrompt: prompt contains diff summary, does NOT contain full diff text', () => {
    const builder = createBuilder();
    const ctx = createBuildContext();
    const budget = createBudget({ agentRole: 'Observer' });

    const result = builder.buildObserverPrompt(ctx, budget);

    // Should contain diff summary format
    assert.ok(
      result.prompt.includes('Changed Files Summary'),
      'Prompt should contain Changed Files Summary heading',
    );
    assert.ok(
      result.prompt.includes('src/auth.ts'),
      'Prompt should contain file path in summary',
    );

    // Should NOT contain full diff text (raw diff lines)
    assert.ok(
      !result.prompt.includes('import { NewDep }'),
      'Prompt should NOT contain full diff content',
    );
    assert.ok(
      !result.prompt.includes('export function processData'),
      'Prompt should NOT contain raw diff lines from full diff',
    );
  });

  test('buildObserverPrompt with Phase 1 findings in store: prompt contains serialized CR issues and FD flows', () => {
    const builder = createBuilder();
    const store = new SharedContextStoreImpl();

    // Add Code Reviewer findings
    const crData: CodeReviewerOutput = {
      issues: [{
        file: 'src/auth.ts',
        location: 'line 15',
        severity: 'major',
        category: 'correctness',
        description: 'null check missing for user input',
        suggestion: 'add null check',
      }],
      affectedSymbols: ['login'],
      qualityVerdict: 'Not Bad',
    };
    store.addAgentFindings('Code Reviewer', [{
      agentRole: 'Code Reviewer',
      type: 'issue',
      data: crData,
      timestamp: Date.now(),
    }]);

    // Add Flow Diagram findings
    const fdData: FlowDiagramOutput = {
      diagrams: [{
        name: 'auth-flow',
        type: 'sequence',
        plantumlCode: '@startuml\nA -> B\n@enduml',
        description: 'Authentication flow',
      }],
      affectedFlows: ['login-flow'],
    };
    store.addAgentFindings('Flow Diagram', [{
      agentRole: 'Flow Diagram',
      type: 'flow',
      data: fdData,
      timestamp: Date.now(),
    }]);

    const ctx = createBuildContext({ sharedContextStore: store });
    const budget = createBudget({ agentRole: 'Observer', sharedContextBudget: 10000 });

    const result = builder.buildObserverPrompt(ctx, budget);

    // Should contain serialized Code Reviewer findings
    assert.ok(
      result.prompt.includes('Code Reviewer'),
      'Prompt should contain Code Reviewer findings',
    );
    assert.ok(
      result.prompt.includes('null check missing'),
      'Prompt should contain CR issue description',
    );

    // Should contain serialized Flow Diagram findings
    assert.ok(
      result.prompt.includes('Flow Diagram'),
      'Prompt should contain Flow Diagram findings',
    );
    assert.ok(
      result.prompt.includes('auth-flow'),
      'Prompt should contain FD diagram name',
    );
  });

  test('buildObserverPrompt with risk hypotheses: prompt contains hypothesis questions and investigation instruction', () => {
    const builder = createBuilder();
    const hypotheses: RiskHypothesis[] = [
      {
        question: 'Does the API schema change break downstream consumers?',
        affectedFiles: ['src/api.ts'],
        evidenceNeeded: 'check all callers of the changed endpoint',
        severityEstimate: 'high',
        source: 'heuristic',
      },
      {
        question: 'Is the new dependency introducing a circular import?',
        affectedFiles: ['src/service.ts'],
        evidenceNeeded: 'trace import chain',
        severityEstimate: 'medium',
        source: 'heuristic',
      },
    ];

    const ctx = createBuildContext({ riskHypotheses: hypotheses });
    const budget = createBudget({ agentRole: 'Observer' });

    const result = builder.buildObserverPrompt(ctx, budget);

    // System message should contain hypothesis investigation instructions
    assert.ok(
      result.systemMessage.includes('Investigate each hypothesis'),
      'System message should contain hypothesis investigation instruction',
    );

    // System message should contain verdict instructions
    assert.ok(
      result.systemMessage.includes('confirmed') && result.systemMessage.includes('refuted'),
      'System message should contain verdict options',
    );
  });

  test('buildObserverPrompt without Phase 1 findings (empty store): builds successfully with diff summary + graph', () => {
    const builder = createBuilder();
    const store = new SharedContextStoreImpl();
    const graph = createDependencyGraph();

    const ctx = createBuildContext({
      sharedContextStore: store,
      dependencyGraph: graph,
    });
    const budget = createBudget({ agentRole: 'Observer' });

    const result = builder.buildObserverPrompt(ctx, budget);

    // Should still build successfully
    assert.ok(result.prompt.length > 0, 'Prompt should not be empty');
    assert.ok(result.prompt.includes('Changed Files Summary'), 'Should contain diff summary');
    assert.strictEqual(result.role, 'Observer');
    assert.strictEqual(result.phase, 2);
  });

  // ── buildSynthesizerPrompt ──

  test('buildSynthesizerPrompt: output contains REVIEW_OUTPUT_CONTRACT, all 3 agent role names, diff summary', () => {
    const builder = createBuilder();

    const reports: StructuredAgentReport[] = [
      {
        role: 'Code Reviewer',
        structured: {
          issues: [{ file: 'src/a.ts', location: '10', severity: 'major', category: 'correctness', description: 'bug', suggestion: 'fix' }],
          affectedSymbols: ['foo'],
          qualityVerdict: 'Not Bad',
        },
        raw: 'Code Reviewer raw output',
      },
      {
        role: 'Flow Diagram',
        structured: {
          diagrams: [{ name: 'flow1', type: 'activity', plantumlCode: '@startuml\nA\n@enduml', description: 'desc' }],
          affectedFlows: ['main-flow'],
        },
        raw: 'Flow Diagram raw output',
      },
      {
        role: 'Observer',
        structured: {
          risks: [{ description: 'risk1', severity: 'high', affectedArea: 'src/a.ts' }],
          todoItems: [{ action: 'check tests', parallelizable: true }],
          integrationConcerns: ['concern1'],
        },
        raw: 'Observer raw output',
      },
    ];

    const result = builder.buildSynthesizerPrompt(reports, 'Summary of 3 files changed');

    // Should contain REVIEW_OUTPUT_CONTRACT content
    assert.ok(result.includes('Hard requirements'), 'Should contain REVIEW_OUTPUT_CONTRACT');

    // Should contain all 3 agent role names
    assert.ok(result.includes('Code Reviewer'), 'Should contain Code Reviewer');
    assert.ok(result.includes('Flow Diagram'), 'Should contain Flow Diagram');
    assert.ok(result.includes('Observer'), 'Should contain Observer');

    // Should contain diff summary
    assert.ok(result.includes('Summary of 3 files changed'), 'Should contain diff summary');
  });

  test('buildSynthesizerPrompt deduplication: CR issue and Observer risk with same file + overlapping description → merged', () => {
    const builder = createBuilder();

    const reports: StructuredAgentReport[] = [
      {
        role: 'Code Reviewer',
        structured: {
          issues: [{
            file: 'src/auth.ts',
            location: 'line 20',
            severity: 'major',
            category: 'security',
            description: 'user authentication input not validated properly',
            suggestion: 'add input validation',
          }],
          affectedSymbols: ['login'],
          qualityVerdict: 'Not Bad',
        },
        raw: 'CR raw',
      },
      {
        role: 'Observer',
        structured: {
          risks: [{
            description: 'authentication validation missing for user input',
            severity: 'high',
            affectedArea: 'src/auth.ts',
          }],
          todoItems: [],
          integrationConcerns: [],
        },
        raw: 'Observer raw',
      },
    ];

    const result = builder.buildSynthesizerPrompt(reports, 'diff summary');

    // The CR issue and Observer risk overlap (same file, similar description)
    // They should be merged into a single deduplicated item
    const deduplicatedSection = result.split('## Deduplicated Issues')[1]?.split('##')[0] ?? '';

    // Should contain merged item with both CR and Observer info
    assert.ok(
      deduplicatedSection.includes('Observer risk'),
      'Merged item should reference Observer risk',
    );
    assert.ok(
      deduplicatedSection.includes('src/auth.ts'),
      'Merged item should contain the file path',
    );

    // Count the number of deduplicated issue lines (lines starting with "- [")
    const issueLines = deduplicatedSection.split('\n').filter(l => l.trim().startsWith('- ['));
    assert.strictEqual(issueLines.length, 1, 'Should have exactly 1 merged item (not 2 separate)');
  });

  test('buildSynthesizerPrompt deduplication: CR issue and Observer risk with different files → both kept separately', () => {
    const builder = createBuilder();

    const reports: StructuredAgentReport[] = [
      {
        role: 'Code Reviewer',
        structured: {
          issues: [{
            file: 'src/auth.ts',
            location: 'line 20',
            severity: 'major',
            category: 'security',
            description: 'authentication bypass vulnerability',
            suggestion: 'fix auth check',
          }],
          affectedSymbols: ['login'],
          qualityVerdict: 'Not Bad',
        },
        raw: 'CR raw',
      },
      {
        role: 'Observer',
        structured: {
          risks: [{
            description: 'database connection pool exhaustion risk',
            severity: 'high',
            affectedArea: 'src/database.ts',
          }],
          todoItems: [],
          integrationConcerns: [],
        },
        raw: 'Observer raw',
      },
    ];

    const result = builder.buildSynthesizerPrompt(reports, 'diff summary');

    const deduplicatedSection = result.split('## Deduplicated Issues')[1]?.split('##')[0] ?? '';

    // Both should be kept separately (different files, different descriptions)
    const issueLines = deduplicatedSection.split('\n').filter(l => l.trim().startsWith('- ['));
    assert.strictEqual(issueLines.length, 2, 'Should have 2 separate items');

    assert.ok(deduplicatedSection.includes('src/auth.ts'), 'Should contain auth.ts issue');
    assert.ok(deduplicatedSection.includes('src/database.ts'), 'Should contain database.ts risk');
  });

  test('buildSynthesizerPrompt with PlantUML diagrams: diagrams embedded with plantuml fences', () => {
    const builder = createBuilder();

    const reports: StructuredAgentReport[] = [
      {
        role: 'Flow Diagram',
        structured: {
          diagrams: [
            {
              name: 'Auth Flow',
              type: 'sequence',
              plantumlCode: '@startuml\nActor -> Server: login\nServer -> DB: query\n@enduml',
              description: 'Authentication sequence',
            },
          ],
          affectedFlows: ['auth'],
        },
        raw: 'FD raw',
      },
    ];

    const result = builder.buildSynthesizerPrompt(reports, 'diff summary');

    assert.ok(result.includes('```plantuml'), 'Should contain plantuml fence');
    assert.ok(result.includes('@startuml'), 'Should contain PlantUML start tag');
    assert.ok(result.includes('Actor -> Server'), 'Should contain diagram content');
    assert.ok(result.includes('Auth Flow'), 'Should contain diagram name');
  });

  test('buildSynthesizerPrompt with hypothesis verdicts: verdicts section included', () => {
    const builder = createBuilder();

    const reports: StructuredAgentReport[] = [
      {
        role: 'Observer',
        structured: {
          risks: [],
          todoItems: [],
          integrationConcerns: [],
          hypothesisVerdicts: [
            { hypothesisIndex: 0, verdict: 'confirmed', evidence: 'Found 3 broken callers' },
            { hypothesisIndex: 1, verdict: 'refuted', evidence: 'No circular dependency detected' },
          ],
        },
        raw: 'Observer raw',
      },
    ];

    const result = builder.buildSynthesizerPrompt(reports, 'diff summary');

    assert.ok(result.includes('Hypothesis Verdicts'), 'Should contain Hypothesis Verdicts section');
    assert.ok(result.includes('confirmed'), 'Should contain confirmed verdict');
    assert.ok(result.includes('refuted'), 'Should contain refuted verdict');
    assert.ok(result.includes('Found 3 broken callers'), 'Should contain evidence text');
  });

  test('buildSynthesizerPrompt with detail change raw report: detail section material included', () => {
    const builder = createBuilder();
    const result = builder.buildSynthesizerPrompt(
      [],
      'diff summary',
      '### What Changed\nThe service now streams validation before persisting the final state.',
    );

    assert.ok(result.includes('## Detail Change Material'), 'Should include detail change material section');
    assert.ok(result.includes('The service now streams validation'), 'Should include raw detail change narrative');
  });

  // ── filterStructuralDiff (private, tested via (builder as any)) ──

  test('filterStructuralDiff: mixed diff → only structural lines kept', () => {
    const builder = createBuilder();

    const result = (builder as any).filterStructuralDiff(MIXED_DIFF, []);

    // Structural changes should be present
    assert.ok(result.includes('import'), 'Should keep import changes');
    assert.ok(
      result.includes('export function processData'),
      'Should keep function signature changes',
    );

    // Logic-only changes should NOT be present
    assert.ok(
      !result.includes('if (x > 0 && flag)'),
      'Should NOT keep logic-only if/else changes',
    );
    assert.ok(
      !result.includes('const temp = x + 1'),
      'Should NOT keep variable assignment changes',
    );

    // File headers should be preserved
    assert.ok(result.includes('--- a/src/service.ts'), 'Should keep file headers');
    assert.ok(result.includes('+++ b/src/service.ts'), 'Should keep file headers');
  });

  test('filterStructuralDiff: only logic changes → returns minimal diff (headers only)', () => {
    const builder = createBuilder();

    const result = (builder as any).filterStructuralDiff(LOGIC_ONLY_DIFF, []);

    // File headers should still be present
    assert.ok(result.includes('--- a/src/utils.ts'), 'Should keep file headers');
    assert.ok(result.includes('+++ b/src/utils.ts'), 'Should keep file headers');

    // The hunk with only logic changes should be dropped entirely
    assert.ok(
      !result.includes('if (a > 0 && b > 0)'),
      'Should NOT contain logic-only changes',
    );
    assert.ok(
      !result.includes('const temp = result * 2'),
      'Should NOT contain variable assignment changes',
    );
  });

  // ── buildDiffSummary (private, tested via (builder as any)) ──

  test('buildDiffSummary: 3 changed files → output has 3 lines with correct +added/-removed counts and affected symbols', () => {
    const builder = createBuilder();

    const changedFiles: UnifiedDiffFile[] = [
      createChangedFile({
        relativePath: 'src/auth.ts',
        statusLabel: 'modified',
        diff: `--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -10,6 +10,8 @@ function login\n context\n+added1\n+added2\n-removed1\n context`,
      }),
      createChangedFile({
        relativePath: 'src/utils.ts',
        statusLabel: 'modified',
        diff: `--- a/src/utils.ts\n+++ b/src/utils.ts\n@@ -1,3 +1,5 @@ class Helper\n context\n+new line\n-old line\n-old line2\n context`,
      }),
      createChangedFile({
        relativePath: 'src/config.ts',
        statusLabel: 'added',
        diff: `--- /dev/null\n+++ b/src/config.ts\n@@ -0,0 +1,3 @@\n+line1\n+line2\n+line3`,
      }),
    ];

    const result = (builder as any).buildDiffSummary(changedFiles);

    // Should have the heading
    assert.ok(result.includes('## Changed Files Summary'), 'Should contain summary heading');

    // Should have 3 file entries
    const fileLines = result.split('\n').filter((l: string) => l.startsWith('- '));
    assert.strictEqual(fileLines.length, 3, 'Should have 3 file summary lines');

    // Verify first file: 2 added, 1 removed
    assert.ok(result.includes('src/auth.ts'), 'Should contain auth.ts');
    assert.ok(result.includes('+2/-1'), 'auth.ts should have +2/-1');
    assert.ok(result.includes('function login'), 'auth.ts should show affected symbol from hunk header');

    // Verify second file: 1 added, 2 removed
    assert.ok(result.includes('src/utils.ts'), 'Should contain utils.ts');
    assert.ok(result.includes('+1/-2'), 'utils.ts should have +1/-2');

    // Verify third file: 3 added, 0 removed
    assert.ok(result.includes('src/config.ts'), 'Should contain config.ts');
    assert.ok(result.includes('+3/-0'), 'config.ts should have +3/-0');
  });

  // ── wordOverlapRatio (private, tested via (builder as any)) ──

  test('wordOverlapRatio: overlapping phrases → > 0.4; unrelated phrases → < 0.4', () => {
    const builder = createBuilder();

    // Overlapping: "user authentication failed" vs "authentication failure for user"
    // Words > 3 chars: {user, authentication, failed} vs {authentication, failure, user}
    // Intersection: {user, authentication} = 2, min size = 3 → ratio = 2/3 ≈ 0.67
    const overlap = (builder as any).wordOverlapRatio(
      'user authentication failed',
      'authentication failure for user',
    );
    assert.ok(overlap > 0.4, `Expected overlap > 0.4, got ${overlap}`);

    // Unrelated: "database connection" vs "UI rendering"
    // Words > 3 chars: {database, connection} vs {rendering}
    // Intersection: {} = 0 → ratio = 0
    const noOverlap = (builder as any).wordOverlapRatio(
      'database connection',
      'UI rendering',
    );
    assert.ok(noOverlap < 0.4, `Expected overlap < 0.4, got ${noOverlap}`);
  });
});
