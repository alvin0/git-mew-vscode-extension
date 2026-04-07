import { UnifiedDiffFile } from '../contextTypes';
import { SuppressedFinding } from '../reviewMemoryTypes';
import {
  computeMetadataStats,
  getReports,
  renderChangedFiles,
  renderCodeQuality,
  renderFlowDiagram,
  renderImprovementsFallback,
  renderRisks,
  renderSummaryFallback,
  renderTodo,
} from './DeterministicRenderer';
import { StructuredAgentReport } from './orchestratorTypes';

function extractAgentBody(output?: string): string {
  if (!output) {
    return '';
  }

  const match = output.match(/### Agent: .+?\n\n([\s\S]*)/);
  return (match?.[1] ?? output).trim();
}

function buildSummaryDetailFallback(
  structuredReports: StructuredAgentReport[],
  detailChangeReport?: string,
): string {
  const summary = renderSummaryFallback(structuredReports);
  const detailRaw = detailChangeReport?.trim() || 'None';

  return [
    summary,
    '## 3. Detail Change',
    detailRaw || 'None',
  ].join('\n\n');
}

function buildDiagramAssessmentFallback(
  structuredReports: StructuredAgentReport[],
  suppressedFindings: SuppressedFinding[],
  language: string,
): string {
  const { codeReviewer, flow } = getReports(structuredReports);
  return [
    renderFlowDiagram(flow, language),
    renderCodeQuality(codeReviewer, suppressedFindings, language),
  ].join('\n\n');
}

function buildRiskTodoFallback(
  structuredReports: StructuredAgentReport[],
  suppressedFindings: SuppressedFinding[],
  language: string,
): string {
  const { observer, security } = getReports(structuredReports);
  return [
    renderTodo(observer, language),
    renderRisks(observer, security, suppressedFindings, language),
  ].join('\n\n');
}

/** @deprecated Will be removed after Phase 3 stabilization. */
export function mergeSynthesisOutputs(
  agentOutputs: Map<string, string>,
  changedFiles: UnifiedDiffFile[],
  structuredReports: StructuredAgentReport[],
  suppressedFindings: SuppressedFinding[],
  reviewDurationMs: number,
  detailChangeReport?: string,
  language: string = 'English',
): string {
  const { codeReviewer, security, observer } = getReports(structuredReports);

  const summaryDetail = extractAgentBody(agentOutputs.get('Summary & Detail'));
  const diagramAssessment = extractAgentBody(agentOutputs.get('Diagram & Assessment'));
  const improvementSuggestions = extractAgentBody(agentOutputs.get('Improvement Suggestions'));
  const riskTodo = extractAgentBody(agentOutputs.get('Risk & TODO'));

  const improvementFallback = renderImprovementsFallback(
    codeReviewer,
    security,
    suppressedFindings,
    language,
  );
  const metadataStats = computeMetadataStats(codeReviewer, security, observer, suppressedFindings);

  const sections = [
    '# Code Review Report',
    renderChangedFiles(changedFiles),
    summaryDetail && !summaryDetail.startsWith('[ERROR]')
      ? summaryDetail
      : buildSummaryDetailFallback(structuredReports, detailChangeReport),
    diagramAssessment && !diagramAssessment.startsWith('[ERROR]')
      ? diagramAssessment
      : buildDiagramAssessmentFallback(structuredReports, suppressedFindings, language),
    improvementSuggestions && !improvementSuggestions.startsWith('[ERROR]')
      ? improvementSuggestions
      : improvementFallback.markdown,
    riskTodo && !riskTodo.startsWith('[ERROR]')
      ? riskTodo
      : buildRiskTodoFallback(structuredReports, suppressedFindings, language),
  ];

  const metadataFooter =
    `<!-- Review Metadata: findings=${metadataStats.totalFindings}, critical=${metadataStats.bySeverity.critical ?? 0}, ` +
    `major=${metadataStats.bySeverity.major ?? 0}, minor=${metadataStats.bySeverity.minor ?? 0}, ` +
    `suggestion=${metadataStats.bySeverity.suggestion ?? 0}, ` +
    `by_agent={CR:${metadataStats.byAgent.CR ?? 0}, SA:${metadataStats.byAgent.SA ?? 0}, OB:${metadataStats.byAgent.OB ?? 0}}, ` +
    `cross_validated=${metadataStats.crossValidated}, suppressed=${metadataStats.suppressed}, duration=${reviewDurationMs}ms -->`;

  return [...sections, metadataFooter].join('\n\n');
}
