import { ILLMAdapter } from '../../../llm-adapter';
import { GenerationCancelledError } from '../ContextOrchestratorService';
import { TokenEstimatorService } from '../TokenEstimatorService';
import { UnifiedDiffFile } from '../contextTypes';
import { AdapterCalibrationService } from './AdapterCalibrationService';
import { ExecutionPlan, Finding } from './executionPlanTypes';

export interface SummaryWriterInput {
  findings: Finding[];
  changedFiles: UnifiedDiffFile[];
  language: string;
  tokenBudget: number;
}

export interface ImprovementWriterInput {
  findings: Finding[];
  language: string;
  tokenBudget: number;
}

export interface SectionWriterExecutionInput {
  adapter: ILLMAdapter;
  calibration: AdapterCalibrationService;
  prompt: string;
  systemMessage: string;
  tokenBudget: number;
  signal?: AbortSignal;
  request?: { onLog?: (message: string) => void; onLlmLog?: (entry: import('../contextTypes').LlmRequestLogEntry) => void };
  stageLabel: string;
}

const tokenEstimator = new TokenEstimatorService();

export function shouldActivateSummaryWriter(plan?: ExecutionPlan): boolean {
  return plan?.patchSize === 'medium' || plan?.patchSize === 'large';
}

export function shouldActivateImprovementWriter(findings: Finding[]): boolean {
  return findings.length >= 3 || findings.some((finding) => finding.severity === 'critical' || finding.severity === 'major');
}

export function buildSummaryWriterPrompt(input: SummaryWriterInput): string {
  const topFindings = input.findings
    .slice(0, 8)
    .map((finding) => `- [${finding.severity}] ${finding.file}: ${finding.description}`)
    .join('\n') || 'None';
  const changedFiles = input.changedFiles.map((file) => `- ${file.relativePath} (${file.statusLabel})`).join('\n') || 'None';

  return [
    'Write only the markdown section `## 2. Summary of Changes`.',
    `Respond in ${input.language}.`,
    'Keep it concise and grounded in the findings below.',
    '## Changed Files',
    changedFiles,
    '## Renderable Findings',
    topFindings,
  ].join('\n\n');
}

export function buildImprovementWriterPrompt(input: ImprovementWriterInput): string {
  const grouped = new Map<string, Finding[]>();
  for (const finding of input.findings) {
    const list = grouped.get(finding.category) ?? [];
    list.push(finding);
    grouped.set(finding.category, list);
  }

  const findingsByCategory = [...grouped.entries()]
    .map(([category, findings]) =>
      `### ${category}\n` +
      findings
        .slice(0, 8)
        .map((finding) => `- [${finding.severity}] ${finding.file}: ${finding.description}\n  Fix: ${finding.suggestion}`)
        .join('\n'),
    )
    .join('\n\n') || 'None';

  return [
    'Write only the markdown section `## 6. Improvement Suggestions`.',
    `Respond in ${input.language}.`,
    'Use the grouped findings below. Keep the output actionable.',
    findingsByCategory,
  ].join('\n\n');
}

export async function executeSectionWriter(input: SectionWriterExecutionInput): Promise<string> {
  if (input.signal?.aborted) {
    throw new GenerationCancelledError();
  }

  const safePrompt = input.calibration.safeTruncatePrompt(
    input.prompt,
    input.systemMessage,
    input.adapter,
    undefined,
    input.stageLabel,
    undefined,
    input.tokenBudget,
  );
  const swReqId = `section-writer:${input.stageLabel}-${Date.now()}`;
  input.request?.onLlmLog?.({
    requestId: swReqId,
    stage: `section-writer:${input.stageLabel}`,
    provider: input.adapter.getProvider(),
    model: input.adapter.getModel(),
    status: 'pending',
    systemMessage: input.systemMessage,
    prompt: safePrompt,
    promptTokens: tokenEstimator.estimateTextTokens(safePrompt) + tokenEstimator.estimateTextTokens(input.systemMessage),
    timestamp: new Date().toISOString(),
  });
  const response = await input.calibration.generateTextWithAutoRetry(
    safePrompt,
    input.systemMessage,
    {
      systemMessage: input.systemMessage,
      maxTokens: Math.min(input.tokenBudget, input.adapter.getMaxOutputTokens()),
    },
    input.adapter,
    undefined,
    input.stageLabel,
  );

  if (input.signal?.aborted) {
    throw new GenerationCancelledError();
  }

  const totalTokens = response.totalTokens ?? tokenEstimator.estimateTextTokens(response.text);
  input.request?.onLlmLog?.({
    requestId: swReqId,
    stage: `section-writer:${input.stageLabel}`,
    provider: input.adapter.getProvider(),
    model: input.adapter.getModel(),
    status: 'completed',
    systemMessage: input.systemMessage,
    prompt: safePrompt,
    response: response.text,
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
    totalTokens: response.totalTokens,
    finishReason: response.finishReason,
    timestamp: new Date().toISOString(),
  });
  input.request?.onLog?.(`[section-writer:${input.stageLabel}] tokens=${totalTokens}`);
  return response.text.trim();
}
