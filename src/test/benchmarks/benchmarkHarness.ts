import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { TokenEstimatorService } from '../../services/llm/TokenEstimatorService';
import { HybridAssembly } from '../../services/llm/orchestrator/HybridAssembly';
import { mergeSynthesisOutputs } from '../../services/llm/orchestrator/SynthesisMerger';
import {
  computeMetadataStats,
  renderCodeQuality,
  renderFlowDiagram,
  renderImprovementsFallback,
  renderRisks,
  renderSummaryFallback,
  renderTodo,
} from '../../services/llm/orchestrator/DeterministicRenderer';
import { StructuredAgentReport } from '../../services/llm/orchestrator/orchestratorTypes';
import { UnifiedDiffFile } from '../../services/llm/contextTypes';
import { largePatchFixture, mediumPatchFixture, smallPatchFixture } from '../fixtures/diffFixtures';

export type BenchmarkScenarioName = 'small' | 'medium' | 'large';
export type PipelineMode = 'legacy' | 'adaptive';

export interface BenchmarkScenario {
  name: BenchmarkScenarioName;
  changes: UnifiedDiffFile[];
  diffText: string;
}

export interface BenchmarkMetrics {
  scenario: BenchmarkScenarioName;
  pipeline: PipelineMode;
  llmCalls: number;
  totalInputTokens: number;
  endToEndLatencyMs: number;
  assemblyLatencyMs: number;
  sectionsRendered: number;
  outputStructureValid: boolean;
  reviewMarkdown: string;
}

export interface BenchmarkComparison {
  scenario: BenchmarkScenarioName;
  legacy: BenchmarkMetrics;
  adaptive: BenchmarkMetrics;
  latencyDeltaPct: number;
  tokenReductionPct: number;
  llmCallReduction: number;
  outputStructureParity: boolean;
}

export const BENCHMARK_SCENARIOS: BenchmarkScenario[] = [
  { name: 'small', ...smallPatchFixture },
  { name: 'medium', ...mediumPatchFixture },
  { name: 'large', ...largePatchFixture },
];

const tokenEstimator = new TokenEstimatorService();
const SIMULATED_LLM_CALL_LATENCY_MS = 120;

function createStructuredReports(scenario: BenchmarkScenario): StructuredAgentReport[] {
  const issueCount = scenario.name === 'large' ? 4 : scenario.name === 'medium' ? 3 : 2;
  const vulnerabilityCount = scenario.name === 'large' ? 2 : 1;
  const todoCount = scenario.name === 'large' ? 3 : scenario.name === 'medium' ? 2 : 1;

  return [
    {
      role: 'Code Reviewer',
      structured: {
        issues: Array.from({ length: issueCount }, (_, index) => ({
          file: scenario.changes[index % scenario.changes.length]?.relativePath ?? 'src/example.ts',
          location: `line ${index + 10}`,
          severity: index === 0 ? 'major' : index === 1 ? 'minor' : 'suggestion',
          category: index === 0 ? 'correctness' : 'maintainability',
          description: `${scenario.name} pipeline issue ${index + 1}`,
          suggestion: `Fix ${scenario.name} issue ${index + 1}`,
          confidence: 0.8,
        })),
        affectedSymbols: ['login', 'session', 'formatter'].slice(0, issueCount),
        qualityVerdict: scenario.name === 'large' ? 'Critical' : scenario.name === 'medium' ? 'Not Bad' : 'Safe',
      },
      raw: `### Agent: Code Reviewer\n\n${scenario.name} code review raw`,
    },
    {
      role: 'Flow Diagram',
      structured: {
        diagrams: [
          {
            name: `${scenario.name} review flow`,
            type: 'sequence',
            plantumlCode: '@startuml\nClient -> Service: review\nService -> Store: persist\n@enduml',
            description: `${scenario.name} benchmark flow`,
          },
        ],
        affectedFlows: ['review'],
      },
      raw: `### Agent: Flow Diagram\n\n${scenario.name} flow raw`,
    },
    {
      role: 'Security Analyst',
      structured: {
        vulnerabilities: Array.from({ length: vulnerabilityCount }, (_, index) => ({
          file: scenario.changes[index % scenario.changes.length]?.relativePath ?? 'src/example.ts',
          location: `line ${index + 20}`,
          cweId: 'CWE-476',
          type: 'other',
          severity: index === 0 ? 'high' : 'medium',
          confidence: 0.84,
          description: `${scenario.name} security finding ${index + 1}`,
          remediation: `Mitigate ${scenario.name} security finding ${index + 1}`,
        })),
        authFlowConcerns: [],
        inputValidationGaps: [],
        dataExposureRisks: [],
      },
      raw: `### Agent: Security Analyst\n\n${scenario.name} security raw`,
    },
    {
      role: 'Observer',
      structured: {
        risks: Array.from({ length: todoCount }, (_, index) => ({
          description: `${scenario.name} observer risk ${index + 1}`,
          severity: index === 0 ? 'high' : 'medium',
          affectedArea: scenario.changes[index % scenario.changes.length]?.relativePath ?? 'src/example.ts',
          confidence: 0.72,
          mitigation: `Review ${scenario.name} observer risk ${index + 1}`,
        })),
        todoItems: Array.from({ length: todoCount }, (_, index) => ({
          action: `Add ${scenario.name} follow-up ${index + 1}`,
          parallelizable: index % 2 === 0,
          priority: index === 0 ? 'high' : 'medium',
        })),
        integrationConcerns: [`${scenario.name} integration concern`],
      },
      raw: `### Agent: Observer\n\n${scenario.name} observer raw`,
    },
  ];
}

