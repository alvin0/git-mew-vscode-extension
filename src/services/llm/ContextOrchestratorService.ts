import { GenerateOptions, ILLMAdapter } from "../../llm-adapter";
import {
  ChunkAnalysis,
  ContextGenerationRequest,
  ContextStrategy,
  CoordinatorPromptInput,
  DiffChunk,
  DiffChunkEntry,
  LlmRequestLogEntry,
  UnifiedDiffFile,
} from "./contextTypes";
import { TokenEstimatorService } from "./TokenEstimatorService";
import { AdapterCalibrationService } from "./orchestrator/AdapterCalibrationService";
import { ChunkAnalysisReducer } from "./orchestrator/ChunkAnalysisReducer";
import { DiffChunkBuilder } from "./orchestrator/DiffChunkBuilder";
import { trackEvent } from "../posthog";
import { MultiAgentExecutor } from "./orchestrator/MultiAgentExecutor";
import {
  AgentBudgetAllocation,
  AgentPrompt,
  AgentPromptBuildContext,
  BudgetProfile,
  ContextOrchestratorConfig,
  DEFAULT_ORCHESTRATOR_CONFIG,
  PhasedAgentConfig,
  SharedContextStore,
  AgentPromptBuilder,
  TaskExecutionProfile,
  FAST_REDUCER_SYSTEM_PROMPT,
  FAST_WORKER_SYSTEM_PROMPT,
  REDUCER_SYSTEM_PROMPT,
  WORKER_SYSTEM_PROMPT,
} from "./orchestrator/orchestratorTypes";

export { AgentPrompt };

export class GenerationCancelledError extends Error {
  constructor(message: string = "Generation cancelled.") {
    super(message);
    this.name = "GenerationCancelledError";
  }
}

export class ContextOrchestratorService {
  private readonly config: ContextOrchestratorConfig;
  private readonly tokenEstimator: TokenEstimatorService;
  private readonly calibration: AdapterCalibrationService;
  private readonly chunkBuilder: DiffChunkBuilder;
  private readonly reducer: ChunkAnalysisReducer;
  private readonly multiAgentExecutor: MultiAgentExecutor;

  constructor(config: Partial<ContextOrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.tokenEstimator = new TokenEstimatorService();
    this.calibration = new AdapterCalibrationService(this.config, this.tokenEstimator);
    this.chunkBuilder = new DiffChunkBuilder(this.tokenEstimator);
    this.reducer = new ChunkAnalysisReducer(this.config, this.tokenEstimator);
    this.multiAgentExecutor = new MultiAgentExecutor(this.config, this.calibration, this.tokenEstimator);
  }

  public estimateTokens(text: string, model?: string): number {
    return this.tokenEstimator.estimateTextTokens(text, model) + 32;
  }

  public getBudgetProfile(contextWindowOrModel: number | string): BudgetProfile {
    const contextWindow =
      typeof contextWindowOrModel === "number"
        ? contextWindowOrModel
        : this.config.defaultContextWindow;
    const clampToWindow = (tokens: number) => Math.min(contextWindow, tokens);

    return {
      contextWindow,
      directInputBudget: clampToWindow(Math.max(2400, Math.floor(contextWindow * this.config.directBudgetRatio))),
      workerInputBudget: clampToWindow(Math.max(1400, Math.floor(contextWindow * this.config.workerBudgetRatio))),
      reducerInputBudget: clampToWindow(Math.max(1400, Math.floor(contextWindow * this.config.reducerBudgetRatio))),
      finalInputBudget: clampToWindow(Math.max(2000, Math.floor(contextWindow * this.config.finalBudgetRatio))),
    };
  }

  public resolveStrategy(
    strategy: ContextStrategy,
    contextWindow: number,
    model: string,
    systemMessage: string,
    prompt: string
  ): ContextStrategy {
    if (strategy !== "auto") { return strategy; }
    const budget = this.getBudgetProfile(contextWindow);
    const approximatePromptTokens = Math.ceil((systemMessage.length + prompt.length) / 4);
    if (approximatePromptTokens > budget.directInputBudget) {
      return "hierarchical";
    }
    if (approximatePromptTokens <= Math.floor(budget.directInputBudget * 0.5)) {
      return "direct";
    }

    const estimatedPrompt = this.estimateTokens(systemMessage, model) + this.estimateTokens(prompt, model);
    return estimatedPrompt <= budget.directInputBudget ? "direct" : "hierarchical";
  }

  public buildChunks(files: UnifiedDiffFile[], maxChunkTokens: number, model?: string): DiffChunk[] {
    return this.chunkBuilder.buildChunks(files, maxChunkTokens, model);
  }

