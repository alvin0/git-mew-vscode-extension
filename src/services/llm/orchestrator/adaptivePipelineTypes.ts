import { ILLMAdapter } from '../../../llm-adapter';
import { ContextGenerationRequest, UnifiedDiffFile } from '../contextTypes';
import { SuppressedFinding } from '../reviewMemoryTypes';
import {
  CodeReviewerOutput,
  DependencyGraphData,
  FlowDiagramOutput,
  ObserverOutput,
  PhasedAgentConfig,
  SecurityAnalystOutput,
  StructuredAgentReport,
} from './orchestratorTypes';
import { ISharedContextStore } from './SharedContextStore';
import { SuppressionResult } from './SuppressionFilter';
import { IPipelineTelemetryEmitter } from './PipelineTelemetryEmitter';

export interface AdaptivePipelineInput {
  adapter: ILLMAdapter;
  phaseConfig: PhasedAgentConfig;
  sharedStore: ISharedContextStore;
  suppressedFindings: SuppressedFinding[];
  changedFiles: UnifiedDiffFile[];
  language: string;
  reviewDurationMs: number;
  reviewStartTimeMs?: number;
  diffText?: string;
  diffTokens?: number;
  systemTokens?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  dependencyGraph?: DependencyGraphData;
  /** Actual reference context tokens used (from buildReviewReferenceContext metadata).
   *  When provided, allocateFromExecutionPlan uses this instead of the theoretical
   *  maximum from computeReferenceContextBudget, avoiding phantom reservation of
   *  unused reference budget. */
  actualReferenceTokens?: number;
  signal?: AbortSignal;
  request?: ContextGenerationRequest;
  detailChangeReport?: string;
  telemetryEmitter?: IPipelineTelemetryEmitter;
}

export interface AdaptivePipelineIntermediateData {
  structuredReports: StructuredAgentReport[];
  observerFindings?: ObserverOutput;
  suppressionResult: SuppressionResult;
}

export interface AdaptivePipelineOutput {
  review: string;
  intermediateData: AdaptivePipelineIntermediateData;
}

export class LegacyStructuredReportAdapter {
  static fromSharedStore(sharedStore: ISharedContextStore, phaseReports: string[]): StructuredAgentReport[] {
    const reports: StructuredAgentReport[] = [];
    const codeReviewerFinding = sharedStore.getAgentFindings('Code Reviewer')[0];
    const flowFinding = sharedStore.getAgentFindings('Flow Diagram')[0];
    const securityFinding = sharedStore.getAgentFindings('Security Analyst')[0];
    const observerFinding = sharedStore.getAgentFindings('Observer')[0];

    if (codeReviewerFinding) {
      reports.push({
        role: 'Code Reviewer',
        structured: codeReviewerFinding.data as CodeReviewerOutput,
        raw: this.findRawReport(phaseReports, 'Code Reviewer'),
      });
    }

    if (flowFinding) {
      reports.push({
        role: 'Flow Diagram',
        structured: flowFinding.data as FlowDiagramOutput,
        raw: this.findRawReport(phaseReports, 'Flow Diagram'),
      });
    }

    if (securityFinding) {
      reports.push({
        role: 'Security Analyst',
        structured: securityFinding.data as SecurityAnalystOutput,
        raw: this.findRawReport(phaseReports, 'Security Analyst'),
      });
    }

    if (observerFinding) {
      reports.push({
        role: 'Observer',
        structured: observerFinding.data as ObserverOutput,
        raw: this.findRawReport(phaseReports, 'Observer'),
      });
    }

    return reports;
  }

  static findRawReport(phaseReports: string[], role: string): string {
    const prefix = `### Agent: ${role}`;
    return phaseReports.find((report) => report.startsWith(prefix)) ?? '';
  }
}
