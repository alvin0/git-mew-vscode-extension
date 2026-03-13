import { ILLMAdapter } from "../../../llm-adapter";
import { ChunkAnalysis, ContextGenerationRequest, CoordinatorPromptInput, DiffChunk, UnifiedDiffFile } from "../contextTypes";
import { TokenEstimatorService } from "../TokenEstimatorService";
import { GenerationCancelledError } from "../ContextOrchestratorService";
import {
  ContextOrchestratorConfig,
  FAST_REDUCER_SYSTEM_PROMPT,
  FAST_WORKER_SYSTEM_PROMPT,
  REDUCER_SYSTEM_PROMPT,
  TaskExecutionProfile,
  WORKER_SYSTEM_PROMPT,
} from "./orchestratorTypes";

export class ChunkAnalysisReducer {
  constructor(
    private readonly config: ContextOrchestratorConfig,
    private readonly tokenEstimator: TokenEstimatorService
  ) {}

  estimateTokens(text: string, model?: string): number {
    return this.tokenEstimator.estimateTextTokens(text, model) + 32;
  }

  async processChunksInParallel(
    chunks: DiffChunk[],
    adapter: ILLMAdapter,
    taskLabel: string,
    signal?: AbortSignal,
    request?: ContextGenerationRequest,
    executionProfile?: TaskExecutionProfile
  ): Promise<ChunkAnalysis[]> {
    if (chunks.length === 0) { return []; }

    const results: ChunkAnalysis[] = new Array(chunks.length);
    let nextIndex = 0;
    let fatalError: Error | null = null;

    const runNext = async () => {
      while (!fatalError) {
        this.throwIfCancelled(signal);
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= chunks.length) { return; }

        try {
          const analysis = await this.analyzeChunk(
            chunks[currentIndex], adapter, taskLabel, signal, request, executionProfile
          );
          this.throwIfCancelled(signal);
          results[currentIndex] = analysis;
          this.reportProgress(request, `Analyzed chunk ${currentIndex + 1}/${chunks.length}...`);
        } catch (error) {
          fatalError = this.wrapError(error, "chunk-analysis");
          return;
        }
      }
    };

