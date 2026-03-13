import { GenerateOptions, ILLMAdapter } from "../../../llm-adapter";
import { functionCallExecute } from "../../../llm-tools/utils";
import { ContextGenerationRequest } from "../contextTypes";
import { GenerationCancelledError } from "../ContextOrchestratorService";
import { AdapterCalibrationService } from "./AdapterCalibrationService";
import { AgentPrompt, ContextOrchestratorConfig } from "./orchestratorTypes";

export class MultiAgentExecutor {
  constructor(
    private readonly config: ContextOrchestratorConfig,
    private readonly calibration: AdapterCalibrationService
  ) {}

  async executeAgents(
    agents: AgentPrompt[],
    adapter: ILLMAdapter,
    signal?: AbortSignal,
    request?: ContextGenerationRequest
  ): Promise<string[]> {
    const results: string[] = new Array(agents.length);
    let nextIndex = 0;
    let fatalError: Error | null = null;

    const runNext = async () => {
      while (!fatalError) {
        this.throwIfCancelled(signal);
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= agents.length) { return; }

        try {
          results[currentIndex] = await this.runAgent(agents[currentIndex], adapter, signal, request);
          this.throwIfCancelled(signal);
          this.reportProgress(request, `Executing agent ${currentIndex + 1}/${agents.length}...`);
        } catch (error) {
          fatalError = this.wrapError(error, "multi-agent-execution");
          return;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(this.config.concurrency, agents.length) }, () => runNext()));
    this.throwIfCancelled(signal);
    if (fatalError) { throw fatalError; }
    return results.filter((item) => item !== undefined);
  }

  private async runAgent(
    agent: AgentPrompt,
    adapter: ILLMAdapter,
    signal?: AbortSignal,
    request?: ContextGenerationRequest
  ): Promise<string> {
    this.reportLog(request, `[agent:${agent.role}] starting generation...`);

    let currentPrompt = agent.prompt;
    let iteration = 0;
    const maxIterations = agent.maxIterations ?? 3;
    let lastResponse: any;

    while (iteration < maxIterations) {
      const options = this.buildGenerateOptions(adapter, {
        systemMessage: agent.systemMessage,
        maxTokens: adapter.getMaxOutputTokens(),
        tools: agent.tools?.map((t) => t.functionCalling),
      });

      this.reportLog(request, `[agent:${agent.role}] iteration ${iteration + 1}/${maxIterations}`);

      const safePrompt = this.calibration.safeTruncatePrompt(
        currentPrompt, options.systemMessage || "", adapter, request, agent.role
      );

      this.reportLog(request, `[agent:${agent.role}] payload:\nSystem Message:\n${options.systemMessage}\n\nPrompt:\n${safePrompt}`);

      const response = await this.calibration.generateTextWithAutoRetry(
        safePrompt, options.systemMessage || "", options, adapter, request, agent.role
      );
      this.throwIfCancelled(signal);
      lastResponse = response;

      if (response.toolCalls && response.toolCalls.length > 0 && agent.tools) {
        this.reportLog(request, `[agent:${agent.role}] executing ${response.toolCalls.length} tool call(s)`);
        const toolResults = await functionCallExecute({
          functionCalls: agent.tools,
          llmAdapter: adapter,
          toolCalls: response.toolCalls,
          onStream: () => {},
        });
        this.throwIfCancelled(signal);
        const toolContext = toolResults
          .map((r) => `Tool ${r.tool.function.name} returned:\n${r.result.description}\n`)
          .join("\n");
        currentPrompt = `${currentPrompt}\n\nSystem: Tool execution results:\n${toolContext}\n\nPlease analyze these results and continue your task. You can call more tools if needed, or provide your final analysis if you have enough information.`;
        iteration++;
      } else {
        break;
      }
    }

    // Self-Audit reflection pass
    if (agent.selfAudit) {
      lastResponse = await this.runSelfAudit(agent, adapter, lastResponse, signal, request);
    }

    const report = `### Agent: ${agent.role}\n\n${lastResponse.text.trim()}`;
    this.reportLog(request, `[agent:${agent.role}] completed`);
    return report;
  }

  private async runSelfAudit(
    agent: AgentPrompt,
    adapter: ILLMAdapter,
    lastResponse: any,
    signal?: AbortSignal,
    request?: ContextGenerationRequest
  ): Promise<any> {
    this.reportLog(request, `[agent:${agent.role}] performing self-audit pass`);

    const auditOptions = this.buildGenerateOptions(adapter, {
      systemMessage: agent.systemMessage,
      maxTokens: adapter.getMaxOutputTokens(),
    });

    // Self-audit ONLY needs the previous analysis — the model already "knows" the diff
    // from the prior iteration. Re-submitting agent.prompt (full diff) is wasteful
    // and can exceed context limits even on large-context models.
    const previousAnalysis = lastResponse?.text?.trim() ?? "";

    const auditPrompt =
      `Here is your previous analysis:\n\n${previousAnalysis}\n\n---\n` +
      `Self-audit the analysis above. Check for:\n` +
      `- Missed critical issues or bugs\n` +
      `- Integration risks or side effects\n` +
      `- Incomplete or incorrect conclusions\n` +
      `- Missing edge cases\n\n` +
      `If your analysis is complete and accurate, output it as the final version unchanged. ` +
      `If you find gaps or errors, provide a revised and improved version.`;

    const safeAuditPrompt = this.calibration.safeTruncatePrompt(
      auditPrompt, agent.systemMessage, adapter, request, `${agent.role}:self-audit`
    );

    const auditResponse = await this.calibration.generateTextWithAutoRetry(
      safeAuditPrompt, agent.systemMessage, auditOptions, adapter, request, `${agent.role}:self-audit`
    );
    this.throwIfCancelled(signal);
    return auditResponse;
  }

  private buildGenerateOptions(adapter: ILLMAdapter, options: GenerateOptions): GenerateOptions {
    if (adapter.getProvider() === "openai" && adapter.getModel().startsWith("gpt-5")) {
      return { ...options, reasoning: { effort: "low" } };
    }
    return options;
  }

  private reportProgress(request: ContextGenerationRequest | undefined, message: string): void {
    request?.onProgress?.(message);
  }

  private reportLog(request: ContextGenerationRequest | undefined, message: string): void {
    request?.onLog?.(message);
  }

  private throwIfCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) { throw new GenerationCancelledError(); }
  }

  private wrapError(error: unknown, stage: string): Error {
    if (error instanceof GenerationCancelledError) { return error; }
    return error instanceof Error
      ? new Error(`[${stage}] ${error.message}`)
      : new Error(`[${stage}] ${String(error)}`);
  }
}
