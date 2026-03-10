import { GenerateOptions, ILLMAdapter } from "../../llm-adapter";
import {
  ChunkAnalysis,
  ContextGenerationRequest,
  ContextStrategy,
  CoordinatorPromptInput,
  DiffChunk,
  DiffChunkEntry,
  UnifiedDiffFile,
} from "./contextTypes";
import { TokenEstimatorService } from "./TokenEstimatorService";

type BudgetProfile = {
  contextWindow: number;
  directInputBudget: number;
  workerInputBudget: number;
  reducerInputBudget: number;
  finalInputBudget: number;
};

type TaskExecutionProfile = {
  concurrency: number;
  workerBudgetMultiplier: number;
  reducerBudgetMultiplier: number;
  finalBudgetMultiplier: number;
  changedFilesBudgetMultiplier: number;
  workerMaxTokens: number;
  reducerMaxTokens: number;
};

type ContextOrchestratorConfig = {
  concurrency: number;
  defaultContextWindow: number;
  directBudgetRatio: number;
  workerBudgetRatio: number;
  reducerBudgetRatio: number;
  finalBudgetRatio: number;
  changedFilesBudgetRatio: number;
  workerOverheadTokens: number;
  reducerOverheadTokens: number;
};

const DEFAULT_CONFIG: ContextOrchestratorConfig = {
  concurrency: 2,
  defaultContextWindow: 32768,
  directBudgetRatio: 0.55,
  workerBudgetRatio: 0.18,
  reducerBudgetRatio: 0.2,
  finalBudgetRatio: 0.35,
  changedFilesBudgetRatio: 0.2,
  workerOverheadTokens: 1200,
  reducerOverheadTokens: 900,
};

const WORKER_SYSTEM_PROMPT = `You summarize git diff chunks for a larger coordinator.

Return ONLY valid JSON.
Do not wrap the JSON in markdown fences.
Do not add commentary.
Use this exact shape:
{
  "files": ["path/to/file.ts"],
  "intent": ["short summary"],
  "risks": ["short risk"],
  "breakingChanges": ["short breaking change"],
  "testImpact": ["short testing impact"],
  "notableSymbols": ["SymbolName"]
}

Rules:
- Keep each array short and specific.
- Use empty arrays when there is nothing to report.
- Never include raw diff lines.
- "files" must contain relative file paths only.
- Max 4 items for intent/risks/breakingChanges/testImpact.
- Max 8 items for notableSymbols.`;

const REDUCER_SYSTEM_PROMPT = `You combine multiple git diff summaries into a smaller normalized JSON summary.

Return ONLY valid JSON with this exact shape:
{
  "files": ["path/to/file.ts"],
  "intent": ["short summary"],
  "risks": ["short risk"],
  "breakingChanges": ["short breaking change"],
  "testImpact": ["short testing impact"],
  "notableSymbols": ["SymbolName"]
}

Rules:
- Merge duplicate items.
- Keep the most important information only.
- Use empty arrays when needed.
- Never include markdown fences or commentary.`;

const FAST_WORKER_SYSTEM_PROMPT = `You summarize git diff chunks for fast commit generation.

Return ONLY valid JSON.
Do not wrap the JSON in markdown fences.
Use this exact shape:
{
  "files": ["path/to/file.ts"],
  "intent": ["short summary"],
  "risks": [],
  "breakingChanges": [],
  "testImpact": [],
  "notableSymbols": ["SymbolName"]
}

Rules:
- Keep output minimal and fast.
- Focus on the main intent of the changes.
- Use at most 2 intent items.
- Keep notableSymbols to the most important 4 items.
- Prefer empty arrays for risks, breakingChanges, and testImpact unless clearly necessary.`;

const FAST_REDUCER_SYSTEM_PROMPT = `You compress multiple diff summaries for fast commit generation.

Return ONLY valid JSON with this exact shape:
{
  "files": ["path/to/file.ts"],
  "intent": ["short summary"],
  "risks": [],
  "breakingChanges": [],
  "testImpact": [],
  "notableSymbols": ["SymbolName"]
}

Rules:
- Keep only the minimum information needed to write a good commit message.
- Merge duplicates aggressively.
- Prefer empty arrays for non-essential sections.`;