  public async generate(request: ContextGenerationRequest): Promise<string> {
    this.throwIfCancelled(request.signal);
    this.reportProgress(request, "Preparing diff context...");
    this.reportLog(request, `[context] preparing ${request.changes.length} changed file(s) for ${request.task.label}`);

    const executionProfile = this.getExecutionProfile(request);
    const effectiveContextWindow = this.getEffectiveContextWindow(request.adapter);
    const effectiveStrategy = this.resolveStrategy(
      request.strategy,
      effectiveContextWindow,
      request.adapter.getModel(),
      request.task.systemMessage,
      request.task.directPrompt
    );

    if (effectiveStrategy === "direct") {
      this.reportProgress(request, "Sending request to model...");
      this.reportLog(request, `[strategy] using direct mode for ${request.task.label}`);
      return this.generateFinalText(
        request.adapter, request.task.systemMessage, request.task.directPrompt,
        request.signal, request, "direct-final"
      );
    }

    const budgets = this.getBudgetProfile(effectiveContextWindow);
    const workerPayloadBudget = Math.max(
      900,
      Math.floor(budgets.workerInputBudget * executionProfile.workerBudgetMultiplier) - this.config.workerOverheadTokens
    );

    const chunks = this.chunkBuilder.buildChunks(request.changes, workerPayloadBudget, request.adapter.getModel());
    this.reportProgress(request, `Split changes into ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}.`);
    this.reportLog(request, `[strategy] using hierarchical mode with ${chunks.length} chunk(s)`);

    const analyses = await this.reducer.processChunksInParallel(
      chunks, request.adapter, request.task.label, request.signal, request, executionProfile
    );

    this.reportProgress(request, "Reducing chunk summaries...");
    const reducedAnalyses = await this.reducer.reduceAnalysesUntilFit(
      analyses, request.adapter, request.task.systemMessage, request.task.buildCoordinatorPrompt,
      request.changes, request.signal, request, executionProfile,
      () => this.getBudgetProfile(effectiveContextWindow)
    );

    const coordinatorInput = this.reducer.buildCoordinatorPromptInput(
      reducedAnalyses, request.changes,
      Math.floor(budgets.finalInputBudget * executionProfile.finalBudgetMultiplier),
      executionProfile
    );
    const coordinatorPrompt = request.task.buildCoordinatorPrompt(coordinatorInput);

    this.reportProgress(request, "Generating final response...");
    this.reportLog(
      request,
      `[coordinator] synthesizing final ${request.task.label} response from ${reducedAnalyses.length} summary block(s)`
    );
    return this.generateFinalText(
      request.adapter, request.task.systemMessage, coordinatorPrompt,
      request.signal, request, "coordinator-final"
    );
  }

  private async generateFinalText(
    adapter: ILLMAdapter,
    systemMessage: string,
    prompt: string,
    signal?: AbortSignal,
    request?: ContextGenerationRequest,
    stageLabel: string = "final"
  ): Promise<string> {
    this.reportLog(request, `[${stageLabel}] sending final request to ${adapter.getProvider()}/${adapter.getModel()}`);

    const safePrompt = this.calibration.safeTruncatePrompt(prompt, systemMessage, adapter, request, stageLabel);

    const finalOptions = this.buildGenerateOptions(adapter, {
      systemMessage,
      maxTokens: adapter.getMaxOutputTokens(),
    });
    const startTime = Date.now();
    const response = await this.calibration.generateTextWithAutoRetry(
      safePrompt, systemMessage, finalOptions, adapter, request, stageLabel
    );

    this.throwIfCancelled(signal);
    const durationMs = Date.now() - startTime;
    this.reportLog(request, `[${stageLabel}] response received (${response.promptTokens ?? '?'} prompt tokens, ${response.completionTokens ?? '?'} completion tokens)`);
    trackEvent('llm_request', {
      provider: adapter.getProvider(),
      model: adapter.getModel(),
      stage: stageLabel,
      ...(response.promptTokens !== undefined && { prompt_tokens: response.promptTokens }),
      ...(response.completionTokens !== undefined && { completion_tokens: response.completionTokens }),
      ...(response.totalTokens !== undefined && { total_tokens: response.totalTokens }),
      finish_reason: response.finishReason,
      duration_ms: durationMs,
    });
    this.reportLlmLog(request, {
      stage: stageLabel,
      provider: adapter.getProvider(),
      model: adapter.getModel(),
      systemMessage,
      prompt: safePrompt,
      response: response.text,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      totalTokens: response.totalTokens,
      finishReason: response.finishReason,
      durationMs,
      timestamp: new Date().toISOString(),
    });
    return response.text.trim();
  }

