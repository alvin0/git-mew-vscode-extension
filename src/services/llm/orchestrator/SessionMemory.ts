import {
  AgentFinding,
  CodeReviewerOutput,
  FlowDiagramOutput,
  ObserverOutput,
  RiskHypothesis,
  SecurityAnalystOutput,
} from './orchestratorTypes';
import {
  ActorRole,
  ALLOWED_TRANSITIONS,
  DuplicateFindingError,
  Evidence_Ref,
  ExecutionPlan,
  Finding,
  FindingFilter,
  FindingNotFoundError,
  FindingStatus,
  Hypothesis,
  HypothesisFilter,
  HypothesisStatus,
  InvalidTransitionError,
} from './executionPlanTypes';
import { ISharedContextStore, SharedContextStoreImpl } from './SharedContextStore';

export interface ISessionMemory extends ISharedContextStore {
  addFinding(finding: Finding, actor: ActorRole): void;
  getFindings(filter?: FindingFilter): Finding[];
  addHypothesis(hypothesis: Hypothesis, actor: ActorRole): void;
  getHypotheses(filter?: HypothesisFilter): Hypothesis[];
  transitionFindingStatus(findingId: string, newStatus: FindingStatus, actor: ActorRole): void;
  transitionHypothesisStatus(hypothesisId: string, newStatus: HypothesisStatus, actor: ActorRole): void;
  getRenderableFindings(): Finding[];
}

export class SessionMemory extends SharedContextStoreImpl implements ISessionMemory {
  private readonly findingsById = new Map<string, Finding>();
  private readonly hypothesesById = new Map<string, Hypothesis>();
  private readonly missingLinkedFindingWarnings = new Set<string>();
  private warnedLegacyBridge = false;

  addFinding(finding: Finding, actor: ActorRole): void {
    this.ensureMutationAllowed(actor);
    if (actor !== 'specialist_agent') {
      throw new InvalidTransitionError(actor, 'create', 'proposed');
    }
    if (this.findingsById.has(finding.id)) {
      throw new DuplicateFindingError(finding.id);
    }

    this.validateEvidenceRefs(finding.evidenceRefs);
    this.validateLinkedFindingIds(finding.linkedFindingIds);
    this.findingsById.set(finding.id, {
      ...finding,
      status: 'proposed',
      evidenceRefs: finding.evidenceRefs.map((ref) => ({ ...ref, lineRange: { ...ref.lineRange } })),
      linkedFindingIds: [...finding.linkedFindingIds],
      lineRange: { ...finding.lineRange },
    });
  }

  getFindings(filter?: FindingFilter): Finding[] {
    const allowedStatuses = filter?.status ?? ['verified', 'proposed'];
    const findings = [...this.findingsById.values()].filter((finding) => {
      if (!allowedStatuses.includes(finding.status)) {
        return false;
      }
      if (filter?.agentRole && finding.agentRole !== filter.agentRole) {
        return false;
      }
      if (filter?.category && finding.category !== filter.category) {
        return false;
      }
      if (filter?.minSeverity && this.severityRank(finding.severity) < this.severityRank(filter.minSeverity)) {
        return false;
      }
      return true;
    });

    return findings.map((finding) => this.cloneFinding(finding));
  }

  addHypothesis(hypothesis: Hypothesis, actor: ActorRole): void {
    this.ensureMutationAllowed(actor);
    if (actor !== 'specialist_agent') {
      throw new InvalidTransitionError(actor, 'create', 'proposed');
    }
    if (this.hypothesesById.has(hypothesis.id)) {
      throw new DuplicateFindingError(hypothesis.id);
    }

    this.validateEvidenceRefs(hypothesis.evidenceRefs);
    this.validateLinkedFindingIds(hypothesis.linkedFindingIds);
    this.hypothesesById.set(hypothesis.id, {
      ...hypothesis,
      status: 'proposed',
      affectedFiles: [...hypothesis.affectedFiles],
      evidenceRefs: hypothesis.evidenceRefs.map((ref) => ({ ...ref, lineRange: { ...ref.lineRange } })),
      linkedFindingIds: [...hypothesis.linkedFindingIds],
    });
  }

