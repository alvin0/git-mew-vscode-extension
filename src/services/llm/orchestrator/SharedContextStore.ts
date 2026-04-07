import {
  ToolResultCacheEntry,
  AgentFinding,
  DependencyGraphData,
  RiskHypothesis,
  CodeReviewerOutput,
  FlowDiagramOutput,
  SecurityAnalystOutput,
} from './orchestratorTypes';
import { ExecutionPlan } from './executionPlanTypes';
import { ToolExecuteResponse } from '../../../llm-tools/toolInterface';
import { DependencyGraphIndex } from './DependencyGraphIndex';

/**
 * Shared context store interface — Blackboard pattern for multi-agent review sessions.
 * A single instance lives for the duration of one review, allowing agents to share
 * tool results, structured findings, dependency graphs, and risk hypotheses.
 */
export interface ISharedContextStore {
  getToolResult(toolName: string, args: Record<string, unknown>): ToolExecuteResponse | undefined;
  setToolResult(toolName: string, args: Record<string, unknown>, result: ToolExecuteResponse): void;

  addAgentFindings(agentRole: string, findings: AgentFinding[]): void;
  getAgentFindings(agentRole?: string): AgentFinding[];

  getDependencyGraph(): DependencyGraphData | undefined;
  setDependencyGraph(graph: DependencyGraphData): void;
  updateDependencyGraph(patch: Partial<DependencyGraphData>): void;

  setRiskHypotheses(hypotheses: RiskHypothesis[]): void;
  getRiskHypotheses(): RiskHypothesis[];

  setExecutionPlan(plan: ExecutionPlan): void;
  getExecutionPlan(): ExecutionPlan | undefined;

  serializeForAgent(agentRole: string, tokenBudget: number): string;

  getStats(): { toolCacheHits: number; toolCacheMisses: number; totalFindings: number };
}

export class SharedContextStoreImpl implements ISharedContextStore {
  private toolCache = new Map<string, ToolResultCacheEntry>();
  private findings: AgentFinding[] = [];
  private graph: DependencyGraphData | undefined;
  private hypotheses: RiskHypothesis[] = [];
  private executionPlan: ExecutionPlan | undefined;
  private stats = { toolCacheHits: 0, toolCacheMisses: 0 };

  // ── Key Normalization ──

  private normalizeKey(toolName: string, args: Record<string, unknown>): string {
    const sortedArgs: Record<string, unknown> = {};
    for (const key of Object.keys(args).sort()) {
      sortedArgs[key] = args[key];
    }
    return `${toolName}::${JSON.stringify(sortedArgs)}`;
  }

  // ── Tool Result Cache ──

  getToolResult(toolName: string, args: Record<string, unknown>): ToolExecuteResponse | undefined {
    const key = this.normalizeKey(toolName, args);
    const entry = this.toolCache.get(key);
    if (entry) {
      this.stats.toolCacheHits++;
      return entry.result;
    }
    this.stats.toolCacheMisses++;
    return undefined;
  }

  setToolResult(toolName: string, args: Record<string, unknown>, result: ToolExecuteResponse): void {
    const key = this.normalizeKey(toolName, args);
    this.toolCache.set(key, { toolName, normalizedArgs: key, result, timestamp: Date.now() });
  }

  // ── Agent Findings (append-only) ──

  addAgentFindings(agentRole: string, findings: AgentFinding[]): void {
    this.findings.push(...findings);
  }

  getAgentFindings(agentRole?: string): AgentFinding[] {
    if (agentRole) {
      return this.findings.filter(f => f.agentRole === agentRole);
    }
    return [...this.findings];
  }

  // ── Dependency Graph ──

  getDependencyGraph(): DependencyGraphData | undefined {
    return this.graph;
  }

  setDependencyGraph(graph: DependencyGraphData): void {
    this.graph = graph;
  }