function createDetailChangeReport(scenario: BenchmarkScenario): string {
  return [
    '## 3. Detail Change',
    `${scenario.name} patch updates ${scenario.changes.length} files.`,
    'The benchmark fixture keeps this section long enough to avoid fallback.',
    `Estimated diff size: ${scenario.diffText.length} characters.`,
  ].join('\n\n');
}

function estimatePromptTokens(text: string): number {
  return tokenEstimator.estimateTextTokens(text, 'mock-model');
}

function estimatePhaseOneTokens(scenario: BenchmarkScenario, reports: StructuredAgentReport[]): number {
  const sharedContext = JSON.stringify(reports.map((report) => ({ role: report.role, raw: report.raw })));
  const diffTokens = estimatePromptTokens(scenario.diffText);
  const basePrompt = diffTokens + estimatePromptTokens(sharedContext);

  return (
    basePrompt + // Code Reviewer
    Math.ceil(diffTokens * 0.55) + // Flow Diagram
    Math.ceil(diffTokens * 0.85) + // Detail Change
    Math.ceil(diffTokens * 0.65) + // Security Analyst
    Math.ceil(basePrompt * 0.45) // Observer
  );
}

function estimateLegacySynthesisTokens(
  scenario: BenchmarkScenario,
  reports: StructuredAgentReport[],
  detailChangeReport: string,
): number {
  const codeReviewer = reports.find((report) => report.role === 'Code Reviewer')?.structured;
  const security = reports.find((report) => report.role === 'Security Analyst')?.structured;
  const observer = reports.find((report) => report.role === 'Observer')?.structured;
  const flow = reports.find((report) => report.role === 'Flow Diagram')?.structured;

  const synthesisInputs = [
    `${renderSummaryFallback(reports)}\n\n${detailChangeReport}`,
    renderImprovementsFallback(codeReviewer, security, [], 'English').markdown,
    `${renderTodo(observer, 'English')}\n\n${renderRisks(observer, security, [], 'English')}`,
    `${renderFlowDiagram(flow, 'English')}\n\n${renderCodeQuality(codeReviewer, [], 'English')}`,
  ];

  return synthesisInputs.reduce((total, prompt) => total + estimatePromptTokens(prompt), 0);
}

