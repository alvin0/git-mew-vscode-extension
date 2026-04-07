import {
  AgentPrompt,
  AgentBudgetAllocation,
  AgentPromptBuildContext,
  StructuredAgentReport,
  CodeReviewerOutput,
  FlowDiagramOutput,
  ObserverOutput,
  SecurityAnalystOutput,
  DescriptionAgentReport,
  ChangeAnalyzerOutput,
  ContextInvestigatorOutput,
  SynthesisAgentContext,
} from './orchestratorTypes';
import { UnifiedDiffFile } from '../contextTypes';
import { ContextBudgetManager } from './ContextBudgetManager';
import { TokenEstimatorService } from '../TokenEstimatorService';
import { DependencyGraphIndex } from './DependencyGraphIndex';
import { ISharedContextStore } from './SharedContextStore';
import { SessionMemory } from './SessionMemory';
import { REVIEW_OUTPUT_CONTRACT } from '../../../prompts/reviewOutputContract';
import { FunctionCall } from '../../../llm-tools/toolInterface';
import { SuppressedFinding } from '../reviewMemoryTypes';
import {
  findReferencesTool,
  getDiagnosticsTool,
  getRelatedFilesTool,
  getSymbolDefinitionTool,
  readFileTool,
  searchCodeTool,
  queryContextTool,
} from '../../../llm-tools/tools';

