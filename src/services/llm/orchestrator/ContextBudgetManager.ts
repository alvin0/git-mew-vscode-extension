import { BudgetManagerConfig, AgentBudgetAllocation } from './orchestratorTypes';
import { TokenEstimatorService } from '../TokenEstimatorService';

export const DEFAULT_BUDGET_CONFIG: BudgetManagerConfig = {
  referenceContextRatio: 0.40,
  minReferenceTokens: 80_000,
  maxSymbolsFormula: (cw: number) => Math.min(Math.floor(cw / 2500), 120),
  maxFilesFormula: (cw: number) => Math.min(Math.floor(cw / 5000), 40),
  agentBudgetRatios: {
    'Code Reviewer': 0.40,
    'Flow Diagram': 0.35,
    'Observer': 0.25,
  },
  safetyThreshold: 0.85,
};

/** Diff budget ratios per agent role (fraction of total diffTokens) */
const DIFF_BUDGET_RATIOS: Record<string, number> = {
  'Code Reviewer': 1.00,
  'Flow Diagram': 0.35,
  'Observer': 0.15,
};

/** Reference budget ratios per agent role (fraction of total referenceBudget) */
const REFERENCE_BUDGET_RATIOS: Record<string, number> = {
  'Code Reviewer': 0.50,
  'Flow Diagram': 0.30,
  'Observer': 0.20,
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

  /** Kiểm tra và giảm proportionally nếu vượt safety threshold */
  enforceGlobalBudget(
    allocations: AgentBudgetAllocation[],
    contextWindow: number
  ): AgentBudgetAllocation[] {
    const safetyLimit = Math.floor(contextWindow * this.config.safetyThreshold);

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
}