function createLegacySynthesisOutputs(
  scenario: BenchmarkScenario,
  reports: StructuredAgentReport[],
  detailChangeReport: string,
): Map<string, string> {
  const codeReviewer = reports.find((report) => report.role === 'Code Reviewer')?.structured;
  const security = reports.find((report) => report.role === 'Security Analyst')?.structured;
  const observer = reports.find((report) => report.role === 'Observer')?.structured;
  const flow = reports.find((report) => report.role === 'Flow Diagram')?.structured;

  return new Map([
    ['Summary & Detail', `### Agent: Summary & Detail\n\n${renderSummaryFallback(reports)}\n\n${detailChangeReport}`],
    ['Improvement Suggestions', `### Agent: Improvement Suggestions\n\n${renderImprovementsFallback(codeReviewer, security, [], 'English').markdown}`],
    ['Risk & TODO', `### Agent: Risk & TODO\n\n${renderTodo(observer, 'English')}\n\n${renderRisks(observer, security, [], 'English')}`],
    ['Diagram & Assessment', `### Agent: Diagram & Assessment\n\n${renderFlowDiagram(flow, 'English')}\n\n${renderCodeQuality(codeReviewer, [], 'English')}`],
  ]);
}

export function runLegacyBenchmark(scenario: BenchmarkScenario): BenchmarkMetrics {
  const reports = createStructuredReports(scenario);
  const detailChangeReport = createDetailChangeReport(scenario);
  const synthesisOutputs = createLegacySynthesisOutputs(scenario, reports, detailChangeReport);
  const assembly = new HybridAssembly();

  const start = performance.now();
  const review = mergeSynthesisOutputs(
    synthesisOutputs,
    scenario.changes,
    reports,
    [],
    0,
    detailChangeReport,
    'English',
  );
  const end = performance.now();

  return {
    scenario: scenario.name,
    pipeline: 'legacy',
    llmCalls: 9,
    totalInputTokens: estimatePhaseOneTokens(scenario, reports) + estimateLegacySynthesisTokens(scenario, reports, detailChangeReport),
    endToEndLatencyMs: Number((((end - start) + (9 * SIMULATED_LLM_CALL_LATENCY_MS)).toFixed(3))),
    assemblyLatencyMs: Number((end - start).toFixed(3)),
    sectionsRendered: 8,
    outputStructureValid: assembly.validateReportStructure(review),
    reviewMarkdown: review,
  };
}

export function runAdaptiveBenchmark(scenario: BenchmarkScenario): BenchmarkMetrics {
  const reports = createStructuredReports(scenario);
  const detailChangeReport = createDetailChangeReport(scenario);
  const assembly = new HybridAssembly();

  const start = performance.now();
  const review = assembly.assemble({
    structuredReports: reports,
    changedFiles: scenario.changes,
    detailChangeReport,
    language: 'English',
    reviewDurationMs: 0,
    suppressedFindings: [],
    suppressedCount: 0,
  });
  const end = performance.now();

  return {
    scenario: scenario.name,
    pipeline: 'adaptive',
    llmCalls: 5,
    totalInputTokens: estimatePhaseOneTokens(scenario, reports),
    endToEndLatencyMs: Number((((end - start) + (5 * SIMULATED_LLM_CALL_LATENCY_MS)).toFixed(3))),
    assemblyLatencyMs: Number((end - start).toFixed(3)),
    sectionsRendered: 8,
    outputStructureValid: assembly.validateReportStructure(review),
    reviewMarkdown: review,
  };
}

