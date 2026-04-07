import { GenerateOptions, ILLMAdapter } from "../../../llm-adapter";
import { functionCallExecute } from "../../../llm-tools/utils";
import { ContextGenerationRequest, LlmRequestLogEntry, UnifiedDiffFile } from "../contextTypes";
import { GenerationCancelledError } from "../ContextOrchestratorService";
import { TokenEstimatorService } from "../TokenEstimatorService";
import { AdapterCalibrationService } from "./AdapterCalibrationService";
import {
  AgentPrompt,
  CodeReviewerOutput,
  ContextOrchestratorConfig,
  ExecutionPlan,
  FlowDiagramOutput,
  PhasedAgentConfig,
  RiskHypothesis,
  SecurityAnalystOutput,
  StructuredAuditResult,
  StructuredAgentReport,
} from "./orchestratorTypes";
import { RiskHypothesisGenerator } from "./RiskHypothesisGenerator";
import { ISharedContextStore } from "./SharedContextStore";
import { SessionMemory } from "./SessionMemory";

export class MultiAgentExecutor {
  private diffSummary: string = "";
  private changedFiles: UnifiedDiffFile[] = [];
  private lastAgentTokenUsage = new Map<string, number>();
  private lastSkippedAgents: Array<{ role: string; reason: string }> = [];
  private llmRequestCounter = 0;

  constructor(
    private readonly config: ContextOrchestratorConfig,
    private readonly calibration: AdapterCalibrationService,
    private readonly tokenEstimator?: TokenEstimatorService
  ) {}

  setDiffContext(diffSummary: string, changedFiles: UnifiedDiffFile[]): void {
    this.diffSummary = diffSummary;
    this.changedFiles = changedFiles;
  }

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

  async executeSynthesisAgents(
    agents: AgentPrompt[],
    adapter: ILLMAdapter,
    signal?: AbortSignal,
    request?: ContextGenerationRequest
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    let nextIndex = 0;

    const runNext = async () => {
      while (true) {
        this.throwIfCancelled(signal);
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= agents.length) {
          return;
        }

        const agent = agents[currentIndex];
        try {
          results.set(agent.role, await this.runAgent(agent, adapter, signal, request));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.set(agent.role, `[ERROR] ${message}`);
          this.reportLog(request, `[synthesis] agent ${agent.role} failed: ${message}`);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(4, agents.length) }, () => runNext()),
    );