    const workerCount = Math.min(
      executionProfile?.concurrency ?? this.config.concurrency,
      chunks.length
    );
    await Promise.all(Array.from({ length: workerCount }, () => runNext()));
    this.throwIfCancelled(signal);
    if (fatalError) { throw fatalError; }
    return results.filter(Boolean);
  }

  private async analyzeChunk(
    chunk: DiffChunk,
    adapter: ILLMAdapter,
    taskLabel: string,
    signal?: AbortSignal,
    request?: ContextGenerationRequest,
    executionProfile?: TaskExecutionProfile
  ): Promise<ChunkAnalysis> {
    const prompt = this.buildChunkPrompt(chunk, taskLabel);
    this.reportLog(request, `[worker:${chunk.id}] reading ${this.describeChunk(chunk)}`);
    const response = await adapter.generateText(prompt, {
      systemMessage: this.getWorkerSystemPrompt(request),
      maxTokens: Math.min(executionProfile?.workerMaxTokens ?? 900, adapter.getMaxOutputTokens()),
      temperature: this.isDefaultTemperatureOnlyModel(adapter) ? undefined : 0,
    });
    this.throwIfCancelled(signal);
    this.reportLog(request, `[worker:${chunk.id}] api response\n${this.truncateLog(response.text)}`);
    return this.parseChunkAnalysis(response.text, chunk);
  }

  private buildChunkPrompt(chunk: DiffChunk, taskLabel: string): string {
    const fileList = Array.from(new Set(chunk.files.map((e) => e.file.relativePath)));
    const renderedChunk = chunk.files.map((entry) => {
      const labelSuffix = entry.segmentLabel ? ` (${entry.segmentLabel})` : "";
      if (entry.file.isBinary) {
        return `## ${entry.file.statusLabel}: ${entry.file.relativePath}${labelSuffix}\n\nBinary file change`;
      }
      return `## ${entry.file.statusLabel}: ${entry.file.relativePath}${labelSuffix}\n\n\`\`\`diff\n${entry.content}\n\`\`\``;
    }).join("\n\n");

    return `Task: ${taskLabel}\n\nChanged files:\n${fileList.map((f) => `- ${f}`).join("\n")}\n\nChunk content:\n${renderedChunk}`;
  }

  private parseChunkAnalysis(rawText: string, chunk: DiffChunk): ChunkAnalysis {
    const parsed = this.parseJsonLike(rawText);
    const fallbackFiles = Array.from(new Set(chunk.files.map((e) => e.file.relativePath)));
    return {
      files: this.normalizeStringArray(parsed?.files, fallbackFiles),
      intent: this.normalizeStringArray(parsed?.intent),
      risks: this.normalizeStringArray(parsed?.risks),
      breakingChanges: this.normalizeStringArray(parsed?.breakingChanges),
      testImpact: this.normalizeStringArray(parsed?.testImpact),
      notableSymbols: this.normalizeStringArray(parsed?.notableSymbols),
    };
  }

  async reduceAnalysesUntilFit(
    analyses: ChunkAnalysis[],
    adapter: ILLMAdapter,
    systemMessage: string,
    buildCoordinatorPrompt: (input: CoordinatorPromptInput) => string,
    changedFiles: UnifiedDiffFile[],
    signal?: AbortSignal,
    request?: ContextGenerationRequest,
    executionProfile?: TaskExecutionProfile,
    getBudgetProfile?: (contextWindow: number) => any
  ): Promise<ChunkAnalysis[]> {
    const budgetProfile = getBudgetProfile
      ? getBudgetProfile(adapter.getContextWindow())
      : { finalInputBudget: Math.floor(adapter.getContextWindow() * 0.35), reducerInputBudget: Math.floor(adapter.getContextWindow() * 0.2) };

    let currentAnalyses = analyses;
    while (true) {
      this.throwIfCancelled(signal);
      const coordinatorInput = this.buildCoordinatorPromptInput(
        currentAnalyses, changedFiles,
        Math.floor(budgetProfile.finalInputBudget * (executionProfile?.finalBudgetMultiplier ?? 1)),
        executionProfile
      );
      const estimatedTokens =
        this.estimateTokens(systemMessage, adapter.getModel()) +
        this.estimateTokens(buildCoordinatorPrompt(coordinatorInput), adapter.getModel());

      if (estimatedTokens <= budgetProfile.finalInputBudget || currentAnalyses.length <= 1) {
        return currentAnalyses;
      }
      this.reportProgress(request, `Reducing ${currentAnalyses.length} summaries for final merge...`);
      currentAnalyses = await this.reduceAnalysisBatch(
        currentAnalyses, adapter,
        Math.floor(budgetProfile.reducerInputBudget * (executionProfile?.reducerBudgetMultiplier ?? 1)),
        signal, request, executionProfile
      );
    }
  }

  buildCoordinatorPromptInput(
    analyses: ChunkAnalysis[],
    changedFiles: UnifiedDiffFile[],
    finalInputBudget: number,
    executionProfile?: TaskExecutionProfile
  ): CoordinatorPromptInput {
    const changedFilesBudget = Math.max(
      200,
      Math.floor(finalInputBudget * this.config.changedFilesBudgetRatio * (executionProfile?.changedFilesBudgetMultiplier ?? 1))
    );
    return {
      changedFiles,
      changedFilesSummary: this.renderChangedFiles(changedFiles, changedFilesBudget),
      analyses,
      analysesSummary: this.renderAnalyses(analyses),
    };
  }

  private async reduceAnalysisBatch(
    analyses: ChunkAnalysis[],
    adapter: ILLMAdapter,
    reducerInputBudget: number,
    signal?: AbortSignal,
    request?: ContextGenerationRequest,
    executionProfile?: TaskExecutionProfile
  ): Promise<ChunkAnalysis[]> {
    const groups = this.groupAnalysesForReduction(
      analyses,
      Math.max(1000, reducerInputBudget - this.config.reducerOverheadTokens),
      adapter.getModel()
    );

    const results: ChunkAnalysis[] = new Array(groups.length);
    let nextIndex = 0;
    let fatalError: Error | null = null;

    const runNext = async () => {
      while (!fatalError) {
        this.throwIfCancelled(signal);
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= groups.length) { return; }
        try {
          const group = groups[currentIndex];
          const batchLabel = this.describeAnalysisGroup(group);
          this.reportLog(request, `[reducer] reducing batch with ${group.length} summary item(s): ${batchLabel}`);
          const prompt = this.buildReducerPrompt(group);
          const response = await adapter.generateText(prompt, {
            systemMessage: this.getReducerSystemPrompt(request),
            maxTokens: Math.min(executionProfile?.reducerMaxTokens ?? 900, adapter.getMaxOutputTokens()),
            temperature: this.isDefaultTemperatureOnlyModel(adapter) ? undefined : 0,
          });
          this.throwIfCancelled(signal);
          this.reportLog(request, `[reducer] api response\n${this.truncateLog(response.text)}`);
          results[currentIndex] = this.parseReducedAnalysis(response.text, group);
          if (request) {
            this.reportProgress(request, `Reduced summary batch ${currentIndex + 1}/${groups.length}...`);
          }
        } catch (error) {
          fatalError = this.wrapError(error, "summary-reduction");
          return;
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(this.config.concurrency, groups.length) }, () => runNext()));
    this.throwIfCancelled(signal);
    if (fatalError) { throw fatalError; }
    return results.filter((item) => item !== undefined);
  }

  private groupAnalysesForReduction(analyses: ChunkAnalysis[], maxTokens: number, model?: string): ChunkAnalysis[][] {
    const groups: ChunkAnalysis[][] = [];
    let currentGroup: ChunkAnalysis[] = [];
    let currentTokens = 0;
    for (const analysis of analyses) {
      const summary = this.renderAnalysis(analysis);
      const summaryTokens = this.estimateTokens(summary, model);
      if (currentGroup.length > 0 && currentTokens + summaryTokens > maxTokens) {
        groups.push(currentGroup);
        currentGroup = [];
        currentTokens = 0;
      }
      currentGroup.push(analysis);
      currentTokens += summaryTokens;
    }
    if (currentGroup.length > 0) { groups.push(currentGroup); }
    return groups;
  }

  private buildReducerPrompt(analyses: ChunkAnalysis[]): string {
    return `Combine the following JSON-compatible summaries into one smaller summary:\n\n${this.renderAnalyses(analyses)}`;
  }

  private parseReducedAnalysis(rawText: string, fallbackAnalyses: ChunkAnalysis[]): ChunkAnalysis {
    const parsed = this.parseJsonLike(rawText);
    const fallbackFiles = Array.from(new Set(fallbackAnalyses.flatMap((a) => a.files)));
    return {
      files: this.normalizeStringArray(parsed?.files, fallbackFiles),
      intent: this.normalizeStringArray(parsed?.intent),
      risks: this.normalizeStringArray(parsed?.risks),
      breakingChanges: this.normalizeStringArray(parsed?.breakingChanges),
      testImpact: this.normalizeStringArray(parsed?.testImpact),
      notableSymbols: this.normalizeStringArray(parsed?.notableSymbols),
    };
  }

  renderChangedFiles(changedFiles: UnifiedDiffFile[], tokenBudget: number): string {
    if (changedFiles.length === 0) { return "None"; }
    const lines: string[] = [];
    let consumedTokens = 0;
    for (const file of changedFiles) {
      const line = `- ${file.relativePath} (${file.statusLabel.toLowerCase()})`;
      const lineTokens = this.estimateTokens(line);
      if (lines.length > 0 && consumedTokens + lineTokens > tokenBudget) { break; }
      lines.push(line);
      consumedTokens += lineTokens;
    }
    if (lines.length < changedFiles.length) {
      lines.push(`- ... and ${changedFiles.length - lines.length} more files`);
    }
    return lines.join("\n");
  }

  renderAnalyses(analyses: ChunkAnalysis[]): string {
    if (analyses.length === 0) { return "No chunk analysis available."; }
    return analyses.map((analysis, index) => `### Summary ${index + 1}\n${this.renderAnalysis(analysis)}`).join("\n\n");
  }

  private renderAnalysis(analysis: ChunkAnalysis): string {
    const renderList = (label: string, items: string[]) => {
      const body = items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None";
      return `${label}:\n${body}`;
    };
    return [
      renderList("Files", analysis.files),
      renderList("Intent", analysis.intent),
      renderList("Risks", analysis.risks),
      renderList("Breaking Changes", analysis.breakingChanges),
      renderList("Test Impact", analysis.testImpact),
      renderList("Notable Symbols", analysis.notableSymbols),
    ].join("\n");
  }

  private parseJsonLike(rawText: string): Record<string, unknown> | null {
    const trimmed = rawText.trim();
    const candidates = [trimmed, this.extractCodeBlock(trimmed), this.extractJsonObject(trimmed)]
      .filter((c): c is string => Boolean(c));
    for (const candidate of candidates) {
      try { return JSON.parse(candidate); } catch { continue; }
    }
    return null;
  }

  private extractCodeBlock(rawText: string): string | null {
    const match = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return match?.[1]?.trim() ?? null;
  }

  private extractJsonObject(rawText: string): string | null {
    const startIndex = rawText.indexOf("{");
    const endIndex = rawText.lastIndexOf("}");
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) { return null; }
    return rawText.slice(startIndex, endIndex + 1).trim();
  }

  normalizeStringArray(value: unknown, fallback: string[] = []): string[] {
    if (Array.isArray(value)) {
      return Array.from(new Set(
        value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      ));
    }
    if (typeof value === "string" && value.trim()) { return [value.trim()]; }
    return fallback;
  }

  private describeChunk(chunk: DiffChunk): string {
    const fileLabels = chunk.files.map((entry) =>
      entry.segmentLabel ? `${entry.file.relativePath} (${entry.segmentLabel})` : entry.file.relativePath
    );
    return Array.from(new Set(fileLabels)).join(", ");
  }

  private describeAnalysisGroup(analyses: ChunkAnalysis[]): string {
    const files = Array.from(new Set(analyses.flatMap((a) => a.files)));
    if (files.length === 0) { return "no file labels"; }
    const preview = files.slice(0, 6).join(", ");
    return files.length > 6 ? `${preview}, ...` : preview;
  }

  truncateLog(text: string, maxLength: number = 1600): string {
    const normalized = text.trim();
    if (normalized.length <= maxLength) { return normalized; }
    return `${normalized.slice(0, maxLength)}\n...[truncated ${normalized.length - maxLength} chars]`;
  }

  private getWorkerSystemPrompt(request?: ContextGenerationRequest): string {
    return request?.task.kind === "commit" || request?.task.speedProfile === "fast"
      ? FAST_WORKER_SYSTEM_PROMPT : WORKER_SYSTEM_PROMPT;
  }

  private getReducerSystemPrompt(request?: ContextGenerationRequest): string {
    return request?.task.kind === "commit" || request?.task.speedProfile === "fast"
      ? FAST_REDUCER_SYSTEM_PROMPT : REDUCER_SYSTEM_PROMPT;
  }

  private isDefaultTemperatureOnlyModel(adapter: ILLMAdapter): boolean {
    return adapter.getProvider() === "openai" && adapter.getModel().startsWith("gpt-5");
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