  getHypotheses(filter?: HypothesisFilter): Hypothesis[] {
    const allowedStatuses = filter?.status ?? ['verified', 'proposed'];
    return [...this.hypothesesById.values()]
      .filter((hypothesis) => {
        if (!allowedStatuses.includes(hypothesis.status)) {
          return false;
        }
        if (filter?.sourceAgentRole && hypothesis.sourceAgentRole !== filter.sourceAgentRole) {
          return false;
        }
        if (filter?.category && hypothesis.category !== filter.category) {
          return false;
        }
        return true;
      })
      .map((hypothesis) => this.cloneHypothesis(hypothesis));
  }

  transitionFindingStatus(findingId: string, newStatus: FindingStatus, actor: ActorRole): void {
    this.ensureMutationAllowed(actor);
    const finding = this.findingsById.get(findingId);
    if (!finding) {
      throw new FindingNotFoundError(findingId);
    }
    this.validateTransition(actor, finding.status, newStatus);
    this.findingsById.set(findingId, { ...finding, status: newStatus });
  }

  transitionHypothesisStatus(hypothesisId: string, newStatus: HypothesisStatus, actor: ActorRole): void {
    this.ensureMutationAllowed(actor);
    const hypothesis = this.hypothesesById.get(hypothesisId);
    if (!hypothesis) {
      throw new FindingNotFoundError(hypothesisId);
    }
    this.validateTransition(actor, hypothesis.status, newStatus);
    this.hypothesesById.set(hypothesisId, { ...hypothesis, status: newStatus });
  }

  getRenderableFindings(): Finding[] {
    return this.getFindings({ status: ['verified', 'proposed'] });
  }

  setRiskHypotheses(hypotheses: RiskHypothesis[]): void {
    super.setRiskHypotheses(hypotheses);
    const hypothesisCreationActor: ActorRole = 'specialist_agent';
    // HypothesisGenerator seeds proposed hypotheses from specialist outputs before Observer verification.
    for (const [index, hypothesis] of hypotheses.entries()) {
      const id = `hyp-${index}-${this.slug(hypothesis.question)}`;
      if (this.hypothesesById.has(id)) {
        continue;
      }
      this.addHypothesis({
        id,
        sourceAgentRole: hypothesis.source === 'llm' ? 'Observer' : 'Code Reviewer',
        category: hypothesis.category ?? 'correctness',
        description: hypothesis.question,
        affectedFiles: [...hypothesis.affectedFiles],
        confidence: hypothesis.severityEstimate === 'high' ? 0.8 : hypothesis.severityEstimate === 'medium' ? 0.6 : 0.4,
        status: 'proposed',
        evidenceRefs: [],
        linkedFindingIds: [],
      }, hypothesisCreationActor);
    }
  }

  getRiskHypotheses(): RiskHypothesis[] {
    return super.getRiskHypotheses();
  }

  serializeForAgent(agentRole: string, tokenBudget: number): string {
    const findings = this.getRenderableFindings().filter((finding) => finding.agentRole !== agentRole);
    const hypotheses = agentRole === 'Observer' ? this.getHypotheses() : [];
    const sections: string[] = [];

    if (findings.length > 0) {
      sections.push(
        '## Structured Findings\n' +
        findings
          .slice(0, 40)
          .map((finding) =>
            `- [${finding.agentRole}] [${finding.severity}] ${finding.file}:${finding.lineRange.start}-${finding.lineRange.end} ` +
            `${finding.description} | suggestion: ${finding.suggestion} | confidence: ${Math.round(finding.confidence * 100)}%`,
          )
          .join('\n'),
      );
    }

    if (hypotheses.length > 0) {
      sections.push(
        '## Structured Hypotheses\n' +
        hypotheses
          .slice(0, 20)
          .map((hypothesis, index) =>
            `${index + 1}. [${hypothesis.category}] ${hypothesis.description}\n` +
            `   affected: ${hypothesis.affectedFiles.join(', ') || 'N/A'} | confidence: ${Math.round(hypothesis.confidence * 100)}%`,
          )
          .join('\n'),
      );
    }

    // When we have structured findings/hypotheses, skip the legacy parent
    // serialization to avoid duplicating the same data in two formats.
    // Only fall through to super when SessionMemory has no structured data
    // (e.g. legacy bridge path where only AgentFinding[] exists).
    if (sections.length === 0) {
      const inherited = super.serializeForAgent(agentRole, tokenBudget);
      if (inherited) {
        return inherited;
      }
      return '';
    }

    const assembled = sections.join('\n\n');
    const charBudget = Math.max(200, tokenBudget * 4);
    return assembled.length <= charBudget ? assembled : `${assembled.slice(0, charBudget)}\n...[truncated]`;
  }

