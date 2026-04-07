import {
  computeMetadataStats,
  computeMetadataStatsFromFindings,
  getReports,
  renderChangedFiles,
  renderCodeQualityFromFindings,
  renderCodeQuality,
  renderFlowDiagram,
  renderImprovementsFromFindings,
  renderImprovementsFallback,
  renderSummaryFromFindings,
  renderRisksFromFindings,
  renderRisks,
  renderSummaryFallback,
  renderTodo,
  severityWeight,
} from './DeterministicRenderer';
import { ExecutionPlan, Finding } from './executionPlanTypes';
import { StructuredAgentReport } from './orchestratorTypes';
import { UnifiedDiffFile } from '../contextTypes';
import { SuppressedFinding } from '../reviewMemoryTypes';
import { wordOverlapRatio } from './SuppressionFilter';
import { ISessionMemory } from './SessionMemory';
import {
  buildImprovementWriterPrompt,
  buildSummaryWriterPrompt,
  executeSectionWriter,
  shouldActivateImprovementWriter,
  shouldActivateSummaryWriter,
} from './SectionWriters';
import { ILLMAdapter } from '../../../llm-adapter';
import { AdapterCalibrationService } from './AdapterCalibrationService';
import { IPipelineTelemetryEmitter } from './PipelineTelemetryEmitter';
import { ContextGenerationRequest } from '../contextTypes';

export interface HybridAssemblyInput {
  structuredReports: StructuredAgentReport[];
  executionPlan?: ExecutionPlan;
  language: string;
  detailChangeReport?: string;
  changedFiles: UnifiedDiffFile[];
  reviewDurationMs: number;
  suppressedFindings: SuppressedFinding[];
  suppressedCount?: number;
}

export interface HybridAdaptiveAssemblyInput {
  sessionMemory: ISessionMemory;
  executionPlan?: ExecutionPlan;
  language: string;
  detailChangeReport?: string;
  changedFiles: UnifiedDiffFile[];
  reviewDurationMs: number;
  suppressedFindings: SuppressedFinding[];
  suppressedCount?: number;
  adapter: ILLMAdapter;
  calibration: AdapterCalibrationService;
  telemetryEmitter?: IPipelineTelemetryEmitter;
  signal?: AbortSignal;
  request?: ContextGenerationRequest;
}

export interface HybridAdaptiveAssemblyResult {
  review: string;
  sectionWriterUsed: string[];
  deterministicRendered: string[];
}

type TaggedFinding = Finding & { provenance: string };

export class HybridAssembly {
  assemble(input: HybridAssemblyInput): string {
    const { codeReviewer, security, observer, flow } = getReports(input.structuredReports);
    const improvements = renderImprovementsFallback(
      codeReviewer,
      security,
      input.suppressedFindings,
      input.language,
    );

    const sections = [
      '# Code Review Report',
      renderChangedFiles(input.changedFiles),
      renderSummaryFallback(input.structuredReports),
      this.sanitizeDetailChange(input.detailChangeReport),
      renderFlowDiagram(flow, input.language),
      renderCodeQuality(codeReviewer, input.suppressedFindings, input.language),
      improvements.markdown,
      renderTodo(observer, input.language),
      renderRisks(observer, security, input.suppressedFindings, input.language),
    ];

    const footer = this.buildMetadataFooter(
      this.tagFindings(this.extractFindings(input.structuredReports)),
      input.reviewDurationMs,
      input.suppressedCount ?? computeMetadataStats(codeReviewer, security, observer, input.suppressedFindings).suppressed,
    );

    return [...sections, footer].join('\n\n');
  }

