import { trackEvent } from '../../posthog';
import { ExecutionPlan } from './executionPlanTypes';
import { PipelineTelemetry, PipelineTelemetryEvent, TruncationTelemetry } from './telemetryTypes';

export interface IPipelineTelemetryEmitter {
  emitPipelineStart(payload: Record<string, unknown>): void;
  emitExecutionPlan(plan: ExecutionPlan, debugMode: boolean): void;
  emitAgentComplete(payload: Record<string, unknown>): void;
  emitTruncation(payload: TruncationTelemetry): void;
  emitSectionWriterFallback(payload: Record<string, unknown>): void;
  emitAssemblyComplete(payload: Record<string, unknown>): void;
  emitPipelineComplete(payload: PipelineTelemetry): void;
}

export class PipelineTelemetryEmitter implements IPipelineTelemetryEmitter {
  constructor(private readonly onLog?: (message: string) => void) {}

  emitPipelineStart(payload: Record<string, unknown>): void {
    this.emit(PipelineTelemetryEvent.PIPELINE_START, payload);
  }

  emitExecutionPlan(plan: ExecutionPlan, debugMode: boolean): void {
    const summary = {
      patchIntent: plan.patchIntent,
      riskFlags: plan.riskFlags,
      enabledAgents: plan.enabledAgents,
      disabledAgents: plan.disabledAgents.map((item) => item.role),
      sectionWriters: plan.sectionWriters,
    };

    this.emit(
      PipelineTelemetryEvent.CONTEXT_GATHERER_COMPLETE,
      debugMode ? { ...summary, plan } : summary,
    );
  }

  emitAgentComplete(payload: Record<string, unknown>): void {
    this.emit(PipelineTelemetryEvent.AGENT_COMPLETE, payload);
  }

  emitTruncation(payload: TruncationTelemetry): void {
    this.emit(PipelineTelemetryEvent.TRUNCATION, payload as unknown as Record<string, unknown>);
  }

  emitSectionWriterFallback(payload: Record<string, unknown>): void {
    this.emit(PipelineTelemetryEvent.SECTION_WRITER_FALLBACK, payload);
  }

  emitAssemblyComplete(payload: Record<string, unknown>): void {
    this.emit(PipelineTelemetryEvent.ASSEMBLY_COMPLETE, payload);
  }

  emitPipelineComplete(payload: PipelineTelemetry): void {
    this.emit(PipelineTelemetryEvent.PIPELINE_COMPLETE, payload as unknown as Record<string, unknown>);
  }

  private emit(eventName: PipelineTelemetryEvent, payload: Record<string, unknown>): void {
    this.onLog?.(`[telemetry:${eventName}] ${JSON.stringify(payload)}`);
    trackEvent(eventName, payload);
  }
}
