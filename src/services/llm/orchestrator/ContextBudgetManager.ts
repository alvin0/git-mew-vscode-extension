import { BudgetManagerConfig, AgentBudgetAllocation } from './orchestratorTypes';
import { TokenEstimatorService } from '../TokenEstimatorService';
import { ExecutionPlan } from './executionPlanTypes';

export const DEFAULT_BUDGET_CONFIG: BudgetManagerConfig = {
  referenceContextRatio: 0.40,
  minReferenceTokens: 80_000,
  maxSymbolsFormula: (cw: number) => Math.min(Math.floor(cw / 2500), 120),
  maxFilesFormula: (cw: number) => Math.min(Math.floor(cw / 5000), 40),
  agentBudgetRatios: {
    'Code Reviewer': 0.30,
    'Flow Diagram': 0.20,
    'Observer': 0.20,
    'Security Analyst': 0.30,
  },
  safetyThreshold: 0.85,
};

/** @deprecated Will be removed after Phase 3 stabilization. */
export const SYNTHESIS_BUDGET_RATIOS: Record<string, number> = {
  'Summary & Detail': 0.15,
  'Improvement Suggestions': 0.40,
  'Risk & TODO': 0.30,
  'Diagram & Assessment': 0.15,
};

/** Diff budget ratios per agent role (fraction of total diffTokens) */
const DIFF_BUDGET_RATIOS: Record<string, number> = {
  'Code Reviewer': 1.00,
  'Flow Diagram': 0.35,
  'Observer': 0.15,
  'Security Analyst': 1.00,
  'Change Analyzer': 1.00,
  'Context Investigator': 0.25,
};

/** Reference budget ratios per agent role (fraction of total referenceBudget) */
const REFERENCE_BUDGET_RATIOS: Record<string, number> = {
  'Code Reviewer': 0.50,
  'Flow Diagram': 0.30,
  'Observer': 0.20,
  'Security Analyst': 0.50,
  'Change Analyzer': 0.35,
  'Context Investigator': 0.65,
};

/** Budget config for MR description generation (2 agents instead of 3) */
export const DESCRIPTION_BUDGET_CONFIG: BudgetManagerConfig = {
  referenceContextRatio: 0.40,
  minReferenceTokens: 80_000,
  maxSymbolsFormula: (cw: number) => Math.min(Math.floor(cw / 2500), 120),
  maxFilesFormula: (cw: number) => Math.min(Math.floor(cw / 5000), 40),
  agentBudgetRatios: {
    'Change Analyzer': 0.55,
    'Context Investigator': 0.45,
  },
  safetyThreshold: 0.85,
};

export class ContextBudgetManager {
  constructor(
    private readonly config: BudgetManagerConfig,
    private readonly tokenEstimator: TokenEstimatorService
  ) {}

  /** Tính reference context budget dựa trên context window thực tế */
  computeReferenceContextBudget(contextWindow: number): number {
    const computed = Math.floor(contextWindow * this.config.referenceContextRatio);
    const minimum = this.config.minReferenceTokens;

    if (computed >= minimum) {
      return computed;
    }

    // Context window nhỏ: kiểm tra có đủ chỗ cho minimum không
    const maxAvailable = contextWindow - Math.floor(contextWindow * 0.20);

    if (maxAvailable >= minimum) {
      return minimum;
    }

    // Không đủ chỗ cho minimum → dùng tối đa khả dụng, log warning
    console.warn(
      `[ContextBudgetManager] Context window ${contextWindow} too small for ` +
      `minimum reference budget ${minimum}. Using ${maxAvailable} tokens.`
    );
    return Math.max(4500, maxAvailable);
  }

  /** Tính dynamic MAX_SYMBOLS_TOTAL */
  computeMaxSymbols(contextWindow: number): number {
    return this.config.maxSymbolsFormula(contextWindow);
  }

  /** Tính dynamic MAX_EXPANDED_REFERENCE_FILES */
  computeMaxReferenceFiles(contextWindow: number): number {
    return this.config.maxFilesFormula(contextWindow);
  }

