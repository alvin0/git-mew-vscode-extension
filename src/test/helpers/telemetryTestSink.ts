import * as assert from 'assert';
import { IPipelineTelemetryEmitter } from '../../services/llm/orchestrator/PipelineTelemetryEmitter';
import { ExecutionPlan } from '../../services/llm/orchestrator/executionPlanTypes';
import { PipelineTelemetry, PipelineTelemetryEvent, TruncationTelemetry } from '../../services/llm/orchestrator/telemetryTypes';

export class TelemetryTestSink implements IPipelineTelemetryEmitter {
  public readonly events: Array<{ name: string; payload: Record<string, unknown> }> = [];

  emitPipelineStart(payload: Record<string, unknown>): void {
    this.events.push({ name: PipelineTelemetryEvent.PIPELINE_START, payload });
  }

  emitExecutionPlan(plan: ExecutionPlan, debugMode: boolean): void {
    this.events.push({
      name: PipelineTelemetryEvent.CONTEXT_GATHERER_COMPLETE,
      payload: debugMode ? { plan } : { patchIntent: plan.patchIntent },
    });
  }

  emitAgentComplete(payload: Record<string, unknown>): void {
    this.events.push({ name: PipelineTelemetryEvent.AGENT_COMPLETE, payload });
  }

  emitTruncation(payload: TruncationTelemetry): void {
    this.events.push({ name: PipelineTelemetryEvent.TRUNCATION, payload: payload as unknown as Record<string, unknown> });
  }

  emitSectionWriterFallback(payload: Record<string, unknown>): void {
    this.events.push({ name: PipelineTelemetryEvent.SECTION_WRITER_FALLBACK, payload });
  }

  emitAssemblyComplete(payload: Record<string, unknown>): void {
    this.events.push({ name: PipelineTelemetryEvent.ASSEMBLY_COMPLETE, payload });
  }

  emitPipelineComplete(payload: PipelineTelemetry): void {
    this.events.push({ name: PipelineTelemetryEvent.PIPELINE_COMPLETE, payload: payload as unknown as Record<string, unknown> });
  }
}

export function assertEventEmitted(
  sink: TelemetryTestSink,
  eventName: string,
  payloadMatcher?: (payload: Record<string, unknown>) => boolean,
): void {
  const matched = sink.events.find((event) =>
    event.name === eventName && (payloadMatcher ? payloadMatcher(event.payload) : true),
  );
  assert.ok(matched, `Expected telemetry event ${eventName} to be emitted.`);
}