export function compareScenario(scenario: BenchmarkScenario): BenchmarkComparison {
  const legacy = runLegacyBenchmark(scenario);
  const adaptive = runAdaptiveBenchmark(scenario);
  const headings = (text: string) => text.match(/^## .+$/gm) ?? [];

  return {
    scenario: scenario.name,
    legacy,
    adaptive,
    latencyDeltaPct: Number((((adaptive.endToEndLatencyMs - legacy.endToEndLatencyMs) / Math.max(legacy.endToEndLatencyMs, 0.001)) * 100).toFixed(2)),
    tokenReductionPct: Number((((legacy.totalInputTokens - adaptive.totalInputTokens) / Math.max(legacy.totalInputTokens, 1)) * 100).toFixed(2)),
    llmCallReduction: legacy.llmCalls - adaptive.llmCalls,
    outputStructureParity: JSON.stringify(headings(legacy.reviewMarkdown)) === JSON.stringify(headings(adaptive.reviewMarkdown)),
  };
}

export function runAllComparisons(): BenchmarkComparison[] {
  return BENCHMARK_SCENARIOS.map(compareScenario);
}

export function summarizeTokenAccounting(comparisons: BenchmarkComparison[]) {
  const averageReduction = comparisons.reduce((total, item) => total + item.tokenReductionPct, 0) / comparisons.length;
  return {
    averageTokenReductionPct: Number(averageReduction.toFixed(2)),
    meetsTwentyPercentTarget: averageReduction >= 20,
    perScenario: comparisons.map((item) => ({
      scenario: item.scenario,
      reductionPct: item.tokenReductionPct,
      legacyTokens: item.legacy.totalInputTokens,
      adaptiveTokens: item.adaptive.totalInputTokens,
    })),
  };
}

export function measureRendererLatency(iterations: number = 250) {
  const results = BENCHMARK_SCENARIOS.map((scenario) => {
    const reports = createStructuredReports(scenario);
    const codeReviewer = reports.find((report) => report.role === 'Code Reviewer')?.structured;
    const security = reports.find((report) => report.role === 'Security Analyst')?.structured;
    const observer = reports.find((report) => report.role === 'Observer')?.structured;
    const flow = reports.find((report) => report.role === 'Flow Diagram')?.structured;
    const sections = [
      () => renderSummaryFallback(reports),
      () => renderFlowDiagram(flow, 'English'),
      () => renderCodeQuality(codeReviewer, [], 'English'),
      () => renderImprovementsFallback(codeReviewer, security, [], 'English').markdown,
      () => renderTodo(observer, 'English'),
      () => renderRisks(observer, security, [], 'English'),
    ];

    let total = 0;
    let max = 0;
    for (let i = 0; i < iterations; i += 1) {
      const start = performance.now();
      for (const render of sections) {
        render();
      }
      const elapsed = performance.now() - start;
      total += elapsed;
      if (elapsed > max) {
        max = elapsed;
      }
    }

    return {
      scenario: scenario.name,
      iterations,
      averageLatencyMs: Number((total / iterations).toFixed(4)),
      maxLatencyMs: Number(max.toFixed(4)),
      meetsFiftyMsTarget: max < 50,
    };
  });

  return {
    results,
    allUnderFiftyMs: results.every((item) => item.meetsFiftyMsTarget),
  };
}

export function writeLegacyBaselines(outputDir: string, comparisons: BenchmarkComparison[]): void {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const comparison of comparisons) {
    const filePath = path.join(outputDir, `${comparison.scenario}.json`);
    fs.writeFileSync(
      filePath,
      `${JSON.stringify({
        scenario: comparison.scenario,
        generatedAt: new Date().toISOString(),
        metrics: comparison.legacy,
      }, null, 2)}\n`,
      'utf8',
    );
  }
}

export function getLegacyBaselineDirectory(): string {
  return path.resolve(__dirname, '../../../src/test/benchmarks/legacyBaseline');
}

export function getMetadataPreview(scenario: BenchmarkScenario): string {
  const reports = createStructuredReports(scenario);
  const codeReviewer = reports.find((report) => report.role === 'Code Reviewer')?.structured;
  const security = reports.find((report) => report.role === 'Security Analyst')?.structured;
  const observer = reports.find((report) => report.role === 'Observer')?.structured;
  return JSON.stringify(computeMetadataStats(codeReviewer, security, observer, []));
}
