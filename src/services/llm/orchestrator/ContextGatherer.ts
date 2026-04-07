import { ILLMAdapter } from '../../../llm-adapter';
import { LlmRequestLogEntry, UnifiedDiffFile } from '../contextTypes';
import { TokenEstimatorService } from '../TokenEstimatorService';
import { DEFAULT_BUDGET_CONFIG } from './ContextBudgetManager';
import { DependencyGraphData } from './orchestratorTypes';
import { ExecutionPlan, PatchIntent, RiskFlags } from './executionPlanTypes';
import { AdapterCalibrationService } from './AdapterCalibrationService';
import { DependencyGraphIndex } from './DependencyGraphIndex';

export interface ContextGathererInput {
  changes: UnifiedDiffFile[];
  diffText: string;
  dependencyGraph?: DependencyGraphData;
  diffTokens: number;
  contextWindow: number;
  /** LLM adapter for semantic analysis. When provided, Context Gatherer uses
   *  an LLM call to understand the patch instead of heuristics alone. */
  adapter?: ILLMAdapter;
  calibration?: AdapterCalibrationService;
  signal?: AbortSignal;
  onLog?: (message: string) => void;
  onLlmLog?: (entry: LlmRequestLogEntry) => void;
}

/** Per-agent briefing produced by the LLM Context Gatherer.
 *  Injected into each agent's prompt so it starts with semantic understanding
 *  of the patch instead of parsing raw diff from scratch. */
export interface AgentBriefing {
  role: string;
  /** Targeted summary of what this agent should focus on. */
  focusSummary: string;
  /** Key files this agent should prioritize. */
  keyFiles: string[];
  /** Specific risks or areas of concern for this agent's domain. */
  concerns: string[];
}

export interface ContextGathererResult {
  plan: ExecutionPlan;
  /** Per-agent briefings from LLM analysis. Empty when LLM unavailable. */
  agentBriefings: AgentBriefing[];
  /** High-level patch summary for Session Memory seeding. */
  patchSummary: string;
  debugTrace?: ContextGathererDebugTrace;
}

export interface ContextGathererDebugTrace {
  patchSize: 'small' | 'medium' | 'large';
  additions: number;
  deletions: number;
  newFiles: number;
  renamedFiles: number;
  topLevelDirectories: string[];
  graphAvailability: 'available' | 'unavailable' | 'partial';
  securitySignals: string[];
  apiContractSignals: string[];
  llmUsed: boolean;
  llmTokens?: number;
  llmDurationMs?: number;
}

/** LLM response schema for Context Gatherer analysis. */
interface LLMAnalysisResponse {
  patchIntent: PatchIntent;
  riskFlags: RiskFlags;
  patchSummary: string;
  focusAreas: string[];
  enabledAgents: string[];
  disabledAgents: Array<{ role: string; reason: string }>;
  agentBriefings: Array<{
    role: string;
    focusSummary: string;
    keyFiles: string[];
    concerns: string[];
  }>;
}

const DEFAULT_ENABLED_AGENTS = [
  'Code Reviewer',
  'Flow Diagram',
  'Detail Change',
  'Security Analyst',
  'Observer',
];