  /** Phân bổ budget cho từng agent */
  allocateAgentBudgets(
    contextWindow: number,
    maxOutputTokens: number,
    systemMessageTokens: number,
    diffTokens: number
  ): AgentBudgetAllocation[] {
    const safetyMargin = contextWindow > 128_000
      ? 8192
      : contextWindow > 32_000
        ? 4096
        : 2048;

    const totalInputBudget = contextWindow - safetyMargin;
    const availableForAgents = totalInputBudget - systemMessageTokens;
    const referenceBudget = this.computeReferenceContextBudget(contextWindow);
    const remainingAfterReference = availableForAgents - referenceBudget;

    const allocations: AgentBudgetAllocation[] = [];

    for (const [role, ratio] of Object.entries(this.config.agentBudgetRatios)) {
      const agentTotal = Math.floor(remainingAfterReference * ratio);
      const diffBudgetRatio = DIFF_BUDGET_RATIOS[role] ?? 0;
      const refBudgetRatio = REFERENCE_BUDGET_RATIOS[role] ?? 0;

      allocations.push({
        agentRole: role,
        totalBudget: agentTotal,
        diffBudget: Math.floor(diffTokens * diffBudgetRatio),
        referenceBudget: Math.floor(referenceBudget * refBudgetRatio),
        sharedContextBudget: Math.floor(agentTotal * 0.30),
        reservedForOutput: maxOutputTokens,
      });
    }

    return allocations;
  }

  computeAllocatablePool(
    contextWindow: number,
    systemTokens: number,
    referenceTokens: number,
  ): number {
    const safetyMargin = this.getSafetyMargin(contextWindow);
    return Math.max(0, contextWindow - safetyMargin - systemTokens - referenceTokens);
  }

  /**
   * Allocate per-agent budgets from an ExecutionPlan.
   *
   * IMPORTANT: Each agent makes an independent LLM call and can use up to the
   * full context window. The ratios in ExecutionPlan.agentBudgets control how
   * each agent's per-call budget is split between diff, reference, and shared
   * context — they do NOT divide the context window among agents.
   */
  allocateFromExecutionPlan(
    plan: ExecutionPlan | undefined,
    contextWindow: number,
    maxOutputTokens: number,
    systemMessageTokens: number,
    diffTokens: number,
    actualReferenceTokens?: number,
  ): AgentBudgetAllocation[] {
    if (!plan || !plan.agentBudgets || Object.keys(plan.agentBudgets).length === 0) {
      return this.allocateAgentBudgets(contextWindow, maxOutputTokens, systemMessageTokens, diffTokens);
    }

    const safetyMargin = this.getSafetyMargin(contextWindow);
    // Each agent gets the full context window minus safety and system overhead.
    const perAgentBudget = Math.max(0, contextWindow - safetyMargin - systemMessageTokens);
    const effectiveReferenceTokens = actualReferenceTokens ?? 0;

    const allocations = Object.entries(plan.agentBudgets).map(([agentRole, ratio]) => {
      // ratio controls how much of the diff this agent should receive relative
      // to other agents. An agent with ratio 1.0 gets the full diff; 0.35 gets 35%.
      const diffBudgetRatio = DIFF_BUDGET_RATIOS[agentRole] ?? ratio;
      const agentDiffBudget = Math.min(
        Math.floor(diffTokens * diffBudgetRatio),
        perAgentBudget,
      );
      const refBudgetRatio = REFERENCE_BUDGET_RATIOS[agentRole] ?? 0.2;
      const agentReferenceBudget = Math.min(
        Math.floor(effectiveReferenceTokens * refBudgetRatio),
        Math.max(0, perAgentBudget - agentDiffBudget),
      );
      const sharedContextBudget = Math.max(
        0,
        perAgentBudget - agentDiffBudget - agentReferenceBudget,
      );

      return {
        agentRole,
        totalBudget: perAgentBudget,
        diffBudget: agentDiffBudget,
        referenceBudget: agentReferenceBudget,
        sharedContextBudget,
        reservedForOutput: maxOutputTokens,
      };
    });

    return allocations;
  }