  async assembleAdaptive(input: HybridAdaptiveAssemblyInput): Promise<HybridAdaptiveAssemblyResult> {
    const findings = input.sessionMemory.getRenderableFindings();
    const hypotheses = input.sessionMemory.getHypotheses();
    const flowFinding = input.sessionMemory.getAgentFindings('Flow Diagram')[0];
    const observerFinding = input.sessionMemory.getAgentFindings('Observer')[0];
    const { flow, observer } = getReports([
      ...(flowFinding ? [{ role: 'Flow Diagram' as const, structured: flowFinding.data as any, raw: '' }] : []),
      ...(observerFinding ? [{ role: 'Observer' as const, structured: observerFinding.data as any, raw: '' }] : []),
    ]);
    const sectionWriterUsed: string[] = [];
    const deterministicRendered: string[] = ['changed-files', 'detail-change', 'flow', 'quality', 'todo', 'risks'];

    let summarySection = renderSummaryFromFindings(findings, input.changedFiles);
    const summaryBudget = input.executionPlan?.sectionWriterBudgets?.summary ?? 0;
    if (input.executionPlan?.sectionWriters.summary && shouldActivateSummaryWriter(input.executionPlan) && summaryBudget > 0) {
      try {
        const summary = await executeSectionWriter({
          adapter: input.adapter,
          calibration: input.calibration,
          prompt: buildSummaryWriterPrompt({
            findings,
            changedFiles: input.changedFiles,
            language: input.language,
            tokenBudget: summaryBudget,
          }),
          systemMessage: `You write only the section "## 2. Summary of Changes". Respond in ${input.language}.`,
          tokenBudget: summaryBudget,
          signal: input.signal,
          request: input.request,
          stageLabel: 'Summary Writer',
        });
        if (summary.length < 50) {
          throw new Error('quality_threshold');
        }
        summarySection = summary.startsWith('## 2. Summary of Changes') ? summary : `## 2. Summary of Changes\n\n${summary}`;
        sectionWriterUsed.push('summary');
      } catch (error) {
        deterministicRendered.push('summary');
        input.telemetryEmitter?.emitSectionWriterFallback({
          section: 'summary',
          reason: error instanceof Error ? error.message : String(error),
          fallback: 'deterministic',
        });
      }
    } else {
      deterministicRendered.push('summary');
    }

    let improvementsSection = renderImprovementsFromFindings(findings, input.language).markdown;
    const improvementsBudget = input.executionPlan?.sectionWriterBudgets?.improvements ?? 0;
    if (input.executionPlan?.sectionWriters.improvements && shouldActivateImprovementWriter(findings) && improvementsBudget > 0) {
      try {
        const improvements = await executeSectionWriter({
          adapter: input.adapter,
          calibration: input.calibration,
          prompt: buildImprovementWriterPrompt({
            findings,
            language: input.language,
            tokenBudget: improvementsBudget,
          }),
          systemMessage: `You write only the section "## 6. Improvement Suggestions". Respond in ${input.language}.`,
          tokenBudget: improvementsBudget,
          signal: input.signal,
          request: input.request,
          stageLabel: 'Improvement Writer',
        });
        if (improvements.length < 50) {
          throw new Error('quality_threshold');
        }
        improvementsSection = improvements.startsWith('## 6. Improvement Suggestions')
          ? improvements
          : `## 6. Improvement Suggestions\n\n${improvements}`;
        sectionWriterUsed.push('improvements');
      } catch (error) {
        deterministicRendered.push('improvements');
        input.telemetryEmitter?.emitSectionWriterFallback({
          section: 'improvements',
          reason: error instanceof Error ? error.message : String(error),
          fallback: 'deterministic',
        });
      }
    } else {
      deterministicRendered.push('improvements');
    }

    const sections = [
      '# Code Review Report',
      renderChangedFiles(input.changedFiles),
      summarySection,
      this.sanitizeDetailChange(input.detailChangeReport),
      renderFlowDiagram(flow, input.language),
      renderCodeQualityFromFindings(findings, input.language),
      improvementsSection,
      renderTodo(observer, input.language),
      renderRisksFromFindings(findings, hypotheses, input.language),
    ];
    const footer = this.buildMetadataFooter(
      this.tagFindings(findings),
      input.reviewDurationMs,
      input.suppressedCount ?? computeMetadataStatsFromFindings(findings, 0).suppressed,
    );

    return {
      review: [...sections, footer].join('\n\n'),
      sectionWriterUsed,
      deterministicRendered: [...new Set(deterministicRendered)],
    };
  }