const SECURITY_PATTERNS = /(auth|crypto|token|secret|password|session|permission|\.env)/i;
const SECURITY_KEYWORDS = /(apiKey|jwt|hash|encrypt)/i;
const API_CONTRACT_PATTERN =
  /^[+-]\s*export\s+(interface|type|class|enum|function|async function|const\s+\w+\s*=\s*\()/m;

export class ContextGatherer {
  private lastDebugTrace?: ContextGathererDebugTrace;

  constructor(
    private readonly tokenEstimator: TokenEstimatorService,
    private readonly defaultBudgetRatios: Record<string, number> = DEFAULT_BUDGET_CONFIG.agentBudgetRatios,
  ) {}

  /**
   * Analyze the patch and produce an ExecutionPlan + agent briefings.
   *
   * When an LLM adapter is provided, the gatherer sends the diff and dependency
   * graph to the model for semantic understanding. The LLM decides patch intent,
   * risk flags, which agents to enable, and writes a targeted briefing for each
   * agent so they start with context instead of parsing raw diff from scratch.
   *
   * Falls back to heuristic-only analysis when the LLM call fails or no adapter
   * is provided.
   */
  async analyze(input: ContextGathererInput): Promise<ContextGathererResult> {
    // Always run heuristics first — they're fast and provide fallback values.
    const heuristic = this.heuristicAnalysis(input);

    if (!input.adapter || !input.calibration) {
      return {
        plan: heuristic.plan,
        agentBriefings: [],
        patchSummary: '',
        debugTrace: heuristic.trace,
      };
    }

    try {
      const llmResult = await this.llmAnalysis(input, heuristic);
      return llmResult;
    } catch (error) {
      input.onLog?.(`[context-gatherer] LLM analysis failed, using heuristic fallback: ${error}`);
      return {
        plan: heuristic.plan,
        agentBriefings: [],
        patchSummary: '',
        debugTrace: { ...heuristic.trace, llmUsed: false },
      };
    }
  }

  /** Synchronous heuristic-only analysis (original behavior). */
  analyzeSync(input: ContextGathererInput): ExecutionPlan {
    return this.heuristicAnalysis(input).plan;
  }

  getLastDebugTrace(): ContextGathererDebugTrace | undefined {
    return this.lastDebugTrace;
  }

  // ── LLM-powered analysis ──────────────────────────────────────────────

  private async llmAnalysis(
    input: ContextGathererInput,
    heuristic: { plan: ExecutionPlan; trace: ContextGathererDebugTrace },
  ): Promise<ContextGathererResult> {
    const adapter = input.adapter!;
    const calibration = input.calibration!;

    if (input.signal?.aborted) {
      throw new Error('cancelled');
    }

    const prompt = this.buildLLMPrompt(input, heuristic.plan);
    const systemMessage = CONTEXT_GATHERER_SYSTEM_PROMPT;

    const safePrompt = calibration.safeTruncatePrompt(
      prompt,
      systemMessage,
      adapter,
      undefined,
      'Context Gatherer',
    );

    const startTime = Date.now();
    const gathererReqId = `context-gatherer-${Date.now()}`;
    input.onLlmLog?.({
      requestId: gathererReqId,
      stage: 'context-gatherer',
      provider: adapter.getProvider(),
      model: adapter.getModel(),
      status: 'pending',
      systemMessage,
      prompt: safePrompt,
      promptTokens: this.tokenEstimator.estimateTextTokens(safePrompt) + this.tokenEstimator.estimateTextTokens(systemMessage),
      timestamp: new Date().toISOString(),
    });
    const response = await calibration.generateTextWithAutoRetry(
      safePrompt,
      systemMessage,
      { systemMessage, maxTokens: adapter.getMaxOutputTokens() },
      adapter,
      undefined,
      'Context Gatherer',
    );
    const durationMs = Date.now() - startTime;

    if (input.signal?.aborted) {
      throw new Error('cancelled');
    }

    const totalTokens = response.totalTokens
      ?? ((response.promptTokens ?? 0) + (response.completionTokens ?? 0));
    input.onLog?.(`[context-gatherer] LLM analysis completed in ${durationMs}ms, tokens=${totalTokens}`);

    input.onLlmLog?.({
      requestId: gathererReqId,
      stage: 'context-gatherer',
      provider: adapter.getProvider(),
      model: adapter.getModel(),
      status: 'completed',
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

    const parsed = this.parseLLMResponse(response.text, heuristic.plan);

    const trace: ContextGathererDebugTrace = {
      ...heuristic.trace,
      llmUsed: true,
      llmTokens: totalTokens,
      llmDurationMs: durationMs,
    };
    this.lastDebugTrace = trace;

    return {
      plan: parsed.plan,
      agentBriefings: parsed.agentBriefings,
      patchSummary: parsed.patchSummary,
      debugTrace: trace,
    };
  }

  private buildLLMPrompt(
    input: ContextGathererInput,
    heuristicPlan: ExecutionPlan,
  ): string {
    const sections: string[] = [];

    // 1. Changed files overview
    const fileList = input.changes
      .map((f) => `- ${f.relativePath} (${f.statusLabel})`)
      .join('\n');
    sections.push(`## Changed Files (${input.changes.length} files)\n${fileList}`);

    // 2. Dependency graph summary (if available)
    if (input.dependencyGraph) {
      sections.push(
        DependencyGraphIndex.serializeForPrompt(input.dependencyGraph, 'critical-paths'),
      );
    }

    // 3. Diff — use full diff, let safeTruncatePrompt handle context window limits
    sections.push(`## Diff\n${input.diffText}`);

    // 4. Heuristic pre-analysis for LLM to refine
    sections.push(
      `## Heuristic Pre-Analysis (refine or override these)\n` +
      `- patchSize: ${heuristicPlan.patchSize}\n` +
      `- patchIntent: ${heuristicPlan.patchIntent}\n` +
      `- riskFlags: ${JSON.stringify(heuristicPlan.riskFlags)}\n` +
      `- securitySignals: ${this.lastDebugTrace?.securitySignals?.join(', ') || 'none'}\n` +
      `- apiContractSignals: ${this.lastDebugTrace?.apiContractSignals?.length ?? 0} detected`,
    );

    // 5. Available agents
    sections.push(
      `## Available Agents\n` +
      DEFAULT_ENABLED_AGENTS.map((role) => `- ${role}`).join('\n'),
    );

    sections.push(LLM_RESPONSE_SCHEMA_INSTRUCTION);

    return sections.join('\n\n');
  }

  private parseLLMResponse(
    text: string,
    fallbackPlan: ExecutionPlan,
  ): { plan: ExecutionPlan; agentBriefings: AgentBriefing[]; patchSummary: string } {
    const json = this.extractJson(text);
    if (!json) {
      return { plan: fallbackPlan, agentBriefings: [], patchSummary: '' };
    }

    try {
      const parsed = JSON.parse(json) as Partial<LLMAnalysisResponse>;

      const patchIntent = this.validatePatchIntent(parsed.patchIntent) ?? fallbackPlan.patchIntent;
      const riskFlags = this.validateRiskFlags(parsed.riskFlags) ?? fallbackPlan.riskFlags;
      const enabledAgents = Array.isArray(parsed.enabledAgents) && parsed.enabledAgents.length > 0
        ? parsed.enabledAgents.filter((a) => DEFAULT_ENABLED_AGENTS.includes(a))
        : fallbackPlan.enabledAgents;
      const disabledAgents = Array.isArray(parsed.disabledAgents)
        ? parsed.disabledAgents.filter((d) => d.role && d.reason)
        : [];
      const focusAreas = Array.isArray(parsed.focusAreas) ? parsed.focusAreas : fallbackPlan.focusAreas;
      const patchSummary = typeof parsed.patchSummary === 'string' ? parsed.patchSummary : '';

      const agentBriefings: AgentBriefing[] = Array.isArray(parsed.agentBriefings)
        ? parsed.agentBriefings
            .filter((b) => b.role && b.focusSummary)
            .map((b) => ({
              role: b.role,
              focusSummary: b.focusSummary,
              keyFiles: Array.isArray(b.keyFiles) ? b.keyFiles : [],
              concerns: Array.isArray(b.concerns) ? b.concerns : [],
            }))
        : [];

      const plan: ExecutionPlan = {
        ...fallbackPlan,
        patchIntent,
        riskFlags,
        enabledAgents,
        disabledAgents,
        focusAreas,
        priorityFiles: focusAreas.slice(0, 10),
      };

      return { plan, agentBriefings, patchSummary };
    } catch {
      return { plan: fallbackPlan, agentBriefings: [], patchSummary: '' };
    }
  }

  private validatePatchIntent(value: unknown): PatchIntent | undefined {
    if (value === 'feature' || value === 'refactor' || value === 'bugfix' || value === 'mixed') {
      return value;
    }
    return undefined;
  }

  private validateRiskFlags(value: unknown): RiskFlags | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    const v = value as Record<string, unknown>;
    if (
      typeof v.securitySensitive === 'boolean' &&
      typeof v.crossModule === 'boolean' &&
      typeof v.highChurn === 'boolean' &&
      typeof v.apiContractChange === 'boolean'
    ) {
      return v as unknown as RiskFlags;
    }
    return undefined;
  }

  private extractJson(text: string): string | null {
    const fenced = text.match(/```json\s*([\s\S]*?)```/);
    if (fenced?.[1]) {
      return fenced[1].trim();
    }
    // Find first balanced { ... }
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '{') { continue; }
      let depth = 0;
      let inStr = false;
      let esc = false;
      for (let j = i; j < text.length; j++) {
        if (esc) { esc = false; continue; }
        if (text[j] === '\\') { esc = true; continue; }
        if (text[j] === '"') { inStr = !inStr; continue; }
        if (inStr) { continue; }
        if (text[j] === '{') { depth++; }
        if (text[j] === '}') { depth--; if (depth === 0) { return text.slice(i, j + 1); } }
      }
    }
    return null;
  }

  // ── Heuristic analysis (original logic, kept as fallback) ─────────────

  private heuristicAnalysis(input: ContextGathererInput): {
    plan: ExecutionPlan;
    trace: ContextGathererDebugTrace;
  } {
    try {
      const patchSize = this.classifyPatchSize(input.changes.length, input.diffTokens);
      const counts = this.countDiffLines(input.diffText);
      const patchIntent = this.classifyPatchIntent(input.changes, input.diffText, patchSize, counts);
      const riskFlags = this.detectRiskFlags(input.changes, input.diffText, input.dependencyGraph);
      const priorityFiles = this.identifyHotspots(input.changes, input.dependencyGraph);
      const agentBudgets = this.computeAgentBudgets(patchIntent, riskFlags, this.defaultBudgetRatios);
      const enabledAgents = this.determineEnabledAgents();
      const topLevelDirectories = this.collectTopLevelDirectories(input.changes);
      const graphAvailability = this.determineGraphAvailability(input.changes, input.dependencyGraph);

      const trace: ContextGathererDebugTrace = {
        patchSize,
        additions: counts.additions,
        deletions: counts.deletions,
        newFiles: input.changes.filter((c) => c.statusLabel === 'added').length,
        renamedFiles: input.changes.filter((c) => c.statusLabel === 'renamed' || !!c.originalFilePath).length,
        topLevelDirectories,
        graphAvailability,
        securitySignals: this.collectSecuritySignals(input.changes, input.diffText),
        apiContractSignals: this.collectApiContractSignals(input.diffText),
        llmUsed: false,
      };
      this.lastDebugTrace = trace;

      const plan: ExecutionPlan = {
        patchIntent,
        riskFlags,
        enabledAgents,
        disabledAgents: [],
        agentBudgets,
        sectionWriters: {
          summary: patchSize !== 'small',
          improvements: true,
        },
        sectionWriterBudgets: {
          ...(patchSize !== 'small'
            ? { summary: Math.max(512, Math.floor(input.contextWindow * 0.05)) }
            : {}),
          improvements: Math.max(512, Math.floor(input.contextWindow * 0.06)),
        },
        focusAreas: priorityFiles.length > 0
          ? priorityFiles
          : input.changes.slice(0, 5).map((c) => c.relativePath),
        priorityFiles,
        fallbackPolicy: 'skip-agent',
        patchSize,
      };

      return { plan, trace };
    } catch {
      const defaultPlan = this.buildDefaultPlan();
      return {
        plan: defaultPlan,
        trace: {
          patchSize: 'small', additions: 0, deletions: 0, newFiles: 0, renamedFiles: 0,
          topLevelDirectories: [], graphAvailability: 'unavailable',
          securitySignals: [], apiContractSignals: [], llmUsed: false,
        },
      };
    }
  }

  // ── Heuristic helpers (unchanged) ─────────────────────────────────────

  private classifyPatchSize(fileCount: number, diffTokens: number): 'small' | 'medium' | 'large' {
    if (fileCount > 30 || diffTokens > 15_000) { return 'large'; }
    if (fileCount >= 10 || diffTokens >= 3_000) { return 'medium'; }
    return 'small';
  }

  private classifyPatchIntent(
    changes: UnifiedDiffFile[], diffText: string,
    patchSize: 'small' | 'medium' | 'large',
    counts: { additions: number; deletions: number },
  ): PatchIntent {
    const totalChanged = Math.max(1, counts.additions + counts.deletions);
    const additionRatio = counts.additions / totalChanged;
    const deletionDelta = Math.abs(counts.additions - counts.deletions) / totalChanged;
    const newFiles = changes.filter((c) => c.statusLabel === 'added').length;
    const renamedFiles = changes.filter((c) => c.statusLabel === 'renamed' || !!c.originalFilePath).length;
    const renameRatio = changes.length > 0 ? renamedFiles / changes.length : 0;
    const hasTestFiles = changes.some((c) => /(^|\/)(test|tests|__tests__|spec)\b/i.test(c.relativePath));
    const hasSourceFiles = changes.some((c) => !/(^|\/)(test|tests|__tests__|spec)\b/i.test(c.relativePath));

    if (additionRatio > 0.6 && (newFiles > 0 || patchSize !== 'small')) { return 'feature'; }
    if ((renameRatio >= 0.3 || renamedFiles >= 2) && deletionDelta <= 0.2) { return 'refactor'; }
    if (patchSize === 'small' && hasTestFiles && hasSourceFiles && newFiles === 0) { return 'bugfix'; }
    return 'mixed';
  }

  private detectRiskFlags(changes: UnifiedDiffFile[], diffText: string, graph?: DependencyGraphData): RiskFlags {
    const topLevelDirectories = this.collectTopLevelDirectories(changes);
    const changedLineCounts = changes.map((c) => this.countChangedLines(c.diff));
    const crossModuleFromGraph = (graph?.criticalPaths ?? []).filter((p) => p.changedFileCount >= 2).length >= 2;
    return {
      securitySensitive: changes.some((c) => SECURITY_PATTERNS.test(c.relativePath)) || SECURITY_KEYWORDS.test(diffText),
      crossModule: topLevelDirectories.length >= 3 || crossModuleFromGraph,
      highChurn: changedLineCounts.filter((c) => c > 100).length >= 5,
      apiContractChange: API_CONTRACT_PATTERN.test(diffText),
    };
  }

  private identifyHotspots(changes: UnifiedDiffFile[], graph?: DependencyGraphData): string[] {
    if (!graph) { return []; }
    const changedPaths = new Set(changes.map((c) => c.filePath || c.relativePath));
    return [...graph.fileDependencies.entries()]
      .filter(([fp]) => changedPaths.has(fp) || changes.some((c) => c.relativePath === fp))
      .sort((a, b) => b[1].importedBy.length - a[1].importedBy.length)
      .map(([fp]) => changes.find((c) => c.filePath === fp || c.relativePath === fp)?.relativePath ?? fp);
  }

  private determineEnabledAgents(): string[] { return [...DEFAULT_ENABLED_AGENTS]; }

  private computeAgentBudgets(patchIntent: PatchIntent, riskFlags: RiskFlags, defaultRatios: Record<string, number>): Record<string, number> {
    const target: Record<string, number> = { ...defaultRatios };
    const boosted = new Set<string>();
    if (riskFlags.securitySensitive && target['Security Analyst'] !== undefined) {
      target['Security Analyst'] = defaultRatios['Security Analyst'] * 1.2;
      boosted.add('Security Analyst');
    }
    if (patchIntent === 'refactor' && target['Flow Diagram'] !== undefined) {
      target['Flow Diagram'] = defaultRatios['Flow Diagram'] * 1.15;
      boosted.add('Flow Diagram');
    }
    const boostedTotal = [...boosted].reduce((s, r) => s + (target[r] ?? 0), 0);
    if (boostedTotal >= 1) {
      const norm: Record<string, number> = {};
      for (const role of Object.keys(target)) { norm[role] = boosted.has(role) ? (target[role] ?? 0) / boostedTotal : 0; }
      return norm;
    }
    const remaining = Object.keys(defaultRatios).filter((r) => !boosted.has(r));
    const remainingTotal = remaining.reduce((s, r) => s + (defaultRatios[r] ?? 0), 0);
    const remainingBudget = Math.max(0, 1 - boostedTotal);
    const final: Record<string, number> = {};
    for (const [role, ratio] of Object.entries(defaultRatios)) {
      final[role] = boosted.has(role) ? target[role] : (remainingTotal > 0 ? remainingBudget * (ratio / remainingTotal) : 0);
    }
    return final;
  }

  private buildDefaultPlan(): ExecutionPlan {
    return {
      patchIntent: 'mixed',
      riskFlags: { securitySensitive: false, crossModule: false, highChurn: false, apiContractChange: false },
      enabledAgents: this.determineEnabledAgents(),
      disabledAgents: [],
      agentBudgets: { ...this.defaultBudgetRatios },
      sectionWriters: { summary: false, improvements: false },
      focusAreas: [],
      priorityFiles: [],
      fallbackPolicy: 'static-budget',
      patchSize: 'small',
    };
  }

  private countDiffLines(diffText: string): { additions: number; deletions: number } {
    let additions = 0, deletions = 0;
    for (const line of diffText.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) { additions++; }
      else if (line.startsWith('-') && !line.startsWith('---')) { deletions++; }
    }
    return { additions, deletions };
  }

  private countChangedLines(diffText: string): number {
    return diffText.split('\n').filter((l) =>
      (l.startsWith('+') && !l.startsWith('+++')) || (l.startsWith('-') && !l.startsWith('---')),
    ).length;
  }

  private collectTopLevelDirectories(changes: UnifiedDiffFile[]): string[] {
    return [...new Set(changes.map((c) => c.relativePath.replace(/\\/g, '/').split('/')[0]).filter((s) => s.length > 0))];
  }

  private determineGraphAvailability(changes: UnifiedDiffFile[], graph?: DependencyGraphData): 'available' | 'unavailable' | 'partial' {
    if (!graph) { return 'unavailable'; }
    const expected = changes.filter((c) => !c.isBinary && !c.isDeleted).length;
    if (graph.fileDependencies.size === 0) { return 'partial'; }
    return graph.fileDependencies.size >= expected ? 'available' : 'partial';
  }

  private collectSecuritySignals(changes: UnifiedDiffFile[], diffText: string): string[] {
    const m = changes.filter((c) => SECURITY_PATTERNS.test(c.relativePath)).map((c) => c.relativePath);
    if (SECURITY_KEYWORDS.test(diffText)) { m.push('diff-keyword'); }
    return m;
  }

  private collectApiContractSignals(diffText: string): string[] {
    return diffText.split('\n').filter((l) => API_CONTRACT_PATTERN.test(l)).slice(0, 10);
  }
}