export class GenerationCancelledError extends Error {
  constructor(message: string = "Generation cancelled.") {
    super(message);
    this.name = "GenerationCancelledError";
  }
}

export class ContextOrchestratorService {
  private readonly config: ContextOrchestratorConfig;
  private readonly tokenEstimator: TokenEstimatorService;

  constructor(config: Partial<ContextOrchestratorConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.tokenEstimator = new TokenEstimatorService();
  }

  public estimateTokens(text: string, model?: string): number {
    return this.tokenEstimator.estimateTextTokens(text, model) + 32;
  }

  public getBudgetProfile(contextWindowOrModel: number | string): BudgetProfile {
    const contextWindow =
      typeof contextWindowOrModel === "number"
        ? contextWindowOrModel
        : this.config.defaultContextWindow;

    return {
      contextWindow,
      directInputBudget: Math.max(
        2400,
        Math.floor(contextWindow * this.config.directBudgetRatio)
      ),
      workerInputBudget: Math.max(
        1400,
        Math.floor(contextWindow * this.config.workerBudgetRatio)
      ),
      reducerInputBudget: Math.max(
        1400,
        Math.floor(contextWindow * this.config.reducerBudgetRatio)
      ),
      finalInputBudget: Math.max(
        2000,
        Math.floor(contextWindow * this.config.finalBudgetRatio)
      ),
    };
  }

  public resolveStrategy(
    strategy: ContextStrategy,
    contextWindow: number,
    model: string,
    systemMessage: string,
    prompt: string
  ): ContextStrategy {
    if (strategy !== "auto") {
      return strategy;
    }

    const budget = this.getBudgetProfile(contextWindow);
    const estimatedPrompt = this.estimateTokens(systemMessage, model) +
      this.estimateTokens(prompt, model);

    return estimatedPrompt <= budget.directInputBudget
      ? "direct"
      : "hierarchical";
  }

  public buildChunks(
    files: UnifiedDiffFile[],
    maxChunkTokens: number,
    model?: string
  ): DiffChunk[] {
    if (files.length === 0) {
      return [];
    }

    const chunkEntries = files.flatMap((file) =>
      this.splitFileIntoEntries(file, maxChunkTokens, model)
    );

    const chunks: DiffChunk[] = [];
    let currentEntries: DiffChunkEntry[] = [];
    let currentTokens = 0;
    let chunkIndex = 1;

    for (const entry of chunkEntries) {
      if (currentEntries.length > 0 && currentTokens + entry.estimatedTokens > maxChunkTokens) {
        chunks.push({
          id: `chunk-${chunkIndex++}`,
          files: currentEntries,
          estimatedTokens: currentTokens,
        });
        currentEntries = [];
        currentTokens = 0;
      }

      currentEntries.push(entry);
      currentTokens += entry.estimatedTokens;
    }

    if (currentEntries.length > 0) {
      chunks.push({
        id: `chunk-${chunkIndex}`,
        files: currentEntries,
        estimatedTokens: currentTokens,
      });
    }

    return chunks;
  }

