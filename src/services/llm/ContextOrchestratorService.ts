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
import { DEFAULT_BUDGET_CONFIG, ContextBudgetManager } from "./orchestrator/ContextBudgetManager";
import { ContextGatherer } from "./orchestrator/ContextGatherer";
import { DiffChunkBuilder } from "./orchestrator/DiffChunkBuilder";
import { trackEvent } from "../posthog";
import { MultiAgentExecutor } from "./orchestrator/MultiAgentExecutor";
import { HybridAssembly } from "./orchestrator/HybridAssembly";
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
  StructuredAgentReport,
  ExecutionPlan,
  WORKER_SYSTEM_PROMPT,
} from "./orchestrator/orchestratorTypes";
import {
  AdaptivePipelineInput,
  AdaptivePipelineOutput,
  LegacyStructuredReportAdapter,
} from "./orchestrator/adaptivePipelineTypes";
import { SuppressionFilter } from "./orchestrator/SuppressionFilter";
import { PipelineTelemetryEmitter } from "./orchestrator/PipelineTelemetryEmitter";
import { isDebugTelemetryEnabled } from "./orchestrator/adaptivePipelineFlag";
import { SessionMemory } from "./orchestrator/SessionMemory";

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
  private readonly budgetManager: ContextBudgetManager;
  private readonly contextGatherer: ContextGatherer;

  constructor(config: Partial<ContextOrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.tokenEstimator = new TokenEstimatorService();
    this.calibration = new AdapterCalibrationService(this.config, this.tokenEstimator);
    this.chunkBuilder = new DiffChunkBuilder(this.tokenEstimator);
    this.reducer = new ChunkAnalysisReducer(this.config, this.tokenEstimator);
    this.multiAgentExecutor = new MultiAgentExecutor(this.config, this.calibration, this.tokenEstimator);
    this.budgetManager = new ContextBudgetManager(DEFAULT_BUDGET_CONFIG, this.tokenEstimator);
    this.contextGatherer = new ContextGatherer(this.tokenEstimator, DEFAULT_BUDGET_CONFIG.agentBudgetRatios);
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

  public async runAdaptivePipeline(input: AdaptivePipelineInput): Promise<AdaptivePipelineOutput> {
    try {
      if (input.signal?.aborted) {
        throw new GenerationCancelledError();
      }

      const telemetry = input.telemetryEmitter ?? new PipelineTelemetryEmitter(input.request?.onLog);
      this.calibration.setTruncationHandler((payload) => telemetry.emitTruncation(payload));
      telemetry.emitPipelineStart({
        changedFiles: input.changedFiles.length,
        suppressedRules: input.suppressedFindings.length,
      });

      const contextGathererStart = Date.now();
      let executionPlan: ExecutionPlan | undefined;
      let effectivePhaseConfig = input.phaseConfig;
      let effectiveBudgets = input.phaseConfig.budgetAllocations;
      let contextGathererFailed = false;
      let graphAvailability: 'available' | 'unavailable' | 'partial' = 'unavailable';

      try {
        const dependencyGraph = input.dependencyGraph ?? input.phaseConfig.buildContext.dependencyGraph;
        graphAvailability = this.determineGraphAvailability(input.changedFiles, dependencyGraph);
        executionPlan = this.contextGatherer.analyze({
          changes: input.changedFiles,
          diffText: input.diffText ?? input.phaseConfig.buildContext.fullDiff,
          dependencyGraph,
          diffTokens: input.diffTokens ?? this.estimateTokens(input.phaseConfig.buildContext.fullDiff, input.adapter.getModel()),
          contextWindow: input.contextWindow ?? input.adapter.getContextWindow(),
        });
        input.sharedStore.setExecutionPlan(executionPlan);
        telemetry.emitExecutionPlan(executionPlan, isDebugTelemetryEnabled());
        input.request?.onLog?.(`[adaptive] graph availability=${graphAvailability}`);
        const adaptiveBudgets = this.budgetManager.allocateFromExecutionPlan(
          executionPlan,
          input.contextWindow ?? input.adapter.getContextWindow(),
          input.maxOutputTokens ?? input.adapter.getMaxOutputTokens(),
          input.systemTokens ?? this.estimateTokens(input.request?.task.systemMessage ?? '', input.adapter.getModel()),
          input.diffTokens ?? this.estimateTokens(input.phaseConfig.buildContext.fullDiff, input.adapter.getModel()),
        );
        effectiveBudgets = adaptiveBudgets;
        effectivePhaseConfig = this.rebuildAdaptivePhaseConfig(input.phaseConfig, adaptiveBudgets);
      } catch (error) {
        contextGathererFailed = true;
        input.request?.onLog?.(`[adaptive] context gatherer failed, falling back to static budget: ${error}`);
      }
      const contextGathererDurationMs = Date.now() - contextGathererStart;

      const phaseStart = Date.now();
      const phaseReports = await this.multiAgentExecutor.executePhasedAgents(
        effectivePhaseConfig,
        input.adapter,
        input.signal,
        input.request,
        executionPlan,
      );
      const phaseDurationMs = Date.now() - phaseStart;

      if (input.signal?.aborted) {
        throw new GenerationCancelledError();
      }

      const structuredReports = LegacyStructuredReportAdapter.fromSharedStore(input.sharedStore, phaseReports);
      const agentTokenUsage = this.multiAgentExecutor.getLastAgentTokenUsage();
      const skippedAgents = executionPlan?.disabledAgents ?? this.multiAgentExecutor.getLastSkippedAgents();
      for (const report of structuredReports) {
        const allocated = effectiveBudgets.find((budget) => budget.agentRole === report.role)?.totalBudget;
        telemetry.emitAgentComplete({
          role: report.role,
          structured: true,
          rawLength: report.raw.length,
          allocatedTokens: allocated,
          actualTokens: agentTokenUsage[report.role] ?? 0,
        });
      }

      const suppressionResult = input.sharedStore instanceof SessionMemory
        ? SuppressionFilter.applyToSessionMemory(input.sharedStore, input.suppressedFindings)
        : SuppressionFilter.applyToLegacyReports(
          structuredReports,
          input.suppressedFindings,
        );

      const assemblyStart = Date.now();
      const assembly = new HybridAssembly();
      const actualReviewDurationMs = input.reviewStartTimeMs
        ? Math.max(0, Date.now() - input.reviewStartTimeMs)
        : input.reviewDurationMs;
      const assemblyResult = input.sharedStore instanceof SessionMemory
        ? await assembly.assembleAdaptive({
          sessionMemory: input.sharedStore,
          adapter: input.adapter,
          calibration: this.calibration,
          changedFiles: input.changedFiles,
          detailChangeReport: input.detailChangeReport ?? LegacyStructuredReportAdapter.findRawReport(phaseReports, 'Detail Change'),
          executionPlan,
          language: input.language,
          reviewDurationMs: actualReviewDurationMs,
          signal: input.signal,
          suppressedFindings: input.suppressedFindings,
          suppressedCount: suppressionResult.suppressedCount,
          telemetryEmitter: telemetry,
          request: input.request,
        })
        : {
          review: assembly.assemble({
            structuredReports: suppressionResult.filteredReports,
            changedFiles: input.changedFiles,
            detailChangeReport: input.detailChangeReport ?? LegacyStructuredReportAdapter.findRawReport(phaseReports, 'Detail Change'),
            language: input.language,
            reviewDurationMs: actualReviewDurationMs,
            suppressedFindings: input.suppressedFindings,
            suppressedCount: suppressionResult.suppressedCount,
          }),
          sectionWriterUsed: [] as string[],
          deterministicRendered: ['changed-files', 'summary', 'detail-change', 'flow', 'quality', 'improvements', 'todo', 'risks'],
        };
      const assemblyDurationMs = Date.now() - assemblyStart;
      const review = assemblyResult.review;
      const totalFindings = input.sharedStore instanceof SessionMemory
        ? input.sharedStore.getRenderableFindings().length
        : this.countStructuredFindings(suppressionResult.filteredReports);

      telemetry.emitAssemblyComplete({
        suppressedCount: suppressionResult.suppressedCount,
        sectionsRendered: 8,
        structureValid: assembly.validateReportStructure(review),
        durationMs: assemblyDurationMs,
      });
      telemetry.emitPipelineComplete({
        pipelineMode: 'adaptive',
        patchIntent: executionPlan?.patchIntent,
        riskFlags: executionPlan?.riskFlags,
        enabledAgents: executionPlan?.enabledAgents ?? input.phaseConfig.phase1.map((agent) => agent.role).concat('Observer'),
        disabledAgents: skippedAgents.map((item) => item.role),
        sectionWritersEnabled: {
          summary: assemblyResult.sectionWriterUsed.includes('summary'),
          improvements: assemblyResult.sectionWriterUsed.includes('improvements'),
        },
        phaseLatencies: {
          contextGatherer: contextGathererDurationMs,
          phase1Agents: phaseDurationMs,
          phase2Observer: 0,
          assembly: assemblyDurationMs,
        },
        tokenUsage: {
          totalInput: this.estimateTokens(review, input.adapter.getModel()),
          perAgent: Object.fromEntries(
            effectiveBudgets.map((budget) => [
              budget.agentRole,
              {
                allocated: budget.totalBudget,
                actual: agentTokenUsage[budget.agentRole] ?? 0,
              },
            ]),
          ),
          truncationEvents: [],
        },
        outputCompleteness: {
          sectionsRendered: 8,
          sectionWriterUsed: assemblyResult.sectionWriterUsed,
          deterministicRendered: assemblyResult.deterministicRendered,
          totalFindings,
        },
      });

      if (executionPlan) {
        input.request?.onLog?.(
          `[adaptive] patchIntent=${executionPlan.patchIntent} riskFlags=${JSON.stringify(executionPlan.riskFlags)} fallback=${executionPlan.fallbackPolicy} graph=${graphAvailability}`
        );
      } else if (contextGathererFailed) {
        input.request?.onLog?.('[adaptive] using static budget fallback path');
      }

      if (isDebugTelemetryEnabled()) {
        input.request?.onLog?.(`[adaptive] rendered report preview:\n${this.truncateLog(review, 800)}`);
      }

      return {
        review,
        intermediateData: {
          structuredReports,
          observerFindings: suppressionResult.filteredReports.find((report) => report.role === 'Observer')?.structured,
          suppressionResult,
        },
      };
    } catch (error) {
      if (error instanceof GenerationCancelledError) {
        throw error;
      }
      throw this.wrapError(error, 'adaptive-pipeline');
    } finally {
      this.calibration.setTruncationHandler(undefined);
    }
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

  private rebuildAdaptivePhaseConfig(
    phaseConfig: PhasedAgentConfig,
    budgetAllocations: AgentBudgetAllocation[],
  ): PhasedAgentConfig {
    const roleToBudget = new Map(budgetAllocations.map((budget) => [budget.agentRole, budget]));
    const promptBuilder = phaseConfig.promptBuilder as {
      buildCodeReviewerPrompt?: (context: AgentPromptBuildContext, budget: AgentBudgetAllocation) => AgentPrompt;
      buildFlowDiagramPrompt?: (context: AgentPromptBuildContext, budget: AgentBudgetAllocation) => AgentPrompt;
      buildSecurityAgentPrompt?: (context: AgentPromptBuildContext, budget: AgentBudgetAllocation) => AgentPrompt;
      buildDetailChangePrompt?: (context: AgentPromptBuildContext, budget: AgentBudgetAllocation) => AgentPrompt;
    };

    const rebuiltPhase1 = phaseConfig.phase1.map((agent) => {
      switch (agent.role) {
        case 'Code Reviewer':
          return promptBuilder.buildCodeReviewerPrompt?.(phaseConfig.buildContext, roleToBudget.get('Code Reviewer') ?? budgetAllocations[0]) ?? agent;
        case 'Flow Diagram':
          return promptBuilder.buildFlowDiagramPrompt?.(phaseConfig.buildContext, roleToBudget.get('Flow Diagram') ?? budgetAllocations[0]) ?? agent;
        case 'Security Analyst':
          return promptBuilder.buildSecurityAgentPrompt?.(phaseConfig.buildContext, roleToBudget.get('Security Analyst') ?? budgetAllocations[0]) ?? agent;
        case 'Detail Change': {
          const baseBudget = roleToBudget.get('Code Reviewer') ?? budgetAllocations[0];
          const detailBudget = { ...baseBudget, agentRole: 'Detail Change' };
          return promptBuilder.buildDetailChangePrompt?.(phaseConfig.buildContext, detailBudget) ?? agent;
        }
        default:
          return agent;
      }
    });

    return {
      ...phaseConfig,
      phase1: rebuiltPhase1,
      budgetAllocations,
    };
  }

  private determineGraphAvailability(
    changes: UnifiedDiffFile[],
    dependencyGraph?: AgentPromptBuildContext['dependencyGraph'],
  ): 'available' | 'unavailable' | 'partial' {
    if (!dependencyGraph) {
      return 'unavailable';
    }

    const expected = changes.filter((change) => !change.isBinary && !change.isDeleted).length;
    if (dependencyGraph.fileDependencies.size === 0) {
      return 'partial';
    }
    return dependencyGraph.fileDependencies.size >= expected ? 'available' : 'partial';
  }

  private wrapError(error: unknown, stage: string): Error {
    if (error instanceof GenerationCancelledError) { return error; }
    return error instanceof Error
      ? new Error(`[${stage}] ${error.message}`)
      : new Error(`[${stage}] ${String(error)}`);
  }

  private countStructuredFindings(reports: StructuredAgentReport[]): number {
    return reports.reduce((total, report) => {
      if (report.role === 'Code Reviewer') {
        return total + report.structured.issues.length;
      }
      if (report.role === 'Security Analyst') {
        return total + report.structured.vulnerabilities.filter((finding) => finding.confidence >= 0.5).length;
      }
      if (report.role === 'Observer') {
        return total + report.structured.risks.length;
      }
      return total;
    }, 0);
  }
}