  sanitizeDetailChange(rawOutput: string | undefined): string {
    const normalized = (rawOutput ?? '').trim();
    if (!normalized || normalized.length < 50) {
      return '## 3. Detail Change\n\nDetail change not available';
    }

    const withoutHeading = normalized.replace(/^##\s*3\.\s*Detail Change\s*/i, '').trim();
    return ['## 3. Detail Change', withoutHeading].join('\n\n');
  }

  tagFindings(findings: Finding[]): TaggedFinding[] {
    return findings.map((finding) => {
      let provenance = '[CR]';
      if (finding.agentRole === 'Security Analyst') {
        provenance = '[SA]';
      } else if (finding.agentRole === 'Observer') {
        provenance = '[OB]';
      }

      if (finding.agentRole === 'Code Reviewer') {
        const crossValidated = findings.some((candidate) =>
          candidate.agentRole === 'Security Analyst' &&
          candidate.file === finding.file &&
          wordOverlapRatio(candidate.description, finding.description) > 0.4,
        );
        if (crossValidated) {
          provenance = `[XV]${provenance}`;
        }
      }

      return { ...finding, provenance };
    });
  }

  sortBySeverity(findings: Finding[]): Finding[] {
    return findings
      .map((finding, index) => ({ finding, index }))
      .sort((left, right) => {
        const weightDelta = severityWeight(right.finding.severity) - severityWeight(left.finding.severity);
        return weightDelta !== 0 ? weightDelta : left.index - right.index;
      })
      .map((entry) => entry.finding);
  }

  private sortTaggedBySeverity(findings: TaggedFinding[]): TaggedFinding[] {
    return findings
      .map((finding, index) => ({ finding, index }))
      .sort((left, right) => {
        const weightDelta = severityWeight(right.finding.severity) - severityWeight(left.finding.severity);
        return weightDelta !== 0 ? weightDelta : left.index - right.index;
      })
      .map((entry) => entry.finding);
  }

  buildMetadataFooter(findings: TaggedFinding[], reviewDurationMs: number, suppressedCount: number): string {
    const sorted = this.sortTaggedBySeverity(findings);
    const bySeverity = { critical: 0, major: 0, minor: 0, suggestion: 0 };
    const byAgent = { CR: 0, SA: 0, OB: 0 };
    let crossValidated = 0;

    for (const finding of sorted) {
      bySeverity[finding.severity] += 1;
      if (finding.provenance.includes('[CR]')) {
        byAgent.CR += 1;
      } else if (finding.provenance.includes('[SA]')) {
        byAgent.SA += 1;
      } else if (finding.provenance.includes('[OB]')) {
        byAgent.OB += 1;
      }

      if (finding.provenance.includes('[XV]')) {
        crossValidated += 1;
      }
    }

    return (
      `<!-- Review Metadata: findings=${sorted.length}, critical=${bySeverity.critical}, major=${bySeverity.major}, ` +
      `minor=${bySeverity.minor}, suggestion=${bySeverity.suggestion}, ` +
      `by_agent={CR:${byAgent.CR}, SA:${byAgent.SA}, OB:${byAgent.OB}}, ` +
      `cross_validated=${crossValidated}, suppressed=${suppressedCount}, duration=${reviewDurationMs}ms -->`
    );
  }

  validateReportStructure(report: string): boolean {
    const expectedHeadings = [
      '## 1. Changed File Paths',
      '## 2. Summary of Changes',
      '## 3. Detail Change',
      '## 4. Flow Diagram',
      '## 5. Code Quality Assessment',
      '## 6. Improvement Suggestions',
      '## 7. Observer TODO List',
      '## 8. Potential Hidden Risks',
    ];

    let cursor = 0;
    for (const heading of expectedHeadings) {
      const index = report.indexOf(heading, cursor);
      if (index === -1) {
        return false;
      }
      cursor = index + heading.length;
    }

    return /<!-- Review Metadata: .+ -->/s.test(report);
  }

  private extractFindings(reports: StructuredAgentReport[]): Finding[] {
    const findings: Finding[] = [];

    for (const report of reports) {
      if (report.role === 'Code Reviewer') {
        findings.push(...report.structured.issues.map((issue, index) => ({
          id: `cr-${index}`,
          agentRole: report.role,
          category: issue.category,
          severity: issue.severity,
          confidence: issue.confidence ?? 0.6,
          status: 'verified' as const,
          file: issue.file,
          lineRange: { start: 0, end: 0 },
          description: issue.description,
          suggestion: issue.suggestion,
          evidenceRefs: [],
          linkedFindingIds: [],
        })));
      } else if (report.role === 'Security Analyst') {
        findings.push(...report.structured.vulnerabilities
          .filter((finding) => finding.confidence >= 0.5)
          .map((finding, index) => {
            const severity: Finding['severity'] = finding.severity === 'critical'
              ? 'critical'
              : finding.severity === 'high'
                ? 'major'
                : finding.severity === 'medium'
                  ? 'minor'
                  : 'suggestion';
            return {
              id: `sa-${index}`,
              agentRole: report.role,
              category: 'security' as const,
              severity,
              confidence: finding.confidence,
              status: 'verified' as const,
              file: finding.file,
              lineRange: { start: 0, end: 0 },
              description: finding.description,
              suggestion: finding.remediation,
              evidenceRefs: [],
              linkedFindingIds: [],
            };
          }));
      } else if (report.role === 'Observer') {
        findings.push(...report.structured.risks.map((risk, index) => {
          const severity: Finding['severity'] = risk.severity === 'high'
            ? 'major'
            : risk.severity === 'medium'
              ? 'minor'
              : 'suggestion';
          return {
            id: `ob-${index}`,
            agentRole: report.role,
            category: 'correctness' as const,
            severity,
            confidence: risk.confidence ?? 0.6,
            status: 'verified' as const,
            file: risk.affectedArea,
            lineRange: { start: 0, end: 0 },
            description: risk.description,
            suggestion: risk.mitigation ?? 'Add follow-up validation',
            evidenceRefs: [],
            linkedFindingIds: [],
          };
        }));
      }
    }

    return findings;
  }
}