  public async generate(request: ContextGenerationRequest): Promise<string> {
    this.throwIfCancelled(request.signal);
    this.reportProgress(request, "Preparing diff context...");
    this.reportLog(
      request,
      `[context] preparing ${request.changes.length} changed file(s) for ${request.task.label}`
    );
    const executionProfile = this.getExecutionProfile(request);

    const effectiveStrategy = this.resolveStrategy(
      request.strategy,
      request.adapter.getContextWindow(),
      request.adapter.getModel(),
      request.task.systemMessage,
      request.task.directPrompt
    );

    if (effectiveStrategy === "direct") {
      this.reportProgress(request, "Sending request to model...");
      this.reportLog(
        request,
        `[strategy] using direct mode for ${request.task.label}`
      );
      return this.generateFinalText(
        request.adapter,
        request.task.systemMessage,
        request.task.directPrompt,
        request.signal,
        request,
        "direct-final"
      );
    }

    const budgets = this.getBudgetProfile(request.adapter.getContextWindow());
    const workerPayloadBudget = Math.max(
      900,
      Math.floor(
        budgets.workerInputBudget * executionProfile.workerBudgetMultiplier
      ) - this.config.workerOverheadTokens
    );

    const chunks = this.buildChunks(
      request.changes,
      workerPayloadBudget,
      request.adapter.getModel()
    );
    this.reportProgress(
      request,
      `Split changes into ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}.`
    );
    this.reportLog(
      request,
      `[strategy] using hierarchical mode with ${chunks.length} chunk(s)`
    );
    const analyses = await this.processChunksInParallel(
      chunks,
      request.adapter,
      request.task.label,
      request.signal,
      request,
      executionProfile
    );

    this.reportProgress(request, "Reducing chunk summaries...");
    const reducedAnalyses = await this.reduceAnalysesUntilFit(
      analyses,
      request.adapter,
      request.task.systemMessage,
      request.task.buildCoordinatorPrompt,
      request.changes,
      request.signal,
      request,
      executionProfile
    );

    const coordinatorInput = this.buildCoordinatorPromptInput(
      reducedAnalyses,
      request.changes,
      Math.floor(
        budgets.finalInputBudget * executionProfile.finalBudgetMultiplier
      ),
      executionProfile
    );

    const coordinatorPrompt = request.task.buildCoordinatorPrompt(
      coordinatorInput
    );

    this.reportProgress(request, "Generating final response...");
    this.reportLog(
      request,
      `[coordinator] synthesizing final ${request.task.label} response from ${reducedAnalyses.length} summary block(s)`
    );
    return this.generateFinalText(
      request.adapter,
      request.task.systemMessage,
      coordinatorPrompt,
      request.signal,
      request,
      "coordinator-final"
    );
  }

  private splitFileIntoEntries(
    file: UnifiedDiffFile,
    maxChunkTokens: number,
    model?: string
  ): DiffChunkEntry[] {
    const fullEntry = this.createEntry(file, file.diff, undefined, model);
    if (file.isBinary || fullEntry.estimatedTokens <= maxChunkTokens) {
      return [fullEntry];
    }

    const { header, hunks } = this.extractDiffHeaderAndHunks(file.diff);
    if (hunks.length === 0) {
      return this.splitTextIntoEntries(
        file,
        file.diff,
        maxChunkTokens,
        "part",
        model
      );
    }

    const entries: DiffChunkEntry[] = [];
    let partIndex = 1;
    const normalizedHeader = header ? `${header}\n` : "";

    for (const hunk of hunks) {
      const hunkContent = `${normalizedHeader}${hunk}`.trimEnd();
      const hunkEntry = this.createEntry(
        file,
        hunkContent,
        `hunk-${partIndex}`,
        model
      );
      if (hunkEntry.estimatedTokens <= maxChunkTokens) {
        entries.push(hunkEntry);
        partIndex += 1;
        continue;
      }

      const splitEntries = this.splitHunkIntoEntries(
        file,
        normalizedHeader,
        hunk,
        maxChunkTokens,
        partIndex,
        model
      );
      entries.push(...splitEntries);
      partIndex += splitEntries.length;
    }

    return entries;
  }

  private splitTextIntoEntries(
    file: UnifiedDiffFile,
    text: string,
    maxChunkTokens: number,
    labelPrefix: string,
    model?: string
  ): DiffChunkEntry[] {
    const maxChars = Math.max(400, (maxChunkTokens - 64) * 4);
    const lines = text.split("\n");
    const segments: DiffChunkEntry[] = [];
    let currentLines: string[] = [];
    let partIndex = 1;

    const flush = () => {
      if (currentLines.length === 0) {
        return;
      }

      const content = currentLines.join("\n").trimEnd();
      segments.push(
        this.createEntry(file, content, `${labelPrefix}-${partIndex++}`, model)
      );
      currentLines = [];
    };

    for (const line of lines) {
      const nextText = [...currentLines, line].join("\n");
      if (this.estimateTokens(nextText, model) > maxChunkTokens || nextText.length > maxChars) {
        flush();
      }

      currentLines.push(line);
    }

    flush();
    return segments;
  }