  allocateSectionWriterBudgets(
    plan: ExecutionPlan,
    contextWindow: number,
    maxOutputTokens: number,
    systemMessageTokens: number,
  ): AgentBudgetAllocation[] {
    if (!plan.sectionWriters.summary && !plan.sectionWriters.improvements) {
      return [];
    }

    const safetyMargin = this.getSafetyMargin(contextWindow);
    const availablePool = Math.max(0, contextWindow - safetyMargin - systemMessageTokens);
    const enabledWriters = Object.entries(plan.sectionWriters)
      .filter(([, enabled]) => enabled)
      .map(([section]) => section);

    const explicitBudgets = {
      summary: plan.sectionWriterBudgets?.summary,
      improvements: plan.sectionWriterBudgets?.improvements,
    };

    const derivedRatios = {
      summary: 0.15,
      improvements: 0.40,
    };

    return enabledWriters.map((section) => {
      const explicit = explicitBudgets[section as 'summary' | 'improvements'];
      const totalBudget = explicit
        ? Math.min(explicit, availablePool)
        : Math.floor(availablePool * derivedRatios[section as 'summary' | 'improvements']);

      return {
        agentRole: section === 'summary' ? 'Summary Writer' : 'Improvement Writer',
        totalBudget,
        diffBudget: 0,
        referenceBudget: 0,
        sharedContextBudget: totalBudget,
        reservedForOutput: maxOutputTokens,
      };
    });
  }

  /** @deprecated Will be removed after Phase 3 stabilization. */
  allocateSynthesisBudgets(
    contextWindow: number,
    maxOutputTokens: number,
    systemMessageTokens: number,
  ): AgentBudgetAllocation[] {
    const safetyMargin = this.getSafetyMargin(contextWindow);

    const totalInputBudget = Math.max(0, contextWindow - safetyMargin - systemMessageTokens);
    return Object.entries(SYNTHESIS_BUDGET_RATIOS).map(([agentRole, ratio]) => {
      const totalBudget = Math.floor(totalInputBudget * ratio);
      return {
        agentRole,
        totalBudget,
        diffBudget: 0,
        referenceBudget: 0,
        sharedContextBudget: Math.floor(totalBudget * 0.8),
        reservedForOutput: maxOutputTokens,
      };
    });
  }

  /** Kiểm tra và giảm proportionally nếu vượt safety threshold */
  enforceGlobalBudget(
    allocations: AgentBudgetAllocation[],
    contextWindow: number
  ): AgentBudgetAllocation[] {
    return this.enforceSafetyThreshold(allocations, contextWindow, this.config.safetyThreshold);
  }

  private enforceSafetyThreshold(
    allocations: AgentBudgetAllocation[],
    contextWindow: number,
    threshold: number,
  ): AgentBudgetAllocation[] {
    const safetyLimit = Math.floor(contextWindow * threshold);

    const totalEstimated = allocations.reduce(
      (sum, a) => sum + a.diffBudget + a.referenceBudget + a.sharedContextBudget,
      0
    );

    if (totalEstimated <= safetyLimit) {
      return allocations;
    }

    const overageRatio = safetyLimit / totalEstimated;

    return allocations.map((a) => ({
      ...a,
      referenceBudget: Math.floor(a.referenceBudget * overageRatio),
      sharedContextBudget: Math.floor(a.sharedContextBudget * overageRatio),
      // diffBudget unchanged
    }));
  }

  private getSafetyMargin(contextWindow: number): number {
    return contextWindow > 128_000
      ? 8192
      : contextWindow > 32_000
        ? 4096
        : 2048;
  }

  private normalizeRatios(ratios: Record<string, number>): Record<string, number> {
    const sum = Object.values(ratios).reduce((total, value) => total + value, 0);
    if (sum <= 1) {
      return { ...ratios };
    }

    console.warn(`[ContextBudgetManager] ExecutionPlan ratios exceed 1.0 (${sum.toFixed(3)}). Normalizing.`);
    const normalized: Record<string, number> = {};
    for (const [role, ratio] of Object.entries(ratios)) {
      normalized[role] = ratio / sum;
    }
    return normalized;
  }

  private resolvePlanDiffShare(agentRole: string): number {
    const ratio = DIFF_BUDGET_RATIOS[agentRole] ?? 0.25;
    if (ratio >= 1) {
      return 0.55;
    }
    if (ratio >= 0.35) {
      return 0.4;
    }
    return 0.25;
  }

  private resolvePlanReferenceShare(agentRole: string): number {
    const ratio = REFERENCE_BUDGET_RATIOS[agentRole] ?? 0.2;
    if (ratio >= 0.5) {
      return 0.2;
    }
    if (ratio >= 0.3) {
      return 0.15;
    }
    return 0.1;
  }
}