    return results;
  }

  async executePhasedAgents(
    config: PhasedAgentConfig,
    adapter: ILLMAdapter,
    signal?: AbortSignal,
    request?: ContextGenerationRequest,
    executionPlan?: ExecutionPlan,
  ): Promise<string[]> {
    const { sharedStore, promptBuilder, buildContext, budgetAllocations } = config;
    this.lastAgentTokenUsage = new Map();
    this.lastSkippedAgents = [];
    this.setDiffContext(
      typeof (promptBuilder as { buildDiffSummary?: (files: UnifiedDiffFile[]) => string }).buildDiffSummary === "function"
        ? (promptBuilder as { buildDiffSummary: (files: UnifiedDiffFile[]) => string }).buildDiffSummary(buildContext.changedFiles)
        : this.buildChangedFilesSummary(buildContext.changedFiles),
      buildContext.changedFiles,
    );

    const enabledRoles = executionPlan?.enabledAgents
      ? new Set(executionPlan.enabledAgents)
      : undefined;
    const phase1 = enabledRoles
      ? config.phase1.filter((agent) => enabledRoles.has(agent.role))
      : config.phase1;
    const budgetByRole = new Map(budgetAllocations.map((budget) => [budget.agentRole, budget]));
    const phase1Agents = phase1.map((agent) => ({
      ...agent,
      allocatedBudget: budgetByRole.get(agent.role),
    }));

    if (executionPlan?.disabledAgents?.length) {
      this.lastSkippedAgents = executionPlan.disabledAgents.map((item) => ({ ...item }));
      for (const disabled of executionPlan.disabledAgents) {
        this.reportLog(request, `[phase1] skipped agent ${disabled.role}: ${disabled.reason}`);
      }
    }

    // ── Phase 1: Parallel execution ──
    const phase1Roles = phase1Agents.map(agent => agent.role).join(', ');
    this.reportProgress(
      request,
      phase1Agents.length > 0
        ? `Executing phase 1 agents: ${phase1Roles}...`
        : 'Executing phase 1 agents...'
    );
    const phase1Results: (string | Error)[] = new Array(phase1Agents.length);

    let nextIndex = 0;
    const runPhase1 = async () => {
      while (true) {
        this.throwIfCancelled(signal);
        const idx = nextIndex++;
        if (idx >= phase1Agents.length) { return; }
        try {
          phase1Results[idx] = await this.runAgent(phase1Agents[idx], adapter, signal, request);
        } catch (error) {
          phase1Results[idx] = error instanceof Error ? error : new Error(String(error));
          this.reportLog(request, `[phase1] agent ${phase1Agents[idx].role} failed: ${error}`);
        }
      }
    };
    await Promise.all(Array.from(
      { length: Math.min(this.config.concurrency, phase1Agents.length) },
      () => runPhase1()
    ));

    // ── Parse Phase 1 structured outputs → store in SharedContextStore ──
    const structuredReports: StructuredAgentReport[] = [];
    for (let i = 0; i < phase1Agents.length; i++) {
      const result = phase1Results[i];
      if (typeof result !== 'string') { continue; }

      const parsed = this.parseStructuredOutput(result, phase1Agents[i].outputSchema);
      if (parsed) {
        structuredReports.push(parsed);
        (sharedStore as ISharedContextStore).addAgentFindings(phase1Agents[i].role, [{
          agentRole: phase1Agents[i].role,
          type:
            phase1Agents[i].role === 'Code Reviewer'
              ? 'issue'
              : phase1Agents[i].role === 'Security Analyst'
                ? 'security'
                : 'flow',
          data: parsed.structured,
          timestamp: Date.now(),
        }]);
        if (sharedStore instanceof SessionMemory) {
          this.transitionSessionMemoryByRole(sharedStore, phase1Agents[i].role, 'self_audit');
        }
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
      const saReport = structuredReports.find(r => r.role === 'Security Analyst');
      const graph = (sharedStore as ISharedContextStore).getDependencyGraph();

      if (crReport && fdReport && graph) {
        hypotheses = await hypothesisGenerator.generate(
          crReport.structured as CodeReviewerOutput,
          fdReport.structured as FlowDiagramOutput,
          graph,
          adapter,
          signal,
          saReport?.structured as SecurityAnalystOutput | undefined,
        );
      } else {
        this.reportLog(request, `[hypothesis] skipped: missing Phase 1 outputs (CR=${!!crReport}, FD=${!!fdReport}, graph=${!!graph})`);
      }
      (sharedStore as ISharedContextStore).setRiskHypotheses(hypotheses);
      if (sharedStore instanceof SessionMemory) {
        for (const hypothesis of sharedStore.getHypotheses({ status: ['proposed'] })) {
          sharedStore.transitionHypothesisStatus(hypothesis.id, 'verified', 'observer');
        }
      }
    } catch (error) {
      this.reportLog(request, `[hypothesis] generation failed, Observer runs without hypotheses: ${error}`);
    }

    // ── Phase 2: Observer with injected context ──
    let observerResult = '';
    const observerEnabled = !enabledRoles || enabledRoles.has('Observer');
    if (observerEnabled) {
      this.reportProgress(request, "Observer analyzing with context from other agents...");
      const observerBudget = budgetAllocations.find(b => b.agentRole === 'Observer')!;
      const observerAgent = {
        ...promptBuilder.buildObserverPrompt(
          { ...buildContext, sharedContextStore: sharedStore, riskHypotheses: hypotheses },
          observerBudget
        ),
        allocatedBudget: observerBudget,
      };

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
          if (sharedStore instanceof SessionMemory) {
            this.transitionSessionMemoryByRole(sharedStore, 'Observer', 'observer');
          }
        }
      } catch (error) {
        this.reportLog(request, `[phase2] Observer failed: ${error}`);
        observerResult = `### Agent: Observer\n\nObserver analysis unavailable due to error.`;
      }
    } else {
      const reason = executionPlan?.disabledAgents.find((item) => item.role === 'Observer')?.reason ?? 'disabled by execution plan';
      this.reportLog(request, `[phase2] skipped agent Observer: ${reason}`);
      this.lastSkippedAgents.push({ role: 'Observer', reason });
    }

    // ── Combine all results ──
    const allResults = [
      ...phase1Results.filter((r): r is string => typeof r === 'string'),
      ...(observerResult ? [observerResult] : []),
    ];
    return allResults;
  }

  getLastAgentTokenUsage(): Record<string, number> {
    return Object.fromEntries(this.lastAgentTokenUsage.entries());
  }

  getLastSkippedAgents(): Array<{ role: string; reason: string }> {
    return [...this.lastSkippedAgents];
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

    const jsonBody = this.extractJsonBody(body);
    if (!jsonBody) { return null; }

    try {
      const parsed = JSON.parse(jsonBody);
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

    const jsonBody = this.extractJsonBody(body);
    if (!jsonBody) { return null; }

    try {
      const parsed = JSON.parse(jsonBody);
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
        case 'security-analyst':
          if (Array.isArray(parsed.vulnerabilities)) {
            return { role: 'Security Analyst', structured: parsed, raw: body };
          }
          break;
      }
    } catch {
      // fallback to raw text
    }

    this.reportLog(undefined, `[parseStructuredOutput] failed to parse ${schema} output`);
    return null;
  }

  private async runStructuredSelfAudit(
    agent: AgentPrompt,
    adapter: ILLMAdapter,
    lastResponse: any,
    sharedStore?: ISharedContextStore,
    signal?: AbortSignal,
    request?: ContextGenerationRequest
  ): Promise<any> {
    this.reportLog(request, `[agent:${agent.role}] performing structured self-audit`);

    const previousAnalysis = lastResponse?.text?.trim() ?? "";
    const auditBudget = adapter.getMaxOutputTokens();
    const changedFilesSummary = this.buildChangedFilesSummary(this.changedFiles);
    const diffContext = this.diffSummary || changedFilesSummary;
    const effectiveDiffContext =
      this.estimateTokens(diffContext) > auditBudget * 0.3
        ? changedFilesSummary
        : diffContext;

    const sections = [
      `Here is your previous analysis:\n\n${previousAnalysis}`,
      `## Diff Context\n${effectiveDiffContext}`,
    ];

    if (agent.role === 'Observer' && sharedStore) {
      sections.push(this.buildObserverChecklist(sharedStore));
    }

    if (agent.role === 'Code Reviewer' || agent.role === 'Security Analyst') {
      sections.push(
        `### Chain-of-Verification
For each finding with severity "critical" or "major":
1. Generate 1-2 verification questions about the finding.
2. Answer each question using the diff context above.
3. If the answers contradict the finding, add it to removals with reason "failed_verification".
Include "verificationResults" in your JSON output.`,
      );
    }

    sections.push(
      `Self-audit your analysis and return ONLY valid JSON with this schema:
{
  "verdict": "PASS" | "NEEDS_REVISION",
  "issues": [{ "severity", "location", "description" }],
  "additions": [...new findings...],
  "removals": [{ "findingIndex", "reason" }],
  "verificationResults": [{ "findingIndex", "questions", "answers", "passed" }]
}`,
    );

    const auditPrompt = sections.join('\n\n---\n\n');
    const auditOptions = this.buildGenerateOptions(adapter, {
      systemMessage: agent.systemMessage,
      maxTokens: adapter.getMaxOutputTokens(),
    });

    const safeAuditPrompt = this.calibration.safeTruncatePrompt(
      auditPrompt,
      agent.systemMessage,
      adapter,
      request,
      `${agent.role}:structured-self-audit`,
    );

    const startTime = Date.now();
    const auditReqId = this.nextRequestId(`agent:${agent.role}:structured-self-audit`);
    this.reportLlmLog(request, {
      requestId: auditReqId,
      stage: `agent:${agent.role}:structured-self-audit`,
      provider: adapter.getProvider(),
      model: adapter.getModel(),
      status: 'pending',
      systemMessage: agent.systemMessage,
      prompt: safeAuditPrompt,
      promptTokens: this.estimateTokens(safeAuditPrompt) + this.estimateTokens(agent.systemMessage),
      timestamp: new Date().toISOString(),
    });
    const auditResponse = await this.calibration.generateTextWithAutoRetry(
      safeAuditPrompt,
      agent.systemMessage,
      auditOptions,
      adapter,
      request,
      `${agent.role}:structured-self-audit`,
    );
    this.throwIfCancelled(signal);

    this.reportLlmLog(request, {
      requestId: auditReqId,
      stage: `agent:${agent.role}:structured-self-audit`,
      provider: adapter.getProvider(),
      model: adapter.getModel(),
      status: 'completed',
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

    const auditResult = this.parseStructuredAuditResult(auditResponse.text);
    if (!auditResult) {
      this.reportLog(request, `[agent:${agent.role}] structured self-audit parse failed, keeping original output`);
      return lastResponse;
    }

    if (auditResult.verificationResults?.length) {
      for (const verification of auditResult.verificationResults) {
        if (!verification.passed && !auditResult.removals.some((removal) => removal.findingIndex === verification.findingIndex)) {
          auditResult.removals.push({
            findingIndex: verification.findingIndex,
            reason: 'failed_verification',
          });
        }
      }
    }

    this.reportLog(
      request,
      `[agent:${agent.role}] audit verdict=${auditResult.verdict} issues=${auditResult.issues.length} additions=${auditResult.additions.length} removals=${auditResult.removals.length}`,
    );

    if (auditResult.verdict === 'PASS') {
      return lastResponse;
    }

    const mergedText = this.applyStructuredAudit(agent, previousAnalysis, auditResult);
    return {
      ...lastResponse,
      text: mergedText,
    };
  }

  private parseStructuredAuditResult(text: string): StructuredAuditResult | null {
    const body = this.extractJsonBody(text);
    if (!body) {
      return null;
    }

    try {
      const parsed = JSON.parse(body) as StructuredAuditResult;
      if (
        (parsed.verdict === 'PASS' || parsed.verdict === 'NEEDS_REVISION') &&
        Array.isArray(parsed.issues) &&
        Array.isArray(parsed.additions) &&
        Array.isArray(parsed.removals)
      ) {
        return parsed;
      }
    } catch {
      return null;
    }

    return null;
  }

  private applyStructuredAudit(
    agent: AgentPrompt,
    previousAnalysis: string,
    auditResult: StructuredAuditResult,
  ): string {
    const body = this.extractJsonBody(previousAnalysis);
    if (!body) {
      return previousAnalysis;
    }

    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (agent.outputSchema === 'code-reviewer') {
        const issues = Array.isArray(parsed.issues) ? [...parsed.issues] : [];
        const removals = new Set(auditResult.removals.map((removal) => removal.findingIndex));
        parsed.issues = issues
          .filter((_, index) => !removals.has(index))
          .concat(auditResult.additions.filter((item) => typeof item === 'object' && item !== null));
      } else if (agent.outputSchema === 'security-analyst') {
        const vulnerabilities = Array.isArray(parsed.vulnerabilities) ? [...parsed.vulnerabilities] : [];
        const removals = new Set(auditResult.removals.map((removal) => removal.findingIndex));
        parsed.vulnerabilities = vulnerabilities
          .filter((_, index) => !removals.has(index))
          .concat(auditResult.additions.filter((item) => typeof item === 'object' && item !== null));
      } else if (agent.outputSchema === 'observer') {
        const removalIndices = auditResult.removals.map((removal) => removal.findingIndex);
        const riskRemovalIndices = new Set<number>();
        const todoRemovalIndices = new Set<number>();
        const risks = Array.isArray(parsed.risks) ? [...parsed.risks] : [];
        const todoItems = Array.isArray(parsed.todoItems) ? [...parsed.todoItems] : [];
        for (const removalIndex of removalIndices) {
          if (removalIndex < risks.length) {
            riskRemovalIndices.add(removalIndex);
            continue;
          }

          const todoIndex = removalIndex - risks.length;
          if (todoIndex >= 0 && todoIndex < todoItems.length) {
            todoRemovalIndices.add(todoIndex);
          }
        }

        for (const addition of auditResult.additions) {
          if (typeof addition !== 'object' || addition === null) {
            continue;
          }
          if ('action' in addition) {
            todoItems.push(addition);
          } else {
            risks.push(addition);
          }
        }
        parsed.risks = risks.filter((_, index) => !riskRemovalIndices.has(index));
        parsed.todoItems = todoItems.filter((_, index) => !todoRemovalIndices.has(index));
      }

      return JSON.stringify(parsed);
    } catch {
      return previousAnalysis;
    }
  }

  private buildObserverChecklist(sharedStore: ISharedContextStore): string {
    const codeReviewerFindings = sharedStore.getAgentFindings('Code Reviewer');
    const flowDiagramFindings = sharedStore.getAgentFindings('Flow Diagram');
    const securityFindings = sharedStore.getAgentFindings('Security Analyst');

    let checklist = '';
    if (codeReviewerFindings.length > 0) {
      const crData = codeReviewerFindings[0].data as CodeReviewerOutput;
      if (Array.isArray(crData.issues)) {
        checklist += '## Code Reviewer Issues Checklist\n';
        checklist += crData.issues.map((issue, index) =>
          `${index + 1}. [${issue.severity}] ${issue.file}:${issue.location} — ${issue.description}\n` +
          `   → Have you assessed hidden risks for this issue?`,
        ).join('\n');
      }
    }

    if (flowDiagramFindings.length > 0) {
      const fdData = flowDiagramFindings[0].data as FlowDiagramOutput;
      if (Array.isArray(fdData.affectedFlows)) {
        checklist += '\n\n## Flow Diagram Flows Checklist\n';
        checklist += fdData.affectedFlows.map((flow, index) =>
          `${index + 1}. Flow: ${flow}\n   → Any integration concerns for this flow?`,
        ).join('\n');
      }
    }

    if (securityFindings.length > 0) {
      const securityData = securityFindings[0].data as SecurityAnalystOutput;
      if (Array.isArray(securityData.vulnerabilities)) {
        checklist += '\n\n## Security Findings Checklist\n';
        checklist += securityData.vulnerabilities.map((finding, index) =>
          `${index + 1}. [${finding.severity}] ${finding.file}:${finding.location} — ${finding.description}\n` +
          `   → Could this impact adjacent modules or integrations?`,
        ).join('\n');
      }
    }

    return checklist;
  }

  private buildChangedFilesSummary(changedFiles: UnifiedDiffFile[]): string {
    if (changedFiles.length === 0) {
      return '## Changed Files Summary\nNone';
    }

    return [
      '## Changed Files Summary',
      ...changedFiles.map((file) => {
        const lines = (file.diff ?? '').split('\n');
        const changedLineCount = lines.filter((line) =>
          (line.startsWith('+') && !line.startsWith('+++')) ||
          (line.startsWith('-') && !line.startsWith('---')),
        ).length;
        return `- ${file.relativePath} (${file.statusLabel}) — ${changedLineCount} changed lines`;
      }),
    ].join('\n');
  }

  private transitionSessionMemoryByRole(
    sessionMemory: SessionMemory,
    role: string,
    actor: 'self_audit' | 'observer',
  ): void {
    const pending = sessionMemory.getFindings({ agentRole: role, status: ['proposed'] });
    for (const finding of pending) {
      sessionMemory.transitionFindingStatus(finding.id, 'verified', actor);
    }
  }

  private estimateTokens(text: string): number {
    if (this.tokenEstimator) {
      return this.tokenEstimator.estimateTextTokens(text);
    }
    return Math.ceil(text.length / 4);
  }

  private extractJsonBody(text: string): string | null {
    const fencedMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    for (let index = 0; index < text.length; index++) {
      if (text[index] !== '{') {
        continue;
      }

      const candidate = this.extractBalancedJsonObject(text, index);
      if (!candidate) {
        continue;
      }

      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        continue;
      }
    }

    return null;
  }

  private extractBalancedJsonObject(text: string, startIndex: number): string | null {
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (let index = startIndex; index < text.length; index++) {
      const char = text[index];
      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === '\\') {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          return text.slice(startIndex, index + 1);
        }
      }
    }

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
    const obsAuditReqId = this.nextRequestId('agent:Observer:self-audit');
    this.reportLlmLog(request, {
      requestId: obsAuditReqId,
      stage: 'agent:Observer:self-audit',
      provider: adapter.getProvider(),
      model: adapter.getModel(),
      status: 'pending',
      systemMessage: agent.systemMessage,
      prompt: safeAuditPrompt,
      promptTokens: this.estimateTokens(safeAuditPrompt) + this.estimateTokens(agent.systemMessage),
      timestamp: new Date().toISOString(),
    });
    const auditResponse = await this.calibration.generateTextWithAutoRetry(
      safeAuditPrompt, agent.systemMessage, auditOptions, adapter, request, 'Observer:self-audit'
    );
    this.throwIfCancelled(signal);

    this.reportLlmLog(request, {
      requestId: obsAuditReqId,
      stage: 'agent:Observer:self-audit',
      provider: adapter.getProvider(),
      model: adapter.getModel(),
      status: 'completed',
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

      const promptForGeneration = agent.role === 'Observer'
        ? this.sanitizeObserverPrompt(currentPrompt)
        : currentPrompt;

      const safePrompt = this.calibration.safeTruncatePrompt(
        promptForGeneration,
        options.systemMessage || "",
        adapter,
        request,
        agent.role,
        undefined,
        agent.allocatedBudget?.totalBudget,
      );

      const startTime = Date.now();
      const reqId = this.nextRequestId(`agent:${agent.role}:iter${iteration + 1}`);
      this.reportLlmLog(request, {
        requestId: reqId,
        stage: `agent:${agent.role}:iter${iteration + 1}`,
        provider: adapter.getProvider(),
        model: adapter.getModel(),
        status: 'pending',
        systemMessage: options.systemMessage || "",
        prompt: safePrompt,
        promptTokens: this.estimateTokens(safePrompt) + this.estimateTokens(options.systemMessage || ""),
        timestamp: new Date().toISOString(),
      });
      const response = await this.calibration.generateTextWithAutoRetry(
        safePrompt, options.systemMessage || "", options, adapter, request, agent.role
      );
      this.throwIfCancelled(signal);
      lastResponse = response;
      const estimatedTotal =
        response.totalTokens ??
        ((response.promptTokens ?? this.estimateTokens(safePrompt)) + (response.completionTokens ?? this.estimateTokens(response.text)));
      this.lastAgentTokenUsage.set(
        agent.role,
        (this.lastAgentTokenUsage.get(agent.role) ?? 0) + estimatedTotal,
      );

      this.reportLlmLog(request, {
        requestId: reqId,
        stage: `agent:${agent.role}:iter${iteration + 1}`,
        provider: adapter.getProvider(),
        model: adapter.getModel(),
        status: 'completed',
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
      lastResponse = await this.runStructuredSelfAudit(
        agent,
        adapter,
        lastResponse,
        agent.sharedStore as ISharedContextStore | undefined,
        signal,
        request,
      );
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
    const legacyAuditReqId = this.nextRequestId(`agent:${agent.role}:self-audit`);
    this.reportLlmLog(request, {
      requestId: legacyAuditReqId,
      stage: `agent:${agent.role}:self-audit`,
      provider: adapter.getProvider(),
      model: adapter.getModel(),
      status: 'pending',
      systemMessage: agent.systemMessage,
      prompt: safeAuditPrompt,
      promptTokens: this.estimateTokens(safeAuditPrompt) + this.estimateTokens(agent.systemMessage),
      timestamp: new Date().toISOString(),
    });
    const auditResponse = await this.calibration.generateTextWithAutoRetry(
      safeAuditPrompt, agent.systemMessage, auditOptions, adapter, request, `${agent.role}:self-audit`
    );
    this.throwIfCancelled(signal);

    this.reportLlmLog(request, {
      requestId: legacyAuditReqId,
      stage: `agent:${agent.role}:self-audit`,
      provider: adapter.getProvider(),
      model: adapter.getModel(),
      status: 'completed',
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

  private sanitizeObserverPrompt(prompt: string): string {
    return prompt
      .replaceAll('Code Reviewer', 'code review')
      .replaceAll('Flow Diagram', 'flow analysis');
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

  private nextRequestId(stage: string): string {
    return `${stage}-${++this.llmRequestCounter}`;
  }

  private wrapError(error: unknown, stage: string): Error {
    if (error instanceof GenerationCancelledError) { return error; }
    return error instanceof Error
      ? new Error(`[${stage}] ${error.message}`)
      : new Error(`[${stage}] ${String(error)}`);
  }
}