  private splitHunkIntoEntries(
    file: UnifiedDiffFile,
    header: string,
    hunk: string,
    maxChunkTokens: number,
    startIndex: number,
    model?: string
  ): DiffChunkEntry[] {
    const lines = hunk.split("\n");
    const hunkHeader = lines[0] ?? "";
    const bodyLines = lines.slice(1);
    const entries: DiffChunkEntry[] = [];
    const maxChars = Math.max(
      400,
      (maxChunkTokens - this.estimateTokens(header, model) - 64) * 4
    );
    let currentLines: string[] = [];
    let partIndex = startIndex;

    const flush = () => {
      if (currentLines.length === 0) {
        return;
      }

      const content = `${header}${hunkHeader}\n${currentLines.join("\n")}`.trimEnd();
      entries.push(
        this.createEntry(file, content, `segment-${partIndex++}`, model)
      );
      currentLines = [];
    };

    for (const line of bodyLines) {
      const nextLines = [...currentLines, line];
      const nextContent = `${header}${hunkHeader}\n${nextLines.join("\n")}`.trimEnd();
      if (
        this.estimateTokens(nextContent, model) > maxChunkTokens ||
        nextContent.length > maxChars
      ) {
        flush();
      }

      currentLines.push(line);
    }

    flush();
    return entries;
  }

  private extractDiffHeaderAndHunks(diff: string): {
    header: string;
    hunks: string[];
  } {
    const lines = diff.split("\n");
    const headerLines: string[] = [];
    const hunks: string[] = [];
    let currentHunk: string[] = [];
    let inHunk = false;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        if (currentHunk.length > 0) {
          hunks.push(currentHunk.join("\n"));
          currentHunk = [];
        }
        inHunk = true;
      }