  /**
   * @deprecated Phase 1/2 bridge. Adaptive path should use addFinding/addHypothesis directly.
   */
  addAgentFindings(agentRole: string, findings: AgentFinding[]): void {
    this.warnLegacyBridgeUsage();
    super.addAgentFindings(agentRole, findings);

    for (const entry of findings) {
      for (const finding of this.convertLegacyAgentFinding(agentRole, entry)) {
        if (!this.findingsById.has(finding.id)) {
          this.addFinding(finding, 'specialist_agent');
        }
      }
    }
  }

  /**
   * @deprecated Phase 1/2 bridge. Adaptive path should use getFindings/getRenderableFindings directly.
   */
  getAgentFindings(agentRole?: string): AgentFinding[] {
    this.warnLegacyBridgeUsage();
    return super.getAgentFindings(agentRole);
  }

  private validateTransition(
    actor: ActorRole,
    currentStatus: FindingStatus | HypothesisStatus,
    targetStatus: FindingStatus | HypothesisStatus,
  ): void {
    const allowedMap = ALLOWED_TRANSITIONS[actor] as Record<string, readonly string[]>;
    const allowed = allowedMap[currentStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new InvalidTransitionError(actor, currentStatus, targetStatus);
    }
  }

  private ensureMutationAllowed(actor: ActorRole): void {
    if (actor === 'section_writer' || actor === 'deterministic_renderer' || actor === 'hybrid_assembly') {
      throw new InvalidTransitionError(actor, 'read-only', 'mutation');
    }
  }

  private validateEvidenceRefs(evidenceRefs: Evidence_Ref[]): void {
    for (const ref of evidenceRefs) {
      if (!ref.file || !Number.isFinite(ref.lineRange.start) || !Number.isFinite(ref.lineRange.end)) {
        throw new Error('Invalid Evidence_Ref');
      }
      if (ref.lineRange.start < 0 || ref.lineRange.end < ref.lineRange.start) {
        throw new Error('Invalid Evidence_Ref lineRange');
      }
      if (typeof ref.diffLineRef !== 'boolean') {
        throw new Error('Invalid Evidence_Ref diffLineRef');
      }
    }
  }

  private validateLinkedFindingIds(ids: string[]): void {
    for (const id of ids) {
      if (!this.findingsById.has(id)) {
        if (!this.missingLinkedFindingWarnings.has(id)) {
          this.missingLinkedFindingWarnings.add(id);
          console.warn(`[SessionMemory] linkedFindingId not found yet: ${id}`);
        }
      }
    }
  }

  private cloneFinding(finding: Finding): Finding {
    return {
      ...finding,
      lineRange: { ...finding.lineRange },
      evidenceRefs: finding.evidenceRefs.map((ref) => ({ ...ref, lineRange: { ...ref.lineRange } })),
      linkedFindingIds: [...finding.linkedFindingIds],
    };
  }

  private cloneHypothesis(hypothesis: Hypothesis): Hypothesis {
    return {
      ...hypothesis,
      affectedFiles: [...hypothesis.affectedFiles],
      evidenceRefs: hypothesis.evidenceRefs.map((ref) => ({ ...ref, lineRange: { ...ref.lineRange } })),
      linkedFindingIds: [...hypothesis.linkedFindingIds],
    };
  }

