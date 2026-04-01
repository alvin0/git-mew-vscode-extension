import { GenerateOptions, ILLMAdapter } from "../../../llm-adapter";
import { functionCallExecute } from "../../../llm-tools/utils";
import { ContextGenerationRequest, LlmRequestLogEntry } from "../contextTypes";
import { GenerationCancelledError } from "../ContextOrchestratorService";
import { TokenEstimatorService } from "../TokenEstimatorService";
import { AdapterCalibrationService } from "./AdapterCalibrationService";
import {
  AgentPrompt,
  CodeReviewerOutput,
  ContextOrchestratorConfig,
  FlowDiagramOutput,
  PhasedAgentConfig,
  RiskHypothesis,
  StructuredAgentReport,
} from "./orchestratorTypes";
import { RiskHypothesisGenerator } from "./RiskHypothesisGenerator";
import { ISharedContextStore } from "./SharedContextStore";

export class MultiAgentExecutor {
  constructor(
    private readonly config: ContextOrchestratorConfig,
    private readonly calibration: AdapterCalibrationService,
    private readonly tokenEstimator?: TokenEstimatorService
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

  async executePhasedAgents(
    config: PhasedAgentConfig,
    adapter: ILLMAdapter,
    signal?: AbortSignal,
    request?: ContextGenerationRequest
  ): Promise<string[]> {
    const { phase1, sharedStore, promptBuilder, buildContext, budgetAllocations } = config;

    // ── Phase 1: Parallel execution ──
    this.reportProgress(request, "Executing Code Reviewer and Flow Diagram agents...");
    const phase1Results: (string | Error)[] = new Array(phase1.length);

    let nextIndex = 0;
    const runPhase1 = async () => {
      while (true) {
        this.throwIfCancelled(signal);
        const idx = nextIndex++;
        if (idx >= phase1.length) { return; }
        try {
          phase1Results[idx] = await this.runAgent(phase1[idx], adapter, signal, request);
        } catch (error) {
          phase1Results[idx] = error instanceof Error ? error : new Error(String(error));
          this.reportLog(request, `[phase1] agent ${phase1[idx].role} failed: ${error}`);
        }
      }
    };
    await Promise.all(Array.from(
      { length: Math.min(this.config.concurrency, phase1.length) },
      () => runPhase1()
    ));

    // ── Parse Phase 1 structured outputs → store in SharedContextStore ──
    const structuredReports: StructuredAgentReport[] = [];
    for (let i = 0; i < phase1.length; i++) {
      const result = phase1Results[i];
      if (typeof result !== 'string') { continue; }

      const parsed = this.parseStructuredOutput(result, phase1[i].outputSchema);
      if (parsed) {
        structuredReports.push(parsed);
        (sharedStore as ISharedContextStore).addAgentFindings(phase1[i].role, [{
          agentRole: phase1[i].role,
          type: phase1[i].role === 'Code Reviewer' ? 'issue' : 'flow',
          data: parsed.structured,
          timestamp: Date.now(),
        }]);
      }
    }

    // ── Risk Hypothesis Generation (between phases) ──
    this.reportProgress(request, "Generating risk hypotheses...");
    const estimator = this.tokenEstimator ?? new TokenEstimatorService();
    const hypothesisGenerator = new RiskHypothesisGenerator(estimator);
    let hypotheses: RiskHypothesis[] = [];
    try {
      const crReport = structuredReports.find(r => r.role === 'Code Reviewer');
      const fdReport = structuredReports.find(r => r.role === 'Flow Diagram');
      const graph = (sharedStore as ISharedContextStore).getDependencyGraph();

      if (crReport && fdReport && graph) {
        hypotheses = await hypothesisGenerator.generate(
          crReport.structured as CodeReviewerOutput,
          fdReport.structured as FlowDiagramOutput,
          graph,
          adapter, signal
        );
      } else {
        this.reportLog(request, `[hypothesis] skipped: missing Phase 1 outputs (CR=${!!crReport}, FD=${!!fdReport}, graph=${!!graph})`);
      }
      (sharedStore as ISharedContextStore).setRiskHypotheses(hypotheses);
    } catch (error) {
      this.reportLog(request, `[hypothesis] generation failed, Observer runs without hypotheses: ${error}`);
    }

    // ── Phase 2: Observer with injected context ──
    this.reportProgress(request, "Observer analyzing with context from other agents...");
    const observerBudget = budgetAllocations.find(b => b.agentRole === 'Observer')!;
    const observerAgent = promptBuilder.buildObserverPrompt(
      { ...buildContext, sharedContextStore: sharedStore, riskHypotheses: hypotheses },
      observerBudget
    );

    let observerResult: string;
    try {
      observerResult = await this.runAgent(observerAgent, adapter, signal, request);

      // Parse and store Observer structured output
      const parsedObserver = this.parseStructuredOutput(observerResult, 'observer');
      if (parsedObserver) {
        (sharedStore as ISharedContextStore).addAgentFindings('Observer', [{
          agentRole: 'Observer',
          type: 'risk',
          data: parsedObserver.structured,
          timestamp: Date.now(),
        }]);
      }
    } catch (error) {
      this.reportLog(request, `[phase2] Observer failed: ${error}`);
      observerResult = `### Agent: Observer\n\nObserver analysis unavailable due to error.`;
    }

    // ── Combine all results ──
    const allResults = [
      ...phase1Results.filter((r): r is string => typeof r === 'string'),
      observerResult,
    ];
    return allResults;
  }

  /**
   * Execute description agents: Phase 1 (Change Analyzer ∥ Context Investigator) in parallel.
   * No Phase 2 agent — synthesis is handled by the caller via generateMultiAgentFinalText.
   * Stores structured findings in SharedContextStore for the synthesis callback.
   */
  async executeDescriptionAgents(
    agents: AgentPrompt[],
    sharedStore: ISharedContextStore,
    adapter: ILLMAdapter,
    signal?: AbortSignal,
    request?: ContextGenerationRequest
  ): Promise<string[]> {
    this.reportProgress(request, "Executing Change Analyzer and Context Investigator agents...");
    const results: (string | Error)[] = new Array(agents.length);

    let nextIndex = 0;
    const runAgent = async () => {
      while (true) {
        this.throwIfCancelled(signal);
        const idx = nextIndex++;
        if (idx >= agents.length) { return; }
        try {
          results[idx] = await this.runAgent(agents[idx], adapter, signal, request);
        } catch (error) {
          results[idx] = error instanceof Error ? error : new Error(String(error));
          this.reportLog(request, `[description] agent ${agents[idx].role} failed: ${error}`);
        }
      }
    };
    await Promise.all(Array.from(
      { length: Math.min(this.config.concurrency, agents.length) },
      () => runAgent()
    ));

    // Parse and store structured outputs
    for (let i = 0; i < agents.length; i++) {
      const result = results[i];
      if (typeof result !== 'string') { continue; }

      const parsed = this.parseDescriptionOutput(result, agents[i].role);
      if (parsed) {
        sharedStore.addAgentFindings(agents[i].role, [{
          agentRole: agents[i].role,
          type: agents[i].role === 'Change Analyzer' ? 'issue' : 'risk',
          data: parsed,
          timestamp: Date.now(),
        }]);
      }
    }

    return results.filter((r): r is string => typeof r === 'string');
  }

  /** Parse description agent output — separate from review parsing */
  private parseDescriptionOutput(rawText: string, role: string): unknown | null {
    const bodyMatch = rawText.match(/### Agent: .+?\n\n([\s\S]*)/);
    const body = bodyMatch?.[1]?.trim() ?? rawText;

    const jsonMatch = body.match(/```json\s*([\s\S]*?)```/) || body.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) { return null; }

    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (role === 'Change Analyzer' && Array.isArray(parsed.changeGroups)) {
        return parsed;
      }
      if (role === 'Context Investigator' && Array.isArray(parsed.impactedModules)) {
        return parsed;
      }
    } catch {
      // fallback
    }

    this.reportLog(undefined, `[parseDescriptionOutput] failed to parse ${role} output`);
    return null;
  }

