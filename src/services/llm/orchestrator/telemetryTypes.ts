import { PatchIntent, RiskFlags } from './executionPlanTypes';

export interface TruncationTelemetry {
  agentRole: string;
  tokensTruncated: number;
  contextWindowActual: number;
  budgetAllocated?: number;
}

export interface PipelineTelemetry {
  pipelineMode: 'legacy' | 'adaptive';
  patchIntent?: PatchIntent;
  riskFlags?: RiskFlags;
  enabledAgents: string[];
  disabledAgents: string[];
  sectionWritersEnabled: {
    summary: boolean;
    improvements: boolean;
  };
  phaseLatencies: {
    contextGatherer: number;
    phase1Agents: number;
    phase2Observer: number;
    assembly: number;
  };
  tokenUsage: {
    totalInput: number;
    perAgent: Record<string, { allocated: number; actual: number }>;
    truncationEvents: TruncationTelemetry[];
  };
  outputCompleteness: {
    sectionsRendered: number;
    sectionWriterUsed: string[];
    deterministicRendered: string[];
    totalFindings: number;
  };
}

export enum PipelineTelemetryEvent {
  PIPELINE_START = 'PIPELINE_START',
  CONTEXT_GATHERER_COMPLETE = 'CONTEXT_GATHERER_COMPLETE',
  AGENT_COMPLETE = 'AGENT_COMPLETE',
  TRUNCATION = 'TRUNCATION',
  SECTION_WRITER_FALLBACK = 'SECTION_WRITER_FALLBACK',
  ASSEMBLY_COMPLETE = 'ASSEMBLY_COMPLETE',
  PIPELINE_COMPLETE = 'PIPELINE_COMPLETE',
}