// ── LLM Prompt Constants ──────────────────────────────────────────────

const CONTEXT_GATHERER_SYSTEM_PROMPT = `You are a senior code review planner. Your job is to analyze a code patch (diff + dependency graph) and produce a structured execution plan for downstream review agents.

You must:
1. Understand the SEMANTIC intent of the patch (not just count files/lines).
2. Identify real risks based on code logic, not just file name patterns.
3. Decide which review agents should run and what each should focus on.
4. Write a targeted briefing for each agent so they start with understanding instead of parsing raw diff.

Be precise and grounded in the actual code changes. Do not hallucinate risks that aren't supported by the diff.

Return ONLY valid JSON. Do not wrap in markdown fences. Do not add commentary outside the JSON.`;

const LLM_RESPONSE_SCHEMA_INSTRUCTION = `## Required Output

Return a single JSON object with this exact schema:

{
  "patchIntent": "feature" | "refactor" | "bugfix" | "mixed",
  "riskFlags": {
    "securitySensitive": boolean,
    "crossModule": boolean,
    "highChurn": boolean,
    "apiContractChange": boolean
  },
  "patchSummary": "2-3 sentence high-level summary of what this patch does",
  "focusAreas": ["file paths or module names that are most critical"],
  "enabledAgents": ["Code Reviewer", "Flow Diagram", "Detail Change", "Security Analyst", "Observer"],
  "disabledAgents": [{"role": "agent name", "reason": "why it should be skipped"}],
  "agentBriefings": [
    {
      "role": "Code Reviewer",
      "focusSummary": "What this agent should focus on given this specific patch. Be specific about which files, functions, and logic paths matter most.",
      "keyFiles": ["most important files for this agent"],
      "concerns": ["specific risks or issues this agent should investigate"]
    },
    {
      "role": "Security Analyst",
      "focusSummary": "...",
      "keyFiles": ["..."],
      "concerns": ["..."]
    },
    {
      "role": "Flow Diagram",
      "focusSummary": "...",
      "keyFiles": ["..."],
      "concerns": ["..."]
    },
    {
      "role": "Detail Change",
      "focusSummary": "...",
      "keyFiles": ["..."],
      "concerns": ["..."]
    },
    {
      "role": "Observer",
      "focusSummary": "...",
      "keyFiles": ["..."],
      "concerns": ["..."]
    }
  ]
}

Rules:
- Only include agents in enabledAgents if they have meaningful work to do.
- If the patch is purely documentation or config, disable Code Reviewer and Security Analyst with reasons.
- agentBriefings MUST include an entry for every agent in enabledAgents.
- focusSummary should be 2-4 sentences, specific to this patch. Not generic advice.
- keyFiles should be actual file paths from the diff.
- concerns should be specific risks grounded in the code changes.`;