  private severityRank(severity: Finding['severity']): number {
    switch (severity) {
      case 'critical':
        return 4;
      case 'major':
        return 3;
      case 'minor':
        return 2;
      default:
        return 1;
    }
  }

  private warnLegacyBridgeUsage(): void {
    if (this.warnedLegacyBridge) {
      return;
    }
    this.warnedLegacyBridge = true;
    console.warn('[SessionMemory] addAgentFindings/getAgentFindings are deprecated bridge APIs.');
  }

  private convertLegacyAgentFinding(agentRole: string, entry: AgentFinding): Finding[] {
    if (entry.type === 'issue') {
      const data = entry.data as CodeReviewerOutput;
      return (data.issues ?? []).map((issue, index) => ({
        id: `legacy-cr-${this.slug(issue.file)}-${index}-${this.slug(issue.description)}`,
        agentRole,
        category: issue.category,
        severity: issue.severity,
        confidence: issue.confidence ?? 0.6,
        status: 'proposed',
        file: issue.file,
        lineRange: this.parseLocation(issue.location),
        description: issue.description,
        suggestion: issue.suggestion,
        evidenceRefs: [{
          file: issue.file,
          lineRange: this.parseLocation(issue.location),
          toolResultId: null,
          diffLineRef: true,
        }],
        linkedFindingIds: [],
      }));
    }

    if (entry.type === 'security') {
      const data = entry.data as SecurityAnalystOutput;
      return (data.vulnerabilities ?? []).map((finding, index) => ({
        id: `legacy-sa-${this.slug(finding.file)}-${index}-${this.slug(finding.description)}`,
        agentRole,
        category: 'security',
        severity: finding.severity === 'critical'
          ? 'critical'
          : finding.severity === 'high'
            ? 'major'
            : finding.severity === 'medium'
              ? 'minor'
              : 'suggestion',
        confidence: finding.confidence,
        status: 'proposed',
        file: finding.file,
        lineRange: this.parseLocation(finding.location),
        description: finding.description,
        suggestion: finding.remediation,
        evidenceRefs: [{
          file: finding.file,
          lineRange: this.parseLocation(finding.location),
          toolResultId: null,
          diffLineRef: true,
        }],
        linkedFindingIds: [],
      }));
    }

    if (entry.type === 'risk') {
      const data = entry.data as ObserverOutput;
      return (data.risks ?? []).map((risk, index) => ({
        id: `legacy-ob-${this.slug(risk.affectedArea)}-${index}-${this.slug(risk.description)}`,
        agentRole,
        category: 'integration',
        severity: risk.severity === 'high' ? 'major' : risk.severity === 'medium' ? 'minor' : 'suggestion',
        confidence: risk.confidence ?? 0.6,
        status: 'proposed',
        file: risk.affectedArea,
        lineRange: { start: 0, end: 0 },
        description: risk.description,
        suggestion: risk.mitigation ?? 'Add follow-up validation',
        evidenceRefs: [],
        linkedFindingIds: [],
      }));
    }

    if (entry.type === 'flow') {
      const data = entry.data as FlowDiagramOutput;
      return (data.affectedFlows ?? []).map((flow, index) => ({
        id: `legacy-fd-${index}-${this.slug(flow)}`,
        agentRole,
        category: 'integration',
        severity: 'suggestion',
        confidence: 0.5,
        status: 'proposed',
        file: flow,
        lineRange: { start: 0, end: 0 },
        description: `Affected flow: ${flow}`,
        suggestion: 'Review diagram output for this flow.',
        evidenceRefs: [],
        linkedFindingIds: [],
      }));
    }

    return [];
  }

  private parseLocation(location: string): { start: number; end: number } {
    const match = `${location ?? ''}`.match(/(\d+)/);
    const start = match ? Number(match[1]) : 0;
    return { start, end: start + 1 };
  }

  private slug(text: string): string {
    return (text ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'item';
  }
}