  public async generateMultiAgentFinalText(
    adapter: ILLMAdapter,
    agents: AgentPrompt[],
    synthesisSystemMessage: string,
    buildSynthesisPrompt: (agentReports: string[]) => string,
    signal?: AbortSignal,
    request?: ContextGenerationRequest,
    phasedConfig?: {
      sharedStore: SharedContextStore;
      promptBuilder: AgentPromptBuilder;
      buildContext: AgentPromptBuildContext;
      budgetAllocations: AgentBudgetAllocation[];
    }
  ): Promise<string> {
    this.reportLog(request, `[multi-agent] starting parallel execution of ${agents.length} agent(s)`);

    let agentReports: string[];
    if (phasedConfig) {
      agentReports = await this.multiAgentExecutor.executePhasedAgents(
        {
          phase1: agents,
          phase2: [],
          sharedStore: phasedConfig.sharedStore,
          promptBuilder: phasedConfig.promptBuilder,
          buildContext: phasedConfig.buildContext,
          budgetAllocations: phasedConfig.budgetAllocations,
        },
        adapter,
        signal,
        request
      );
    } else {
      agentReports = await this.multiAgentExecutor.executeAgents(agents, adapter, signal, request);
    }

    this.reportLog(request, `[multi-agent] synthesizing final report from ${agentReports.length} agent(s)`);
    this.reportProgress(request, "Synthesizing multi-agent reports...");

    const synthesisPrompt = buildSynthesisPrompt(agentReports);
    return this.generateFinalText(adapter, synthesisSystemMessage, synthesisPrompt, signal, request, "multi-agent-synthesis");
  }

  public async executePhasedAgentReports(
    config: PhasedAgentConfig,
    adapter: ILLMAdapter,
    signal?: AbortSignal,
    request?: ContextGenerationRequest,
  ): Promise<string[]> {
    return this.multiAgentExecutor.executePhasedAgents(config, adapter, signal, request);
  }

  public async executeSynthesisAgentReports(
    agents: AgentPrompt[],
    adapter: ILLMAdapter,
    signal?: AbortSignal,
    request?: ContextGenerationRequest,
  ): Promise<Map<string, string>> {
    return this.multiAgentExecutor.executeSynthesisAgents(agents, adapter, signal, request);
  }

  /**
   * Multi-agent MR description generation.
   * Phase 1: Change Analyzer + Context Investigator run in parallel.
   * Synthesis: Description Writer merges findings into final MR description.
   */
  public async generateMultiAgentDescription(
    adapter: ILLMAdapter,
    agents: AgentPrompt[],
    synthesisSystemMessage: string,
    buildSynthesisPrompt: (agentReports: string[]) => string,
    sharedStore: SharedContextStore,
    signal?: AbortSignal,
    request?: ContextGenerationRequest,
  ): Promise<string> {
    this.reportLog(request, `[description] starting multi-agent description with ${agents.length} agent(s)`);

    const agentReports = await this.multiAgentExecutor.executeDescriptionAgents(
      agents,
      sharedStore as any,
      adapter,
      signal,
      request
    );

    this.reportLog(request, `[description] synthesizing final description from ${agentReports.length} agent(s)`);
    this.reportProgress(request, "Writing MR description...");

    const synthesisPrompt = buildSynthesisPrompt(agentReports);
    return this.generateFinalText(adapter, synthesisSystemMessage, synthesisPrompt, signal, request, "description-synthesis");
  }

  private buildGenerateOptions(adapter: ILLMAdapter, options: GenerateOptions): GenerateOptions {
    if (adapter.getProvider() === "openai" && adapter.getModel().startsWith("gpt-5")) {
      return { ...options, reasoning: { effort: "low" } };
    }
    return options;
  }

  private getEffectiveContextWindow(adapter: ILLMAdapter): number {
    const adapterContextWindow = adapter.getContextWindow();
    if (!Number.isFinite(adapterContextWindow) || adapterContextWindow <= 0) {
      return this.config.defaultContextWindow;
    }
    return Math.min(adapterContextWindow, this.config.defaultContextWindow);
  }

  private getExecutionProfile(request: ContextGenerationRequest): TaskExecutionProfile {
    if (request.task.kind === "commit" || request.task.speedProfile === "fast") {
      return {
        concurrency: 4,
        workerBudgetMultiplier: 1.45,
        reducerBudgetMultiplier: 1.25,
        finalBudgetMultiplier: 1.2,
        changedFilesBudgetMultiplier: 0.75,
        workerMaxTokens: 420,
        reducerMaxTokens: 420,
      };
    }
    return {
      concurrency: this.config.concurrency,
      workerBudgetMultiplier: 1,
      reducerBudgetMultiplier: 1,
      finalBudgetMultiplier: 1,
      changedFilesBudgetMultiplier: 1,
      workerMaxTokens: 900,
      reducerMaxTokens: 900,
    };
  }

  private throwIfCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) { throw new GenerationCancelledError(); }
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

  private truncateLog(text: string, maxLength: number = 1600): string {
    const normalized = text.trim();
    if (normalized.length <= maxLength) { return normalized; }
    return `${normalized.slice(0, maxLength)}\n...[truncated ${normalized.length - maxLength} chars]`;
  }

  private wrapError(error: unknown, stage: string): Error {
    if (error instanceof GenerationCancelledError) { return error; }
    return error instanceof Error
      ? new Error(`[${stage}] ${error.message}`)
      : new Error(`[${stage}] ${String(error)}`);
  }
}