      if (inHunk) {
        currentHunk.push(line);
      } else {
        headerLines.push(line);
      }
    }

    if (currentHunk.length > 0) {
      hunks.push(currentHunk.join("\n"));
    }

    return {
      header: headerLines.join("\n").trimEnd(),
      hunks,
    };
  }

  private createEntry(
    file: UnifiedDiffFile,
    content: string,
    segmentLabel?: string,
    model?: string
  ): DiffChunkEntry {
    return {
      file,
      content,
      segmentLabel,
      estimatedTokens: this.estimateTokens(content, model) + 32,
    };
  }

  private async processChunksInParallel(
    chunks: DiffChunk[],
    adapter: ILLMAdapter,
    taskLabel: string,
    signal?: AbortSignal,
    request?: ContextGenerationRequest,
    executionProfile?: TaskExecutionProfile
  ): Promise<ChunkAnalysis[]> {
    if (chunks.length === 0) {
      return [];
    }

    const results: ChunkAnalysis[] = new Array(chunks.length);
    let nextIndex = 0;
    let fatalError: Error | null = null;

    const runNext = async () => {
      while (!fatalError) {
        this.throwIfCancelled(signal);

        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= chunks.length) {
          return;
        }

        try {
          const analysis = await this.analyzeChunk(
            chunks[currentIndex],
            adapter,
            taskLabel,
            signal,
            request,
            executionProfile
          );
          this.throwIfCancelled(signal);
          results[currentIndex] = analysis;
          this.reportProgress(
            request,
            `Analyzed chunk ${currentIndex + 1}/${chunks.length}...`
          );
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
    await Promise.all(
      Array.from({ length: workerCount }, () => runNext())
    );

    this.throwIfCancelled(signal);

    if (fatalError) {
      throw fatalError;
    }

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
    this.reportLog(
      request,
      `[worker:${chunk.id}] reading ${this.describeChunk(chunk)}`
    );
    const response = await adapter.generateText(
      prompt,
      this.buildStructuredGenerateOptions(adapter, {
        systemMessage: this.getWorkerSystemPrompt(request),
        maxTokens: Math.min(
          executionProfile?.workerMaxTokens ?? 900,
          adapter.getMaxOutputTokens()
        ),
      })
    );

    this.throwIfCancelled(signal);
    this.reportLog(
      request,
      `[worker:${chunk.id}] api response\n${this.truncateLog(response.text)}`
    );

    return this.parseChunkAnalysis(response.text, chunk);
  }

  private buildChunkPrompt(chunk: DiffChunk, taskLabel: string): string {
    const fileList = Array.from(
      new Set(chunk.files.map((entry) => entry.file.relativePath))
    );
    const renderedChunk = chunk.files
      .map((entry) => {
        const labelSuffix = entry.segmentLabel
          ? ` (${entry.segmentLabel})`
          : "";
        if (entry.file.isBinary) {
          return `## ${entry.file.statusLabel}: ${entry.file.relativePath}${labelSuffix}\n\nBinary file change`;
        }

        return `## ${entry.file.statusLabel}: ${entry.file.relativePath}${labelSuffix}\n\n\`\`\`diff\n${entry.content}\n\`\`\``;
      })
      .join("\n\n");

    return `Task: ${taskLabel}

Changed files:
${fileList.map((filePath) => `- ${filePath}`).join("\n")}

Chunk content:
${renderedChunk}`;
  }

  private parseChunkAnalysis(
    rawText: string,
    chunk: DiffChunk
  ): ChunkAnalysis {
    const parsed = this.parseJsonLike(rawText);
    const fallbackFiles = Array.from(
      new Set(chunk.files.map((entry) => entry.file.relativePath))
    );

    return {
      files: this.normalizeStringArray(parsed?.files, fallbackFiles),
      intent: this.normalizeStringArray(parsed?.intent),
      risks: this.normalizeStringArray(parsed?.risks),
      breakingChanges: this.normalizeStringArray(parsed?.breakingChanges),
      testImpact: this.normalizeStringArray(parsed?.testImpact),
      notableSymbols: this.normalizeStringArray(parsed?.notableSymbols),
    };
  }

  private async reduceAnalysesUntilFit(
    analyses: ChunkAnalysis[],
    adapter: ILLMAdapter,
    systemMessage: string,
    buildCoordinatorPrompt: (input: CoordinatorPromptInput) => string,
    changedFiles: UnifiedDiffFile[],
    signal?: AbortSignal,
    request?: ContextGenerationRequest,
    executionProfile?: TaskExecutionProfile
  ): Promise<ChunkAnalysis[]> {
    const budgetProfile = this.getBudgetProfile(adapter.getContextWindow());
    let currentAnalyses = analyses;

    while (true) {
      this.throwIfCancelled(signal);

      const coordinatorInput = this.buildCoordinatorPromptInput(
        currentAnalyses,
        changedFiles,
        Math.floor(
          budgetProfile.finalInputBudget *
            (executionProfile?.finalBudgetMultiplier ?? 1)
        ),
        executionProfile
      );

      const estimatedTokens = this.estimateTokens(
        systemMessage,
        adapter.getModel()
      ) +
        this.estimateTokens(
          buildCoordinatorPrompt(coordinatorInput),
          adapter.getModel()
        );

      if (
        estimatedTokens <= budgetProfile.finalInputBudget ||
        currentAnalyses.length <= 1
      ) {
        return currentAnalyses;
      }

      this.reportProgress(
        request,
        `Reducing ${currentAnalyses.length} summaries for final merge...`
      );
      currentAnalyses = await this.reduceAnalysisBatch(
        currentAnalyses,
        adapter,
        Math.floor(
          budgetProfile.reducerInputBudget *
            (executionProfile?.reducerBudgetMultiplier ?? 1)
        ),
        signal,
        request,
        executionProfile
      );
    }
  }

  private buildCoordinatorPromptInput(
    analyses: ChunkAnalysis[],
    changedFiles: UnifiedDiffFile[],
    finalInputBudget: number,
    executionProfile?: TaskExecutionProfile
  ): CoordinatorPromptInput {
    const changedFilesBudget = Math.max(
      200,
      Math.floor(
        finalInputBudget *
          this.config.changedFilesBudgetRatio *
          (executionProfile?.changedFilesBudgetMultiplier ?? 1)
      )
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

    const reduced = await this.processGenericInParallel(groups, async (group) => {
      const batchLabel = this.describeAnalysisGroup(group);
      this.reportLog(
        request,
        `[reducer] reducing batch with ${group.length} summary item(s): ${batchLabel}`
      );
      const prompt = this.buildReducerPrompt(group);
      const response = await adapter.generateText(
        prompt,
        this.buildStructuredGenerateOptions(adapter, {
          systemMessage: this.getReducerSystemPrompt(request),
          maxTokens: Math.min(
            executionProfile?.reducerMaxTokens ?? 900,
            adapter.getMaxOutputTokens()
          ),
        })
      );

      this.throwIfCancelled(signal);
      this.reportLog(
        request,
        `[reducer] api response\n${this.truncateLog(response.text)}`
      );

      return this.parseReducedAnalysis(response.text, group);
    }, signal, "summary-reduction", request, (index) =>
      `Reduced summary batch ${index + 1}/${groups.length}...`
    );

    return reduced;
  }

  private groupAnalysesForReduction(
    analyses: ChunkAnalysis[],
    maxTokens: number,
    model?: string
  ): ChunkAnalysis[][] {
    const groups: ChunkAnalysis[][] = [];
    let currentGroup: ChunkAnalysis[] = [];
    let currentTokens = 0;

    for (const analysis of analyses) {
      const summary = this.renderAnalysis(analysis);
      const summaryTokens = this.estimateTokens(summary, model);

      if (
        currentGroup.length > 0 &&
        currentTokens + summaryTokens > maxTokens
      ) {
        groups.push(currentGroup);
        currentGroup = [];
        currentTokens = 0;
      }

      currentGroup.push(analysis);
      currentTokens += summaryTokens;
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  private buildReducerPrompt(analyses: ChunkAnalysis[]): string {
    return `Combine the following JSON-compatible summaries into one smaller summary:

${this.renderAnalyses(analyses)}`;
  }

  private parseReducedAnalysis(
    rawText: string,
    fallbackAnalyses: ChunkAnalysis[]
  ): ChunkAnalysis {
    const parsed = this.parseJsonLike(rawText);
    const fallbackFiles = Array.from(
      new Set(fallbackAnalyses.flatMap((analysis) => analysis.files))
    );

    return {
      files: this.normalizeStringArray(parsed?.files, fallbackFiles),
      intent: this.normalizeStringArray(parsed?.intent),
      risks: this.normalizeStringArray(parsed?.risks),
      breakingChanges: this.normalizeStringArray(parsed?.breakingChanges),
      testImpact: this.normalizeStringArray(parsed?.testImpact),
      notableSymbols: this.normalizeStringArray(parsed?.notableSymbols),
    };
  }

  private async generateFinalText(
    adapter: ILLMAdapter,
    systemMessage: string,
    prompt: string,
    signal?: AbortSignal,
    request?: ContextGenerationRequest,
    stageLabel: string = "final"
  ): Promise<string> {
    this.reportLog(
      request,
      `[${stageLabel}] sending final request to ${adapter.getProvider()}/${adapter.getModel()}`
    );
    const response = await adapter.generateText(
      prompt,
      this.buildGenerateOptions(adapter, {
        systemMessage,
        maxTokens: adapter.getMaxOutputTokens(),
      })
    );

    this.throwIfCancelled(signal);
    this.reportLog(
      request,
      `[${stageLabel}] api response\n${this.truncateLog(response.text)}`
    );
    return response.text.trim();
  }

  private buildGenerateOptions(
    adapter: ILLMAdapter,
    options: GenerateOptions
  ): GenerateOptions {
    if (
      adapter.getProvider() === "openai" &&
      adapter.getModel().startsWith("gpt-5")
    ) {
      return {
        ...options,
        reasoning: {
          effort: "low",
        },
        // text: { verbosity: "low" },
      };
    }

    return options;
  }

  private buildStructuredGenerateOptions(
    adapter: ILLMAdapter,
    options: GenerateOptions
  ): GenerateOptions {
    const structuredOptions: GenerateOptions = {
      ...options,
    };

    if (!this.isDefaultTemperatureOnlyModel(adapter)) {
      structuredOptions.temperature = 0;
    }

    return this.buildGenerateOptions(adapter, structuredOptions);
  }

  private isDefaultTemperatureOnlyModel(adapter: ILLMAdapter): boolean {
    return (
      adapter.getProvider() === "openai" &&
      adapter.getModel().startsWith("gpt-5")
    );
  }

  private renderChangedFiles(
    changedFiles: UnifiedDiffFile[],
    tokenBudget: number
  ): string {
    if (changedFiles.length === 0) {
      return "None";
    }

    const lines: string[] = [];
    let consumedTokens = 0;

    for (const file of changedFiles) {
      const line = `- ${file.relativePath} (${file.statusLabel.toLowerCase()})`;
      const lineTokens = this.estimateTokens(line);

      if (lines.length > 0 && consumedTokens + lineTokens > tokenBudget) {
        break;
      }

      lines.push(line);
      consumedTokens += lineTokens;
    }

    if (lines.length < changedFiles.length) {
      lines.push(`- ... and ${changedFiles.length - lines.length} more files`);
    }

    return lines.join("\n");
  }

  private renderAnalyses(analyses: ChunkAnalysis[]): string {
    if (analyses.length === 0) {
      return "No chunk analysis available.";
    }

    return analyses
      .map((analysis, index) => `### Summary ${index + 1}\n${this.renderAnalysis(analysis)}`)
      .join("\n\n");
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
    const candidates = [
      trimmed,
      this.extractCodeBlock(trimmed),
      this.extractJsonObject(trimmed),
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        continue;
      }
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
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return null;
    }

    return rawText.slice(startIndex, endIndex + 1).trim();
  }

  private normalizeStringArray(
    value: unknown,
    fallback: string[] = []
  ): string[] {
    if (Array.isArray(value)) {
      return Array.from(
        new Set(
          value
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
        )
      );
    }

    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }

    return fallback;
  }

  private async processGenericInParallel<TInput, TResult>(
    inputs: TInput[],
    worker: (input: TInput) => Promise<TResult>,
    signal: AbortSignal | undefined,
    stage: string,
    request?: ContextGenerationRequest,
    progressMessage?: (index: number) => string
  ): Promise<TResult[]> {
    const results: TResult[] = new Array(inputs.length);
    let nextIndex = 0;
    let fatalError: Error | null = null;

    const runNext = async () => {
      while (!fatalError) {
        this.throwIfCancelled(signal);

        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= inputs.length) {
          return;
        }

        try {
          results[currentIndex] = await worker(inputs[currentIndex]);
          this.throwIfCancelled(signal);
          if (progressMessage) {
            this.reportProgress(request, progressMessage(currentIndex));
          }
        } catch (error) {
          fatalError = this.wrapError(error, stage);
          return;
        }
      }
    };

    const workerCount = Math.min(this.config.concurrency, inputs.length);
    await Promise.all(
      Array.from({ length: workerCount }, () => runNext())
    );

    this.throwIfCancelled(signal);

    if (fatalError) {
      throw fatalError;
    }

    return results.filter((item) => item !== undefined);
  }

  private throwIfCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new GenerationCancelledError();
    }
  }

  private reportProgress(
    request: ContextGenerationRequest | undefined,
    message: string
  ): void {
    request?.onProgress?.(message);
  }

  private reportLog(
    request: ContextGenerationRequest | undefined,
    message: string
  ): void {
    request?.onLog?.(message);
  }

  private describeChunk(chunk: DiffChunk): string {
    const fileLabels = chunk.files.map((entry) => {
      return entry.segmentLabel
        ? `${entry.file.relativePath} (${entry.segmentLabel})`
        : entry.file.relativePath;
    });

    return Array.from(new Set(fileLabels)).join(", ");
  }

  private describeAnalysisGroup(analyses: ChunkAnalysis[]): string {
    const files = Array.from(
      new Set(analyses.flatMap((analysis) => analysis.files))
    );

    if (files.length === 0) {
      return "no file labels";
    }

    const preview = files.slice(0, 6).join(", ");
    return files.length > 6 ? `${preview}, ...` : preview;
  }

  private truncateLog(text: string, maxLength: number = 1600): string {
    const normalized = text.trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength)}\n...[truncated ${normalized.length - maxLength} chars]`;
  }

  private getExecutionProfile(
    request: ContextGenerationRequest
  ): TaskExecutionProfile {
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

  private getWorkerSystemPrompt(
    request?: ContextGenerationRequest
  ): string {
    return request?.task.kind === "commit" || request?.task.speedProfile === "fast"
      ? FAST_WORKER_SYSTEM_PROMPT
      : WORKER_SYSTEM_PROMPT;
  }

  private getReducerSystemPrompt(
    request?: ContextGenerationRequest
  ): string {
    return request?.task.kind === "commit" || request?.task.speedProfile === "fast"
      ? FAST_REDUCER_SYSTEM_PROMPT
      : REDUCER_SYSTEM_PROMPT;
  }

  private wrapError(error: unknown, stage: string): Error {
    if (error instanceof GenerationCancelledError) {
      return error;
    }

    return error instanceof Error
      ? new Error(`[${stage}] ${error.message}`)
      : new Error(`[${stage}] ${String(error)}`);
  }
}