  updateDependencyGraph(patch: Partial<DependencyGraphData>): void {
    if (!this.graph) { return; }

    if (patch.fileDependencies) {
      for (const [path, deps] of patch.fileDependencies) {
        const existing = this.graph.fileDependencies.get(path);
        if (existing) {
          existing.imports = [...new Set([...existing.imports, ...deps.imports])];
          existing.importedBy = [...new Set([...existing.importedBy, ...deps.importedBy])];
        } else {
          this.graph.fileDependencies.set(path, { imports: [...deps.imports], importedBy: [...deps.importedBy] });
        }
      }
    }

    if (patch.symbolMap) {
      for (const [name, info] of patch.symbolMap) {
        const existing = this.graph.symbolMap.get(name);
        if (existing) {
          existing.referencedBy = [...new Set([...existing.referencedBy, ...info.referencedBy])];
        } else {
          this.graph.symbolMap.set(name, { ...info });
        }
      }
    }

    if (patch.criticalPaths) {
      this.graph.criticalPaths.push(...patch.criticalPaths);
    }
  }

  // ── Risk Hypotheses ──

  setRiskHypotheses(hypotheses: RiskHypothesis[]): void {
    this.hypotheses = hypotheses;
  }

  getRiskHypotheses(): RiskHypothesis[] {
    return [...this.hypotheses];
  }

  setExecutionPlan(plan: ExecutionPlan): void {
    this.executionPlan = plan;
  }

  getExecutionPlan(): ExecutionPlan | undefined {
    return this.executionPlan;
  }

  // ── Serialization for prompt injection ──

  serializeForAgent(agentRole: string, tokenBudget: number): string {
    const sections: Array<{ priority: number; label: string; content: string }> = [];

    // Priority 1 (highest): Structured agent summaries from OTHER agents
    const agentFindings = this.findings.filter(f => f.agentRole !== agentRole);
    if (agentFindings.length > 0) {
      sections.push({
        priority: 1,
        label: 'Agent Findings',
        content: this.serializeFindings(agentFindings),
      });
    }

    // Priority 2: Risk hypotheses (primarily for Observer)
    if (this.hypotheses.length > 0 && agentRole === 'Observer') {
      sections.push({
        priority: 2,
        label: 'Risk Hypotheses',
        content: this.serializeHypotheses(),
      });
    }

    // Priority 3: Dependency graph
    if (this.graph) {
      const filter: 'full' | 'critical-paths' | 'summary' =
        agentRole === 'Code Reviewer' ? 'full'
        : agentRole === 'Flow Diagram' ? 'critical-paths'
        : 'summary';
      sections.push({
        priority: 3,
        label: 'Dependency Graph',
        content: filter === 'summary'
          ? this.serializeGraphSummary(this.graph)
          : DependencyGraphIndex.serializeForPrompt(this.graph, filter),
      });
    }

    // Priority 4 (lowest): Cached tool results summary
    if (this.toolCache.size > 0) {
      sections.push({
        priority: 4,
        label: 'Cached Tool Results',
        content: this.serializeToolCache(),
      });
    }

    if (sections.length === 0) {
      return '';
    }

    return this.assembleWithinBudget(sections, tokenBudget);
  }

  // ── Stats ──

  getStats(): { toolCacheHits: number; toolCacheMisses: number; totalFindings: number } {
    return {
      toolCacheHits: this.stats.toolCacheHits,
      toolCacheMisses: this.stats.toolCacheMisses,
      totalFindings: this.findings.length,
    };
  }

  // ── Private helpers ──

  /** Simple char/4 token approximation — avoids depending on TokenEstimatorService */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private assembleWithinBudget(
    sections: Array<{ priority: number; label: string; content: string }>,
    tokenBudget: number,
  ): string {
    const byHighestFirst = [...sections].sort((a, b) => a.priority - b.priority);
    const sectionTexts = byHighestFirst.map(s => `## ${s.label}\n${s.content}\n\n`);
    const sectionTokens = sectionTexts.map(t => this.estimateTokens(t));
    const totalNeeded = sectionTokens.reduce((a, b) => a + b, 0);

    if (totalNeeded <= tokenBudget) {
      return sectionTexts.join('');
    }

    // Include from highest priority, skip/truncate when over budget
    const included: string[] = [];
    let usedTokens = 0;

    for (let i = 0; i < byHighestFirst.length; i++) {
      const text = sectionTexts[i];
      const tokens = sectionTokens[i];
      if (usedTokens + tokens <= tokenBudget) {
        included.push(text);
        usedTokens += tokens;
      } else {
        const remaining = tokenBudget - usedTokens;
        if (remaining > 200) {
          const truncated = text.slice(0, remaining * 4);
          included.push(truncated + '\n...[truncated]\n\n');
        }
        break;
      }
    }
    return included.join('');
  }