// ── Structural diff regex ──
const STRUCTURAL_LINE_PATTERN =
  /^[+-]\s*(export |import |class |interface |type |enum |function |async function |const \w+ = \(|public |private |protected |abstract |static )/;

// ── Helper: truncate text to a token budget (approx 4 chars/token) ──
function truncateToTokenBudget(text: string, tokenBudget: number): string {
  const charBudget = tokenBudget * 4;
  if (text.length <= charBudget) {
    return text;
  }
  return text.slice(0, charBudget) + '\n...[truncated]';
}

/** Format an agent briefing from Context Gatherer into a prompt section. */
function formatAgentBriefing(ctx: AgentPromptBuildContext, role: string): string | undefined {
  const briefing = ctx.agentBriefings?.find((b) => b.role === role);
  if (!briefing) { return undefined; }

  const parts = [`## Context Gatherer Briefing`];
  if (ctx.patchSummary) {
    parts.push(`**Patch Summary:** ${ctx.patchSummary}`);
  }
  parts.push(`**Your Focus:** ${briefing.focusSummary}`);
  if (briefing.keyFiles.length > 0) {
    parts.push(`**Key Files:** ${briefing.keyFiles.join(', ')}`);
  }
  if (briefing.concerns.length > 0) {
    parts.push(`**Concerns to Investigate:**\n${briefing.concerns.map((c) => `- ${c}`).join('\n')}`);
  }
  return parts.join('\n');
}

function combineTools(baseTools: FunctionCall[], additionalTools?: FunctionCall[]): FunctionCall[] {
  const merged = [...baseTools, ...(additionalTools ?? [])];
  const uniqueTools: FunctionCall[] = [];
  const seen = new Set<string>();

  for (const tool of merged) {
    if (seen.has(tool.id)) {
      continue;
    }
    seen.add(tool.id);
    uniqueTools.push(tool);
  }

  return uniqueTools;
}

// ── System prompt fragments (role-specific, no REVIEW_OUTPUT_CONTRACT) ──

const CODE_REVIEWER_INSTRUCTIONS = `## Code Reviewer Agent
You are a specialized Code Reviewer. Inspect the changed code for:
- **Correctness**: Logic errors, off-by-one, null/undefined handling, race conditions.
- **Security**: Injection, auth bypass, secrets exposure, unsafe deserialization.
- **Performance**: Unnecessary allocations, O(n²) where O(n) suffices, missing caching.
- **Maintainability**: Naming, duplication, coupling, missing abstractions.
- **Testing**: Untested paths, missing edge-case coverage, brittle assertions.

Output your findings as JSON matching the CodeReviewerOutput schema:
{
  "issues": [{ "file", "location", "severity", "category", "description", "suggestion", "confidence" }],
  "affectedSymbols": [],
  "qualityVerdict": "Critical | Not Bad | Safe | Good | Perfect"
}
Return ONLY valid JSON. Do not wrap in markdown fences.`;

const FLOW_DIAGRAM_INSTRUCTIONS = `## Flow Diagram Agent
You are a specialized Flow Diagram analyst. Your task:
- Reconstruct the most important **control flow** and **data flow** affected by the change.
- Use PlantUML notation. Choose the simplest suitable diagram type: activity, sequence, class, or IE.
- Name each diagram clearly to reflect the specific flow it explains.
- Focus on entrypoints, key services/functions, state transitions, side effects, and outputs.

Output your findings as JSON matching the FlowDiagramOutput schema:
{
  "diagrams": [{ "name", "type", "plantumlCode", "description" }],
  "affectedFlows": []
}
Return ONLY valid JSON. Do not wrap in markdown fences.`;

const OBSERVER_INSTRUCTIONS = `## Observer Agent
You look beyond the changed diff to infer:
- **Hidden risks** not visible in the diff itself.
- **Missing edge-case coverage** that could cause production issues.
- **Integration regressions** where changes in one module break consumers.

Produce a comprehensive execution todo list. There is NO limit on the number of items — be thorough.
Each todo item must be action-oriented and testable.
Prefix each with [Sequential] or [Parallel].

### Tool Usage Priority
1. Use \`find_references\` to verify integration concerns before reporting them.
2. Use \`get_symbol_definition\` to understand implementation details of affected symbols.
3. Only report integration risks that you have verified via tool calls.

### Output Completeness
- Each TODO item should include: action, rationale, expected outcome, priority.
- Each risk should include: description, affected areas, likelihood, impact, mitigation.

Output your findings as JSON matching the ObserverOutput schema:
{
  "risks": [{ "description", "severity", "affectedArea", "confidence", "likelihood", "impact", "mitigation" }],
  "todoItems": [{ "action", "parallelizable", "rationale", "expectedOutcome", "priority" }],
  "integrationConcerns": []
}
Return ONLY valid JSON. Do not wrap in markdown fences.`;

const OBSERVER_HYPOTHESIS_INSTRUCTIONS = `
### Hypothesis Investigation
You have been provided with risk hypotheses generated from Phase 1 analysis.
Investigate each hypothesis. For each, provide a verdict:
- **confirmed**: Evidence supports the risk.
- **refuted**: Evidence disproves the risk.
- **inconclusive**: Not enough information to decide.

Include your verdicts in the "hypothesisVerdicts" array:
{
  "hypothesisVerdicts": [{ "hypothesisIndex", "verdict", "evidence" }]
}`;

const DETAIL_CHANGE_INSTRUCTIONS = `## Detail Change Agent
You are a specialized logic narrator for code changes.
Your task is to explain the change in depth, focusing on:
- What behavior changed and what stayed the same.
- How the main control flow now works.
- Data/state transformations, side effects, and outputs.
- Important branches, guards, failure handling, and edge cases.

This is not a code review section. Do not prioritize bugs, verdicts, or suggestions unless they are necessary to explain logic.

Return Markdown only using this structure:
### What Changed
One or more paragraphs explaining the overall logic change.

### Logic Walkthrough
- Bullet points walking through the main execution paths or responsibilities.

### Behavioral Impact
Explain externally visible behavior, integration effects, or notable side effects.

### Edge Cases and Assumptions
Explain meaningful edge cases, guards, or assumptions.`;

const SECURITY_AGENT_INSTRUCTIONS = `## Security Analyst Agent
You are a specialized Security Analyst using Detection-Triage methodology.

### Detection Phase
Analyze the diff for security vulnerabilities following OWASP Top 10:
- **Injection** (CWE-79 XSS, CWE-89 SQLi, CWE-78 OS Command, CWE-918 SSRF)
- **Auth bypass** (CWE-287, CWE-862, CWE-863)
- **Secrets exposure** (CWE-798 hardcoded credentials, CWE-532 log leakage)
- **Unsafe deserialization** (CWE-502)
- **Path traversal** (CWE-22)
- **Input validation gaps** (CWE-20)

### Taint Analysis
Trace data flow from untrusted sources to sensitive sinks:
- Sources: request params, user input, external APIs, environment variables, file reads
- Sinks: DB queries, file operations, command execution, response rendering, logging

### Confidence Scoring
Assign confidence (0.0-1.0) per finding:
- Base: 0.5 when only a risky pattern is visible
- +0.2 if complete taint flow is traced from source to sink
- +0.1 if CWE classification strongly matches the code path
- +0.1 if verified through read_file or get_symbol_definition
- -0.2 if the finding is only a pattern match without contextual verification

Output JSON matching the SecurityAnalystOutput schema:
{
  "vulnerabilities": [{ "file", "location", "cweId", "type", "severity", "confidence", "description", "taintSource", "taintSink", "remediation" }],
  "authFlowConcerns": [{ "description", "affectedEndpoints", "severity" }],
  "inputValidationGaps": [{ "file", "location", "inputSource", "missingValidation", "severity" }],
  "dataExposureRisks": [{ "file", "location", "dataType", "exposureVector", "severity" }]
}
Return ONLY valid JSON. Do not wrap in markdown fences.`;

// ── MR Description Agent Instructions ──

const CHANGE_ANALYZER_INSTRUCTIONS = `## Change Analyzer Agent
You analyze the diff to produce a structured summary of all changes. Your task:
- **Group changes by scope**: feature, bugfix, refactor, docs, test, infra, config.
- **Detect breaking changes**: API signature changes, removed exports, schema migrations.
- **Extract issue references**: #123, PROJ-456, or similar patterns from diff and commit messages.
- **Detect template hint**: if branch name contains "hotfix/" or "fix/" → "hotfix"; if "release/" or version pattern → "release"; otherwise "default".
- **Note migrations**: database migrations, config changes, dependency updates.

Use the tools to read related files if you need more context about the intent of changes.

Output your findings as JSON matching the ChangeAnalyzerOutput schema:
{
  "changeGroups": [{ "scope", "files", "summary", "breakingChange" }],
  "detectedIssueRefs": [],
  "migrationNotes": [],
  "templateHint": "default | release | hotfix"
}
Return ONLY valid JSON. Do not wrap in markdown fences.`;

const CONTEXT_INVESTIGATOR_INSTRUCTIONS = `## Context Investigator Agent
You investigate the broader impact of the changes beyond what the diff shows. Your task:
- **Identify impacted modules**: which parts of the system are affected by these changes.
- **Assess risks**: deployment risks, data risks, performance risks.
- **Gather related context**: read related files, check dependencies, understand the architecture around the changes.
- **Evaluate backward compatibility**: will existing consumers/APIs/schemas still work?
- **Rollback notes**: what would need to happen to revert these changes safely.

Use the tools extensively to read files, find references, and understand the dependency graph.

Output your findings as JSON matching the ContextInvestigatorOutput schema:
{
  "impactedModules": [],
  "risks": [{ "description", "severity" }],
  "relatedContext": [],
  "backwardCompatibility": "",
  "rollbackNotes": ""
}
Return ONLY valid JSON. Do not wrap in markdown fences.`;

export class AgentPromptBuilder {
  constructor(
    private readonly budgetManager: ContextBudgetManager,
    private readonly tokenEstimator: TokenEstimatorService,
  ) {}

  private buildReviewAgentSystemMessage(
    ctx: AgentPromptBuildContext,
    roleInstructions: string,
  ): string {
    const sections: string[] = [];

    sections.push(`**IMPORTANT: You MUST respond in ${ctx.language} language. All sections, titles, explanations, and comments must be written in ${ctx.language}.**`);

    if (ctx.customSystemPrompt?.trim()) {
      sections.push(`## Custom Review Context\n\n${ctx.customSystemPrompt.trim()}`);
    }

    if (ctx.customAgentInstructions?.trim()) {
      sections.push(`## Custom Review Agents\n\n${ctx.customAgentInstructions.trim()}`);
    }

    if (ctx.customRules?.trim()) {
      sections.push(
        `## Custom Review Rules\n\nApply these project-specific rules in addition to the role instructions below:\n\n${ctx.customRules.trim()}`,
      );
    }

    sections.push(roleInstructions);
    return sections.join('\n\n');
  }

  private appendReviewMemoryContext(
    parts: string[],
    ctx: AgentPromptBuildContext,
    options: { historyLimit: number; patternLimit: number; role: string },
  ): void {
    if (ctx.relevantPatterns?.length) {
      const patternText = ctx.relevantPatterns
        .slice(0, options.patternLimit)
        .map((pattern) =>
          `- [${pattern.category}] ${pattern.description} ` +
          `(seen ${pattern.frequencyCount} times, last: ${new Date(pattern.lastSeen).toLocaleDateString()})`,
        )
        .join('\n');
      parts.push('## Project Patterns from Previous Reviews\n' + patternText);
    }

    if (ctx.relevantHistory?.length) {
      const historyText = ctx.relevantHistory
        .slice(0, options.historyLimit)
        .map((history) =>
          `- Review ${new Date(history.timestamp).toLocaleDateString()}: ${history.qualityVerdict}. ` +
          `${Object.entries(history.issueCounts)
            .map(([severity, count]) => `${count} ${severity}`)
            .join(', ') || 'No tracked issues'}`,
        )
        .join('\n');
      parts.push(`## Recent Review History for ${options.role}\n${historyText}`);
    }

    if (ctx.resolutionStats) {
      parts.push(
        '## Resolution Signals\n' +
        `Overall resolution rate: ${((ctx.resolutionStats.overallRate ?? 0) * 100).toFixed(0)}%\n` +
        `Agent rates: ${Object.entries(ctx.resolutionStats.byAgent ?? {})
          .map(([agent, rate]) => `${agent}=${((rate ?? 0) * 100).toFixed(0)}%`)
          .join(', ') || 'N/A'}`,
      );
    }
  }

  private summarizeAllFindings(
    reports: Array<{ label: string; lines: string[] }>,
  ): string {
    return reports
      .filter((report) => report.lines.length > 0)
      .map((report) => `## ${report.label}\n${report.lines.join('\n')}`)
      .join('\n\n');
  }

  private formatSuppressedFindings(suppressed: SuppressedFinding[]): string {
    if (suppressed.length === 0) {
      return 'None';
    }

    return suppressed
      .slice(0, 20)
      .map((finding) =>
        `- ${finding.issueCategory} in ${finding.filePattern} ` +
        `(dismissed ${new Date(finding.dismissedAt).toLocaleDateString()})`,
      )
      .join('\n');
  }

  private isCrossValidated(
    issue: CodeReviewerOutput['issues'][number],
    securityFindings?: SecurityAnalystOutput,
  ): boolean {
    return (securityFindings?.vulnerabilities ?? []).some((vulnerability) =>
      vulnerability.file === issue.file &&
      this.wordOverlapRatio(issue.description, vulnerability.description) > 0.4,
    );
  }

  // ────────────────────────────────────────────
  // Public: Code Reviewer prompt (Phase 1)
  // ────────────────────────────────────────────
  buildCodeReviewerPrompt(
    ctx: AgentPromptBuildContext,
    budget: AgentBudgetAllocation,
  ): AgentPrompt {
    const systemMessage = this.buildReviewAgentSystemMessage(ctx, CODE_REVIEWER_INSTRUCTIONS);

    // Prompt assembly
    const parts: string[] = [];

    // 0. Agent briefing from Context Gatherer (if available)
    const briefing = formatAgentBriefing(ctx, 'Code Reviewer');
    if (briefing) { parts.push(briefing); }

    // 1. Full diff (truncated to diffBudget)
    parts.push('## Diff\n' + truncateToTokenBudget(ctx.fullDiff, budget.diffBudget));

    // 2. Reference context (truncated to referenceBudget)
    if (ctx.referenceContext) {
      parts.push(
        '## Reference Context\n' +
          truncateToTokenBudget(ctx.referenceContext, budget.referenceBudget),
      );
    }

    // 3. Dependency graph serialized as 'full'
    if (ctx.dependencyGraph) {
      const graphText = DependencyGraphIndex.serializeForPrompt(ctx.dependencyGraph, 'full');
      // Remaining budget after diff + reference
      const usedTokens = Math.ceil(parts.join('\n\n').length / 4);
      const remaining = Math.max(0, budget.totalBudget - usedTokens - budget.sharedContextBudget);
      parts.push(truncateToTokenBudget(graphText, remaining));
    }

    // 4. Shared context from store
    if (ctx.sharedContextStore) {
      const shared = (ctx.sharedContextStore as ISharedContextStore).serializeForAgent(
        'Code Reviewer',
        budget.sharedContextBudget,
      );
      if (shared) {
        parts.push('## Shared Context\n' + shared);
      }
    }

    this.appendReviewMemoryContext(parts, ctx, {
      historyLimit: 2,
      patternLimit: 10,
      role: 'Code Reviewer',
    });

    const prompt = parts.join('\n\n');

    // Tools: all 6 existing + queryContext
    const tools = combineTools([
      findReferencesTool,
      getDiagnosticsTool,
      readFileTool,
      getSymbolDefinitionTool,
      searchCodeTool,
      getRelatedFilesTool,
      queryContextTool,
    ], ctx.additionalTools);

    return {
      role: 'Code Reviewer',
      systemMessage,
      prompt,
      tools,
      phase: 1,
      outputSchema: 'code-reviewer',
      selfAudit: true,
      maxIterations: 3,
      sharedStore: ctx.sharedContextStore,
      compareBranch: ctx.compareBranch,
      gitService: ctx.gitService,
    };
  }

  buildSecurityAgentPrompt(
    ctx: AgentPromptBuildContext,
    budget: AgentBudgetAllocation,
  ): AgentPrompt {
    const systemMessage = this.buildReviewAgentSystemMessage(ctx, SECURITY_AGENT_INSTRUCTIONS);
    const parts: string[] = [];

    const secBriefing = formatAgentBriefing(ctx, 'Security Analyst');
    if (secBriefing) { parts.push(secBriefing); }

    parts.push('## Diff\n' + truncateToTokenBudget(ctx.fullDiff, budget.diffBudget));

    if (ctx.referenceContext) {
      parts.push(
        '## Reference Context\n' +
          truncateToTokenBudget(ctx.referenceContext, budget.referenceBudget),
      );
    }

    if (ctx.dependencyGraph) {
      const graphText = DependencyGraphIndex.serializeForPrompt(ctx.dependencyGraph, 'full');
      const usedTokens = Math.ceil(parts.join('\n\n').length / 4);
      const remaining = Math.max(0, budget.totalBudget - usedTokens - budget.sharedContextBudget);
      parts.push(truncateToTokenBudget(graphText, remaining));
    }

    if (ctx.sharedContextStore) {
      const shared = (ctx.sharedContextStore as ISharedContextStore).serializeForAgent(
        'Security Analyst',
        budget.sharedContextBudget,
      );
      if (shared) {
        parts.push('## Shared Context\n' + shared);
      }
    }

    this.appendReviewMemoryContext(parts, ctx, {
      historyLimit: 2,
      patternLimit: 10,
      role: 'Security Analyst',
    });

    const prompt = parts.join('\n\n');
    const tools = combineTools([
      searchCodeTool,
      findReferencesTool,
      readFileTool,
      getSymbolDefinitionTool,
      getDiagnosticsTool,
      queryContextTool,
    ], ctx.additionalTools);

    return {
      role: 'Security Analyst',
      systemMessage,
      prompt,
      tools,
      phase: 1,
      outputSchema: 'security-analyst',
      selfAudit: true,
      maxIterations: 3,
      sharedStore: ctx.sharedContextStore,
      compareBranch: ctx.compareBranch,
      gitService: ctx.gitService,
    };
  }

  // ────────────────────────────────────────────
  // Public: Flow Diagram prompt (Phase 1)
  // ────────────────────────────────────────────
  buildFlowDiagramPrompt(
    ctx: AgentPromptBuildContext,
    budget: AgentBudgetAllocation,
  ): AgentPrompt {
    const systemMessage = this.buildReviewAgentSystemMessage(ctx, FLOW_DIAGRAM_INSTRUCTIONS);

    const parts: string[] = [];

    const flowBriefing = formatAgentBriefing(ctx, 'Flow Diagram');
    if (flowBriefing) { parts.push(flowBriefing); }

    // 1. Structural diff only (truncated to diffBudget)
    const structuralDiff = this.filterStructuralDiff(ctx.fullDiff, ctx.changedFiles);
    parts.push('## Structural Diff\n' + truncateToTokenBudget(structuralDiff, budget.diffBudget));

    // 2. Dependency graph serialized as 'critical-paths'
    if (ctx.dependencyGraph) {
      const graphText = DependencyGraphIndex.serializeForPrompt(
        ctx.dependencyGraph,
        'critical-paths',
      );
      parts.push(graphText);
    }

    // 3. Shared context from store
    if (ctx.sharedContextStore) {
      const shared = (ctx.sharedContextStore as ISharedContextStore).serializeForAgent(
        'Flow Diagram',
        budget.sharedContextBudget,
      );
      if (shared) {
        parts.push('## Shared Context\n' + shared);
      }
    }

    const prompt = parts.join('\n\n');

    const tools = combineTools([
      findReferencesTool,
      getRelatedFilesTool,
      readFileTool,
      getSymbolDefinitionTool,
      queryContextTool,
    ], ctx.additionalTools);

    return {
      role: 'Flow Diagram',
      systemMessage,
      prompt,
      tools,
      phase: 1,
      outputSchema: 'flow-diagram',
      selfAudit: true,
      maxIterations: 3,
      sharedStore: ctx.sharedContextStore,
      compareBranch: ctx.compareBranch,
      gitService: ctx.gitService,
    };
  }

  // ────────────────────────────────────────────
  // Public: Observer prompt (Phase 2)
  // ────────────────────────────────────────────
  buildObserverPrompt(
    ctx: AgentPromptBuildContext,
    budget: AgentBudgetAllocation,
  ): AgentPrompt {
    let roleInstructions = OBSERVER_INSTRUCTIONS;

    const hypotheses = ctx.riskHypotheses ?? [];
    if (hypotheses.length > 0) {
      roleInstructions += '\n' + OBSERVER_HYPOTHESIS_INSTRUCTIONS;
    }
    const systemMessage = this.buildReviewAgentSystemMessage(ctx, roleInstructions);

    const parts: string[] = [];

    const obsBriefing = formatAgentBriefing(ctx, 'Observer');
    if (obsBriefing) { parts.push(obsBriefing); }

    // 1. Diff summary (NOT full diff)
    parts.push(this.buildDiffSummary(ctx.changedFiles));

    // 2. Shared context from store (Phase 1 findings + hypotheses)
    if (ctx.sharedContextStore) {
      const shared = (ctx.sharedContextStore as ISharedContextStore).serializeForAgent(
        'Observer',
        budget.sharedContextBudget,
      );
      if (shared) {
        parts.push('## Shared Context (Phase 1 Findings)\n' + shared);
      }
    }

    // 3. Dependency graph — only add if NOT already included via shared context.
    // SessionMemory.serializeForAgent skips the legacy parent (which includes graph),
    // so we add a lightweight summary here. SharedContextStoreImpl already includes it.
    if (ctx.dependencyGraph && ctx.sharedContextStore instanceof SessionMemory) {
      const graphText = DependencyGraphIndex.serializeForPrompt(ctx.dependencyGraph, 'summary');
      parts.push(graphText);
    }

    this.appendReviewMemoryContext(parts, ctx, {
      historyLimit: 2,
      patternLimit: 5,
      role: 'Observer',
    });

    const prompt = parts.join('\n\n');

    const tools = combineTools([
      findReferencesTool,
      getSymbolDefinitionTool,
      getDiagnosticsTool,
      getRelatedFilesTool,
      readFileTool,
      queryContextTool,
    ], ctx.additionalTools);

    return {
      role: 'Observer',
      systemMessage,
      prompt,
      tools,
      phase: 2,
      outputSchema: 'observer',
      selfAudit: true,
      maxIterations: 2,
      sharedStore: ctx.sharedContextStore,
      compareBranch: ctx.compareBranch,
      gitService: ctx.gitService,
    };
  }

  buildDetailChangePrompt(
    ctx: AgentPromptBuildContext,
    budget: AgentBudgetAllocation,
  ): AgentPrompt {
    const systemMessage = this.buildReviewAgentSystemMessage(ctx, DETAIL_CHANGE_INSTRUCTIONS);

    const parts: string[] = [];

    const detailBriefing = formatAgentBriefing(ctx, 'Detail Change');
    if (detailBriefing) { parts.push(detailBriefing); }

    parts.push('## Diff\n' + truncateToTokenBudget(ctx.fullDiff, budget.diffBudget));

    if (ctx.referenceContext) {
      parts.push(
        '## Reference Context\n' +
          truncateToTokenBudget(ctx.referenceContext, budget.referenceBudget),
      );
    }

    if (ctx.dependencyGraph) {
      const graphText = DependencyGraphIndex.serializeForPrompt(ctx.dependencyGraph, 'full');
      const usedTokens = Math.ceil(parts.join('\n\n').length / 4);
      const remaining = Math.max(0, budget.totalBudget - usedTokens - budget.sharedContextBudget);
      parts.push(truncateToTokenBudget(graphText, remaining));
    }

    if (ctx.sharedContextStore) {
      const shared = (ctx.sharedContextStore as ISharedContextStore).serializeForAgent(
        'Detail Change',
        budget.sharedContextBudget,
      );
      if (shared) {
        parts.push('## Shared Context\n' + shared);
      }
    }

    const prompt = parts.join('\n\n');

    const tools = combineTools([
      readFileTool,
      searchCodeTool,
      getRelatedFilesTool,
      getSymbolDefinitionTool,
      queryContextTool,
    ], ctx.additionalTools);

    return {
      role: 'Detail Change',
      systemMessage,
      prompt,
      tools,
      phase: 1,
      selfAudit: false,
      maxIterations: 2,
      sharedStore: ctx.sharedContextStore,
      compareBranch: ctx.compareBranch,
      gitService: ctx.gitService,
    };
  }

  buildSummaryDetailAgentPrompt(
    ctx: SynthesisAgentContext,
    budget: AgentBudgetAllocation,
  ): AgentPrompt {
    const systemMessage = `**IMPORTANT: You MUST respond in ${ctx.language} language. All sections, titles, explanations, and comments must be written in ${ctx.language}.**

You write only sections "## 2. Summary of Changes" and "## 3. Detail Change".
Return Markdown only.
- Summary must stay within 100 words.
- Detail Change should explain behavior and flow, not repeat every finding.
- Preserve concrete facts from the provided reports.`;

    const prompt = [
      '## Output Contract',
      ctx.outputContract,
      '## Diff Summary',
      truncateToTokenBudget(ctx.diffSummary, budget.sharedContextBudget),
      '## Detail Change Agent Report',
      ctx.detailChangeReport ?? 'None',
      this.summarizeAllFindings([
        {
          label: 'Code Reviewer Findings',
          lines: (ctx.codeReviewerFindings?.issues ?? []).map(
            (issue) => `- [${issue.severity}] ${issue.file}:${issue.location} — ${issue.description}`,
          ),
        },
        {
          label: 'Security Findings',
          lines: (ctx.securityFindings?.vulnerabilities ?? []).map(
            (vulnerability) =>
              `- [${vulnerability.severity}] ${vulnerability.file}:${vulnerability.location} — ${vulnerability.description}`,
          ),
        },
        {
          label: 'Observer Risks',
          lines: (ctx.observerFindings?.risks ?? []).map(
            (risk) => `- [${risk.severity}] ${risk.affectedArea} — ${risk.description}`,
          ),
        },
      ]),
      'Write both sections now.',
    ].filter(Boolean).join('\n\n');

    return {
      role: 'Summary & Detail',
      systemMessage,
      prompt,
      phase: 3,
      selfAudit: false,
      maxIterations: 2,
    };
  }

  buildImprovementSuggestionsAgentPrompt(
    ctx: SynthesisAgentContext,
    _budget: AgentBudgetAllocation,
  ): AgentPrompt {
    const systemMessage = `**IMPORTANT: You MUST respond in ${ctx.language} language. All sections, titles, explanations, and comments must be written in ${ctx.language}.**

You write only section "## 6. Improvement Suggestions".
Return Markdown only.
- Do not limit the number of suggestions.
- Group findings under category headers such as ### Correctness or ### Security.
- For each finding, preserve provenance tags like [CR], [SA], and [XV].
- Keep confidence scores exactly as provided.
- Add Before/After or Guided Change Snippet blocks when a fix is clear.`;

    const issueLines = (ctx.codeReviewerFindings?.issues ?? []).map((issue) => {
      const tags = this.isCrossValidated(issue, ctx.securityFindings) ? '[XV][CR]' : '[CR]';
      return `${tags} [${issue.category}] ${issue.file}:${issue.location} — ${issue.description} ` +
        `| Fix: ${issue.suggestion} | Confidence: ${Math.round((issue.confidence ?? 0.6) * 100)}%`;
    });

    const securityLines = (ctx.securityFindings?.vulnerabilities ?? [])
      .filter((vulnerability) => (vulnerability.confidence ?? 0) >= 0.5)
      .map((vulnerability) =>
        `[SA] ${vulnerability.file}:${vulnerability.location} — ${vulnerability.cweId} ${vulnerability.description} ` +
        `| Remediation: ${vulnerability.remediation} | Confidence: ${Math.round((vulnerability.confidence ?? 0) * 100)}%`,
      );

    const prompt = [
      '## Output Contract',
      ctx.outputContract,
      this.summarizeAllFindings([
        { label: 'Code Reviewer Findings', lines: issueLines },
        { label: 'Security Findings', lines: securityLines },
      ]),
      '## Suppressed Findings',
      this.formatSuppressedFindings(ctx.suppressedFindings),
      '## Resolution Stats',
      `Overall resolution rate: ${((ctx.resolutionStats?.overallRate ?? 0) * 100).toFixed(0)}%`,
      'Write the improvement suggestions section now.',
    ].join('\n\n');

    return {
      role: 'Improvement Suggestions',
      systemMessage,
      prompt,
      tools: [
        readFileTool,
        searchCodeTool,
        getSymbolDefinitionTool,
        queryContextTool,
      ],
      phase: 3,
      selfAudit: false,
      maxIterations: 2,
    };
  }

  buildRiskTodoAgentPrompt(
    ctx: SynthesisAgentContext,
    _budget: AgentBudgetAllocation,
  ): AgentPrompt {
    const systemMessage = `**IMPORTANT: You MUST respond in ${ctx.language} language. All sections, titles, explanations, and comments must be written in ${ctx.language}.**

You write only sections "## 7. Observer TODO List" and "## 8. Potential Hidden Risks".
Return Markdown only.
- Do not limit the number of TODO items or risks.
- Prefix every TODO with [Sequential] or [Parallel].
- Include rationale, expected outcome, and priority for each TODO.
- Include likelihood, impact, and mitigation for each risk when available.
- Preserve [OB], [SA], and [XV] provenance tags.`;

    const todoLines = (ctx.observerFindings?.todoItems ?? []).map((item) =>
      `${item.parallelizable ? '[Parallel]' : '[Sequential]'} ${item.action} ` +
      `| rationale: ${item.rationale ?? 'Investigate impacted paths'} ` +
      `| expected outcome: ${item.expectedOutcome ?? 'Validated behavior'} ` +
      `| priority: ${item.priority ?? 'medium'}`,
    );

    const riskLines = [
      ...(ctx.observerFindings?.risks ?? []).map((risk) =>
        `[OB] ${risk.affectedArea} — ${risk.description} ` +
        `| confidence: ${Math.round((risk.confidence ?? 0.6) * 100)}% ` +
        `| likelihood: ${risk.likelihood ?? 'medium'} ` +
        `| impact: ${risk.impact ?? 'Needs verification'} ` +
        `| mitigation: ${risk.mitigation ?? 'Add targeted validation'}`,
      ),
      ...(ctx.securityFindings?.vulnerabilities ?? [])
        .filter((vulnerability) => (vulnerability.confidence ?? 0) >= 0.5)
        .map((vulnerability) =>
          `[SA] ${vulnerability.file}:${vulnerability.location} — ${vulnerability.description} ` +
          `| likelihood: high | impact: ${vulnerability.cweId} vulnerability may affect consumers ` +
          `| mitigation: ${vulnerability.remediation}`,
        ),
    ];

    const verdictLines = (ctx.hypothesisVerdicts ?? []).map(
      (verdict) =>
        `- Hypothesis #${verdict.hypothesisIndex}: ${verdict.verdict} — ${verdict.evidence}`,
    );

    const prompt = [
      '## Output Contract',
      ctx.outputContract,
      this.summarizeAllFindings([
        { label: 'Observer TODO Items', lines: todoLines },
        { label: 'Observer Risks', lines: riskLines },
        { label: 'Hypothesis Verdicts', lines: verdictLines },
      ]),
      '## Dependency Graph Summary',
      ctx.dependencyGraphSummary ?? 'None',
      'Write the TODO and hidden risks sections now.',
    ].join('\n\n');

    return {
      role: 'Risk & TODO',
      systemMessage,
      prompt,
      tools: [
        findReferencesTool,
        getRelatedFilesTool,
        readFileTool,
        queryContextTool,
      ],
      phase: 3,
      selfAudit: false,
      maxIterations: 2,
    };
  }

  buildDiagramAssessmentAgentPrompt(
    ctx: SynthesisAgentContext,
    _budget: AgentBudgetAllocation,
  ): AgentPrompt {
    const systemMessage = `**IMPORTANT: You MUST respond in ${ctx.language} language. All sections, titles, explanations, and comments must be written in ${ctx.language}.**

You write only sections "## 4. Flow Diagram" and "## 5. Code Quality Assessment".
Return Markdown only.
- Keep PlantUML blocks intact.
- Add one short description per diagram.
- Use the provided quality verdict and justify it in 2-3 sentences.`;

    const diagrams = (ctx.flowDiagramFindings?.diagrams ?? []).map((diagram) =>
      `### Diagram: ${diagram.name}\n${diagram.description}\n\`\`\`plantuml\n${diagram.plantumlCode}\n\`\`\``,
    );
    const issuesBySeverity = (ctx.codeReviewerFindings?.issues ?? []).map((issue) =>
      `- [${issue.severity}] ${issue.file}:${issue.location} — ${issue.description}`,
    );

    const prompt = [
      '## Output Contract',
      ctx.outputContract,
      '## Flow Diagrams',
      diagrams.length > 0 ? diagrams.join('\n\n') : 'None',
      '## Code Quality Verdict',
      ctx.codeReviewerFindings?.qualityVerdict ?? 'Safe',
      '## Supporting Findings',
      issuesBySeverity.length > 0 ? issuesBySeverity.join('\n') : 'None',
      'Write the flow diagram and code quality assessment sections now.',
    ].join('\n\n');

    return {
      role: 'Diagram & Assessment',
      systemMessage,
      prompt,
      phase: 3,
      selfAudit: false,
      maxIterations: 2,
    };
  }

  // ────────────────────────────────────────────
  // Public: Synthesizer prompt (final merge)
  // ────────────────────────────────────────────
  buildSynthesizerPrompt(
    agentReports: StructuredAgentReport[],
    diffSummary: string,
    detailChangeRawReport?: string,
  ): string {
    // Step 1: Extract structured data from each report
    let crOutput: CodeReviewerOutput | undefined;
    let fdOutput: FlowDiagramOutput | undefined;
    let obsOutput: ObserverOutput | undefined;
    const rawReports: string[] = [];

    for (const report of agentReports) {
      rawReports.push(`### ${report.role} Report\n${report.raw}`);
      if (report.role === 'Code Reviewer') {
        crOutput = report.structured;
      } else if (report.role === 'Flow Diagram') {
        fdOutput = report.structured;
      } else if (report.role === 'Observer') {
        obsOutput = report.structured;
      }
    }

    // Step 2: Deduplicate issues
    const deduplicatedLines: string[] = [];
    const matchedObserverIndices = new Set<number>();

    if (crOutput?.issues && obsOutput?.risks) {
      for (const issue of crOutput.issues) {
        let merged = false;
        for (let i = 0; i < obsOutput.risks.length; i++) {
          if (matchedObserverIndices.has(i)) { continue; }
          const risk = obsOutput.risks[i];
          if (
            risk.affectedArea.includes(issue.file) &&
            this.wordOverlapRatio(issue.description, risk.description) > 0.4
          ) {
            // Merge matched pair
            deduplicatedLines.push(
              `- [${issue.severity}] ${issue.file}:${issue.location} — ${issue.description}` +
              ` | Observer risk: ${risk.description} (${risk.severity})` +
              ` | Suggestion: ${issue.suggestion}`,
            );
            matchedObserverIndices.add(i);
            merged = true;
            break;
          }
        }
        if (!merged) {
          deduplicatedLines.push(
            `- [${issue.severity}] ${issue.file}:${issue.location} — ${issue.description}` +
            ` | Suggestion: ${issue.suggestion}`,
          );
        }
      }
      // Unmatched observer risks
      for (let i = 0; i < obsOutput.risks.length; i++) {
        if (!matchedObserverIndices.has(i)) {
          const risk = obsOutput.risks[i];
          deduplicatedLines.push(
            `- [Observer ${risk.severity}] ${risk.affectedArea} — ${risk.description}`,
          );
        }
      }
    } else if (crOutput?.issues) {
      for (const issue of crOutput.issues) {
        deduplicatedLines.push(
          `- [${issue.severity}] ${issue.file}:${issue.location} — ${issue.description}` +
          ` | Suggestion: ${issue.suggestion}`,
        );
      }
    } else if (obsOutput?.risks) {
      for (const risk of obsOutput.risks) {
        deduplicatedLines.push(
          `- [Observer ${risk.severity}] ${risk.affectedArea} — ${risk.description}`,
        );
      }
    }

    const deduplicatedIssues =
      deduplicatedLines.length > 0
        ? '## Deduplicated Issues\n' + deduplicatedLines.join('\n')
        : '';

    // Step 3: Map hypothesis verdicts to risk sections
    let riskMapping = '';
    if (obsOutput?.hypothesisVerdicts && obsOutput.hypothesisVerdicts.length > 0) {
      const verdictLines = obsOutput.hypothesisVerdicts.map(
        (v) => `- Hypothesis #${v.hypothesisIndex}: **${v.verdict}** — ${v.evidence}`,
      );
      riskMapping = '## Hypothesis Verdicts\n' + verdictLines.join('\n');
    }

    // Step 4: Embed PlantUML diagrams from Flow Diagram
    let diagrams = '';
    if (fdOutput?.diagrams && fdOutput.diagrams.length > 0) {
      const diagramBlocks = fdOutput.diagrams.map(
        (d) =>
          `### Diagram: ${d.name}\n${d.description}\n\n\`\`\`plantuml\n${d.plantumlCode}\n\`\`\``,
      );
      diagrams = '## Flow Diagrams\n' + diagramBlocks.join('\n\n');
    }

    // Step 5: Assemble final prompt
    const detailChangeSection = detailChangeRawReport
      ? '## Detail Change Material\n' + detailChangeRawReport
      : '';

    const rawAgentReports = detailChangeRawReport
      ? [...rawReports, `### Detail Change Report\n${detailChangeRawReport}`]
      : rawReports;

    const sections = [
      REVIEW_OUTPUT_CONTRACT,
      '## Diff Summary\n' + diffSummary,
      detailChangeSection,
      deduplicatedIssues,
      diagrams,
      riskMapping,
      '## Raw Agent Reports\n' + rawAgentReports.join('\n\n'),
    ].filter(Boolean);

    return sections.join('\n\n');
  }

  // ────────────────────────────────────────────
  // Private: filterStructuralDiff
  // ────────────────────────────────────────────
  /** Keep only structural changes (signatures, imports, class/type defs) from a unified diff. */
  filterStructuralDiff(diff: string, changedFiles: UnifiedDiffFile[]): string {
    const lines = diff.split('\n');
    const outputLines: string[] = [];
    let inHunk = false;
    let hunkLines: string[] = [];
    let hunkHeader = '';

    const flushHunk = () => {
      if (!hunkHeader) { return; }

      // Collect indices of structural change lines within the hunk
      const structuralIndices: number[] = [];
      for (let i = 0; i < hunkLines.length; i++) {
        if (STRUCTURAL_LINE_PATTERN.test(hunkLines[i])) {
          structuralIndices.push(i);
        }
      }

      if (structuralIndices.length === 0) {
        // Drop hunk — zero structural changes
        hunkHeader = '';
        hunkLines = [];
        return;
      }

      // Keep structural lines + 2 context lines around each
      const keepSet = new Set<number>();
      for (const idx of structuralIndices) {
        for (let j = Math.max(0, idx - 2); j <= Math.min(hunkLines.length - 1, idx + 2); j++) {
          keepSet.add(j);
        }
      }

      outputLines.push(hunkHeader);
      for (let i = 0; i < hunkLines.length; i++) {
        if (keepSet.has(i)) {
          outputLines.push(hunkLines[i]);
        }
      }

      hunkHeader = '';
      hunkLines = [];
    };

    for (const line of lines) {
      // File headers
      if (line.startsWith('---') || line.startsWith('+++')) {
        if (inHunk) { flushHunk(); inHunk = false; }
        outputLines.push(line);
        continue;
      }

      // Hunk header
      if (line.startsWith('@@')) {
        if (inHunk) { flushHunk(); }
        inHunk = true;
        hunkHeader = line;
        hunkLines = [];
        continue;
      }

      if (inHunk) {
        hunkLines.push(line);
      } else {
        // Lines outside hunks (e.g. diff --git header) — keep
        outputLines.push(line);
      }
    }

    // Flush last hunk
    if (inHunk) { flushHunk(); }

    return outputLines.join('\n');
  }

  // ────────────────────────────────────────────
  // Private: buildDiffSummary
  // ────────────────────────────────────────────
  /** Produce a concise per-file summary: path, status, +added/-removed, affected symbols. */
  buildDiffSummary(changedFiles: UnifiedDiffFile[]): string {
    const fileSummaries: string[] = [];

    for (const file of changedFiles) {
      let added = 0;
      let removed = 0;
      const symbols = new Set<string>();

      const diffLines = (file.diff ?? '').split('\n');
      for (const line of diffLines) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          added++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          removed++;
        }

        // Extract function/class names from @@ hunk headers
        if (line.startsWith('@@')) {
          const match = line.match(/@@ .+ @@\s*(.*)/);
          if (match?.[1]) {
            const sym = match[1].trim();
            if (sym) { symbols.add(sym); }
          }
        }
      }

      const symbolStr = symbols.size > 0 ? [...symbols].join(', ') : 'N/A';
      fileSummaries.push(
        `- ${file.relativePath} (${file.statusLabel}): +${added}/-${removed} lines, affects: ${symbolStr}`,
      );
    }

    return '## Changed Files Summary\n' + fileSummaries.join('\n');
  }

  // ────────────────────────────────────────────
  // Private: wordOverlapRatio
  // ────────────────────────────────────────────
  /** Compute word overlap ratio between two strings (words > 3 chars). */
  wordOverlapRatio(a: string, b: string): number {
    const toWords = (s: string) =>
      new Set(
        s
          .split(/\s+/)
          .map((w) => w.toLowerCase())
          .filter((w) => w.length > 3),
      );

    const setA = toWords(a);
    const setB = toWords(b);

    if (setA.size === 0 || setB.size === 0) {
      return 0;
    }

    let intersectionSize = 0;
    for (const word of setA) {
      if (setB.has(word)) {
        intersectionSize++;
      }
    }

    return intersectionSize / Math.min(setA.size, setB.size);
  }

  // ────────────────────────────────────────────
  // MR Description Agents
  // ────────────────────────────────────────────

  /** Build prompt for Change Analyzer (Phase 1) — groups changes, detects breaking changes, issue refs */
  buildChangeAnalyzerPrompt(
    ctx: AgentPromptBuildContext,
    budget: AgentBudgetAllocation,
  ): AgentPrompt {
    const systemMessage = CHANGE_ANALYZER_INSTRUCTIONS;

    const parts: string[] = [];

    // Full diff — the analyzer needs to see everything to group correctly
    parts.push('## Diff\n' + truncateToTokenBudget(ctx.fullDiff, budget.diffBudget));

    // Branch info for template routing
    if (ctx.compareBranch) {
      parts.push(`## Branch Info\nCompare branch: ${ctx.compareBranch}`);
    }
    if (ctx.taskInfo) {
      parts.push(`## Task Context\n${ctx.taskInfo}`);
    }

    // Dependency graph as summary
    if (ctx.dependencyGraph) {
      const graphText = DependencyGraphIndex.serializeForPrompt(ctx.dependencyGraph, 'summary');
      parts.push(graphText);
    }

    const prompt = parts.join('\n\n');

    const tools: FunctionCall[] = [
      readFileTool,
      searchCodeTool,
      getRelatedFilesTool,
      queryContextTool,
    ];

    return {
      role: 'Change Analyzer',
      systemMessage,
      prompt,
      tools,
      phase: 1,
      selfAudit: false,
      maxIterations: 2,
      sharedStore: ctx.sharedContextStore,
      compareBranch: ctx.compareBranch,
      gitService: ctx.gitService,
    };
  }

  /** Build prompt for Context Investigator (Phase 1, parallel) — impact analysis, risks, compatibility */
  buildContextInvestigatorPrompt(
    ctx: AgentPromptBuildContext,
    budget: AgentBudgetAllocation,
  ): AgentPrompt {
    const systemMessage = CONTEXT_INVESTIGATOR_INSTRUCTIONS;

    const parts: string[] = [];

    // Diff summary (not full diff — investigator focuses on impact, not line-by-line)
    parts.push(this.buildDiffSummary(ctx.changedFiles));

    // Reference context
    if (ctx.referenceContext) {
      parts.push(
        '## Reference Context\n' +
          truncateToTokenBudget(ctx.referenceContext, budget.referenceBudget),
      );
    }

    // Full dependency graph for impact analysis
    if (ctx.dependencyGraph) {
      const graphText = DependencyGraphIndex.serializeForPrompt(ctx.dependencyGraph, 'full');
      const usedTokens = Math.ceil(parts.join('\n\n').length / 4);
      const remaining = Math.max(0, budget.totalBudget - usedTokens - budget.sharedContextBudget);
      parts.push(truncateToTokenBudget(graphText, remaining));
    }

    // Shared context from store
    if (ctx.sharedContextStore) {
      const shared = (ctx.sharedContextStore as ISharedContextStore).serializeForAgent(
        'Context Investigator',
        budget.sharedContextBudget,
      );
      if (shared) {
        parts.push('## Shared Context\n' + shared);
      }
    }

    const prompt = parts.join('\n\n');

    const tools: FunctionCall[] = [
      findReferencesTool,
      readFileTool,
      getRelatedFilesTool,
      getSymbolDefinitionTool,
      queryContextTool,
    ];

    return {
      role: 'Context Investigator',
      systemMessage,
      prompt,
      tools,
      phase: 1,
      selfAudit: false,
      maxIterations: 2,
      sharedStore: ctx.sharedContextStore,
      compareBranch: ctx.compareBranch,
      gitService: ctx.gitService,
    };
  }

  /** Build synthesizer prompt for MR description — assembles findings into final description */
  buildDescriptionSynthesizerPrompt(
    agentReports: DescriptionAgentReport[],
    diffSummary: string,
    descriptionSystemPrompt: string,
    baseBranch?: string,
    compareBranch?: string,
    taskInfo?: string,
  ): string {
    const caReport = agentReports.find(r => r.role === 'Change Analyzer');
    const ciReport = agentReports.find(r => r.role === 'Context Investigator');

    const sections: string[] = [];

    // Branch context
    if (baseBranch || compareBranch) {
      sections.push(`## Branch Info\nBase: ${baseBranch ?? 'N/A'}\nCompare: ${compareBranch ?? 'N/A'}`);
    }
    if (taskInfo) {
      sections.push(`## Task Context\n${taskInfo}`);
    }

    // Diff summary
    sections.push('## Diff Summary\n' + diffSummary);

    // Change Analyzer findings
    if (caReport?.structured) {
      const ca = caReport.structured;
      const groupLines = ca.changeGroups.map(g =>
        `- [${g.scope}${g.breakingChange ? ' BREAKING' : ''}] ${g.summary} (${g.files.join(', ')})`
      );
      sections.push('## Change Analysis\n' + groupLines.join('\n'));

      if (ca.detectedIssueRefs.length > 0) {
        sections.push('## Detected Issue References\n' + ca.detectedIssueRefs.join(', '));
      }
      if (ca.migrationNotes.length > 0) {
        sections.push('## Migration Notes\n' + ca.migrationNotes.map(n => `- ${n}`).join('\n'));
      }
      sections.push(`Template hint: ${ca.templateHint}`);
    }

    // Context Investigator findings
    if (ciReport?.structured) {
      const ci = ciReport.structured;
      if (ci.impactedModules.length > 0) {
        sections.push('## Impacted Modules\n' + ci.impactedModules.map(m => `- ${m}`).join('\n'));
      }
      if (ci.risks.length > 0) {
        sections.push('## Risks\n' + ci.risks.map(r => `- [${r.severity}] ${r.description}`).join('\n'));
      }
      if (ci.backwardCompatibility) {
        sections.push('## Backward Compatibility\n' + ci.backwardCompatibility);
      }
      if (ci.rollbackNotes) {
        sections.push('## Rollback Notes\n' + ci.rollbackNotes);
      }
    }

    // Raw reports as fallback context
    const rawReports = agentReports.map(r => `### ${r.role} Report\n${r.raw}`);
    sections.push('## Raw Agent Reports\n' + rawReports.join('\n\n'));

    // Final instruction
    sections.push(
      'Using ALL the information above, generate the MR description following the system prompt template exactly. ' +
      'Choose the correct template based on the template hint and branch info.'
    );

    return sections.join('\n\n');
  }
}