  private parseStructuredOutput(rawText: string, schema?: string): StructuredAgentReport | null {
    // Extract body after "### Agent: {role}\n\n"
    const bodyMatch = rawText.match(/### Agent: .+?\n\n([\s\S]*)/);
    const body = bodyMatch?.[1]?.trim() ?? rawText;

    // Try to extract JSON: first try ```json...``` block, then try {...} match
    const jsonMatch = body.match(/```json\s*([\s\S]*?)```/) || body.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) { return null; }

    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      switch (schema) {
        case 'code-reviewer':
          if (Array.isArray(parsed.issues)) {
            return { role: 'Code Reviewer', structured: parsed, raw: body };
          }
          break;
        case 'flow-diagram':
          if (Array.isArray(parsed.diagrams)) {
            return { role: 'Flow Diagram', structured: parsed, raw: body };
          }
          break;
        case 'observer':
          if (Array.isArray(parsed.risks)) {
            return { role: 'Observer', structured: parsed, raw: body };
          }
          break;
      }
    } catch {
      // fallback to raw text
    }

    this.reportLog(undefined, `[parseStructuredOutput] failed to parse ${schema} output`);
    return null;
  }

  private async runObserverSelfAudit(
    agent: AgentPrompt,
    adapter: ILLMAdapter,
    lastResponse: any,
    sharedStore: ISharedContextStore,
    signal?: AbortSignal,
    request?: ContextGenerationRequest
  ): Promise<any> {
    this.reportLog(request, `[agent:Observer] performing checklist-based self-audit`);

    const codeReviewerFindings = sharedStore.getAgentFindings('Code Reviewer');
    const flowDiagramFindings = sharedStore.getAgentFindings('Flow Diagram');

    let checklist = '';
    if (codeReviewerFindings.length > 0) {
      const crData = codeReviewerFindings[0].data as CodeReviewerOutput;
      if (crData.issues && Array.isArray(crData.issues)) {
        checklist += '## Code Reviewer Issues Checklist\n';
        checklist += crData.issues.map((issue, i) =>
          `${i + 1}. [${issue.severity}] ${issue.file}:${issue.location} — ${issue.description}\n` +
          `   → Have you assessed hidden risks for this issue?`
        ).join('\n');
      }
    }

    if (flowDiagramFindings.length > 0) {
      const fdData = flowDiagramFindings[0].data as FlowDiagramOutput;
      if (fdData.affectedFlows && Array.isArray(fdData.affectedFlows)) {
        checklist += '\n\n## Flow Diagram Flows Checklist\n';
        checklist += fdData.affectedFlows.map((flow, i) =>
          `${i + 1}. Flow: ${flow}\n   → Any integration concerns for this flow?`
        ).join('\n');
      }
    }

    const previousAnalysis = lastResponse?.text?.trim() ?? '';

    // NO full diff, NO reference context — reflection only
    const auditPrompt =
      `Here is your previous analysis:\n\n${previousAnalysis}\n\n---\n\n` +
      `${checklist}\n\n---\n\n` +
      `Self-audit using the checklists above:\n` +
      `1. For each Code Reviewer issue: have you assessed hidden risks? If not, add them.\n` +
      `2. For each Flow Diagram flow: any integration concerns? If not, confirm safe.\n` +
      `3. Are your todo items actionable and testable?\n` +
      `4. ONLY add new findings as additions. Do NOT rewrite your entire analysis.\n\n` +
      `Output your additions in the same JSON schema (risks[], todoItems[], integrationConcerns[]).`;

    const auditOptions = this.buildGenerateOptions(adapter, {
      systemMessage: agent.systemMessage,
      maxTokens: adapter.getMaxOutputTokens(),
      // NO tools — self-audit is reflection only
    });

    const safeAuditPrompt = this.calibration.safeTruncatePrompt(
      auditPrompt, agent.systemMessage, adapter, request, 'Observer:self-audit'
    );

    const startTime = Date.now();
    const auditResponse = await this.calibration.generateTextWithAutoRetry(
      safeAuditPrompt, agent.systemMessage, auditOptions, adapter, request, 'Observer:self-audit'
    );
    this.throwIfCancelled(signal);

    this.reportLlmLog(request, {
      stage: 'agent:Observer:self-audit',
      provider: adapter.getProvider(),
      model: adapter.getModel(),
      systemMessage: agent.systemMessage,
      prompt: safeAuditPrompt,
      response: auditResponse.text,
      promptTokens: auditResponse.promptTokens,
      completionTokens: auditResponse.completionTokens,
      totalTokens: auditResponse.totalTokens,
      finishReason: auditResponse.finishReason,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });

    return auditResponse;
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

      const startTime = Date.now();
      const response = await this.calibration.generateTextWithAutoRetry(
        safePrompt, options.systemMessage || "", options, adapter, request, agent.role
      );
      this.throwIfCancelled(signal);
      lastResponse = response;

      this.reportLlmLog(request, {
        stage: `agent:${agent.role}:iter${iteration + 1}`,
        provider: adapter.getProvider(),
        model: adapter.getModel(),
        systemMessage: options.systemMessage || "",
        prompt: safePrompt,
        response: response.text,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        totalTokens: response.totalTokens,
        finishReason: response.finishReason,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });

      if (response.toolCalls && response.toolCalls.length > 0 && agent.tools) {
        this.reportLog(request, `[agent:${agent.role}] executing ${response.toolCalls.length} tool call(s)`);

        // Fresh queryContextCallCount per iteration
        const queryContextCallCount = { value: 0 };

        const toolResults = await functionCallExecute({
          functionCalls: agent.tools,
          llmAdapter: adapter,
          toolCalls: response.toolCalls,
          onStream: () => {},
          sharedStore: agent.sharedStore,
          queryContextCallCount,
          compareBranch: agent.compareBranch,
          gitService: agent.gitService,
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
      if (agent.role === 'Observer' && agent.sharedStore) {
        lastResponse = await this.runObserverSelfAudit(
          agent, adapter, lastResponse, agent.sharedStore as ISharedContextStore, signal, request
        );
      } else {
        lastResponse = await this.runSelfAudit(agent, adapter, lastResponse, signal, request);
      }
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

    const startTime = Date.now();
    const auditResponse = await this.calibration.generateTextWithAutoRetry(
      safeAuditPrompt, agent.systemMessage, auditOptions, adapter, request, `${agent.role}:self-audit`
    );
    this.throwIfCancelled(signal);

    this.reportLlmLog(request, {
      stage: `agent:${agent.role}:self-audit`,
      provider: adapter.getProvider(),
      model: adapter.getModel(),
      systemMessage: agent.systemMessage,
      prompt: safeAuditPrompt,
      response: auditResponse.text,
      promptTokens: auditResponse.promptTokens,
      completionTokens: auditResponse.completionTokens,
      totalTokens: auditResponse.totalTokens,
      finishReason: auditResponse.finishReason,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });

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

  private reportLlmLog(request: ContextGenerationRequest | undefined, entry: LlmRequestLogEntry): void {
    request?.onLlmLog?.(entry);
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