  private serializeFindings(findings: AgentFinding[]): string {
    return findings.map(f => {
      if (f.type === 'issue') {
        const data = f.data as CodeReviewerOutput;
        if (!data.issues) { return `### From ${f.agentRole}\n${JSON.stringify(f.data, null, 2)}`; }
        return `### From ${f.agentRole}\n` +
          `Issues: ${data.issues.length}\n` +
          data.issues.map(i => `- [${i.severity}] ${i.file}:${i.location} — ${i.description}`).join('\n') +
          `\nAffected symbols: ${data.affectedSymbols.join(', ')}\n` +
          `Quality: ${data.qualityVerdict}`;
      }
      if (f.type === 'flow') {
        const data = f.data as FlowDiagramOutput;
        if (!data.diagrams) { return `### From ${f.agentRole}\n${JSON.stringify(f.data, null, 2)}`; }
        return `### From ${f.agentRole}\n` +
          `Diagrams: ${data.diagrams.length}\n` +
          data.diagrams.map(d => `- ${d.name} (${d.type}): ${d.description}`).join('\n') +
          `\nAffected flows: ${data.affectedFlows.join(', ')}`;
      }
      if (f.type === 'security') {
        const data = f.data as SecurityAnalystOutput;
        if (!data.vulnerabilities) { return `### From ${f.agentRole}\n${JSON.stringify(f.data, null, 2)}`; }
        const vulnerabilities = data.vulnerabilities
          .map((v) =>
            `- [${v.severity}] ${v.file}:${v.location} — ${v.cweId}: ${v.description} ` +
            `(confidence: ${(v.confidence ?? 0).toFixed(2)})`,
          )
          .join('\n');
        const authConcerns = data.authFlowConcerns?.length
          ? `\nAuth concerns:\n${data.authFlowConcerns.map((c) => `- [${c.severity}] ${c.description}`).join('\n')}`
          : '';
        return `### From ${f.agentRole}\n` +
          `Vulnerabilities: ${data.vulnerabilities.length}\n` +
          vulnerabilities +
          authConcerns;
      }
      return `### From ${f.agentRole}\n${JSON.stringify(f.data, null, 2)}`;
    }).join('\n\n');
  }

  private serializeHypotheses(): string {
    return this.hypotheses.map((h, i) =>
      `${i + 1}. [${h.severityEstimate}] ${h.question}\n` +
      `   Affected: ${h.affectedFiles.join(', ')}\n` +
      `   Evidence needed: ${h.evidenceNeeded}`
    ).join('\n');
  }

  private serializeGraphSummary(graph: DependencyGraphData): string {
    const lines = [
      `Files: ${graph.fileDependencies.size}`,
      `Symbols: ${graph.symbolMap.size}`,
      `Critical Paths: ${graph.criticalPaths.length}`,
    ];

    if (graph.criticalPaths.length > 0) {
      lines.push('', 'Top Critical Paths:');
      for (const criticalPath of graph.criticalPaths) {
        lines.push(`- ${criticalPath.description}`);
      }
    }

    return lines.join('\n');
  }

  private serializeToolCache(): string {
    const entries = [...this.toolCache.values()];
    if (entries.length === 0) { return ''; }
    return `Cached results: ${entries.length} tool calls\n` +
      entries.slice(0, 20).map(e =>
        `- ${e.toolName}(${e.normalizedArgs.split('::')[1]?.slice(0, 80) ?? '...'})`
      ).join('\n');
  }

}
