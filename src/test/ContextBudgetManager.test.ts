import * as assert from 'assert';
import {
  ContextBudgetManager,
  DEFAULT_BUDGET_CONFIG,
} from '../services/llm/orchestrator/ContextBudgetManager';
import {
  BudgetManagerConfig,
  AgentBudgetAllocation,
} from '../services/llm/orchestrator/orchestratorTypes';
import { TokenEstimatorService } from '../services/llm/TokenEstimatorService';

/**
 * Minimal TokenEstimatorService — the methods under test don't call it,
 * but the constructor requires it.
 */
function createManager(configOverrides?: Partial<BudgetManagerConfig>): ContextBudgetManager {
  const config: BudgetManagerConfig = { ...DEFAULT_BUDGET_CONFIG, ...configOverrides };
  return new ContextBudgetManager(config, new TokenEstimatorService());
}

suite('ContextBudgetManager', () => {
  // ── computeReferenceContextBudget ──

  test('computeReferenceContextBudget(200000): returns floor(200000 * 0.40) = 80000', () => {
    const mgr = createManager();
    assert.strictEqual(mgr.computeReferenceContextBudget(200_000), 80_000);
  });

  test('computeReferenceContextBudget(128000): computed 51200 < 80000, maxAvailable 102400 >= 80000 → returns 80000', () => {
    const mgr = createManager();
    // 128000 * 0.40 = 51200 < 80000
    // maxAvailable = 128000 - floor(128000 * 0.20) = 128000 - 25600 = 102400 >= 80000
    assert.strictEqual(mgr.computeReferenceContextBudget(128_000), 80_000);
  });

  test('computeReferenceContextBudget(100000): computed 40000 < 80000, maxAvailable = 80000 → returns 80000', () => {
    const mgr = createManager();
    // 100000 * 0.40 = 40000 < 80000
    // maxAvailable = 100000 - floor(100000 * 0.20) = 100000 - 20000 = 80000 >= 80000
    assert.strictEqual(mgr.computeReferenceContextBudget(100_000), 80_000);
  });

  test('computeReferenceContextBudget(50000): maxAvailable 40000 < 80000 → returns 40000 (warns internally)', () => {
    const mgr = createManager();
    // 50000 * 0.40 = 20000 < 80000
    // maxAvailable = 50000 - floor(50000 * 0.20) = 50000 - 10000 = 40000 < 80000
    // → returns max(4500, 40000) = 40000
    // Note: console.warn is emitted internally but we only verify the return value
    const result = mgr.computeReferenceContextBudget(50_000);
    assert.strictEqual(result, 40_000);
  });

  // ── computeMaxSymbols ──

  test('computeMaxSymbols(200000): min(floor(200000/2500), 120) = min(80, 120) = 80', () => {
    const mgr = createManager();
    assert.strictEqual(mgr.computeMaxSymbols(200_000), 80);
  });

  test('computeMaxSymbols(32000): min(floor(32000/2500), 120) = min(12, 120) = 12', () => {
    const mgr = createManager();
    assert.strictEqual(mgr.computeMaxSymbols(32_000), 12);
  });

  // ── computeMaxReferenceFiles ──

  test('computeMaxReferenceFiles(200000): min(floor(200000/5000), 40) = min(40, 40) = 40', () => {
    const mgr = createManager();
    assert.strictEqual(mgr.computeMaxReferenceFiles(200_000), 40);
  });

  test('computeMaxReferenceFiles(32000): min(floor(32000/5000), 40) = min(6, 40) = 6', () => {
    const mgr = createManager();
    assert.strictEqual(mgr.computeMaxReferenceFiles(32_000), 6);
  });

  // ── allocateAgentBudgets ──

  test('allocateAgentBudgets(200000, 128000, 3000, 15000): agent totalBudget ratios are 30%/20%/20%/30%', () => {
    const mgr = createManager();
    const allocs = mgr.allocateAgentBudgets(200_000, 128_000, 3_000, 15_000);

    assert.strictEqual(allocs.length, 4);

    // contextWindow 200k > 128k → safetyMargin = 8192
    const totalInputBudget = 200_000 - 8192;
    const availableForAgents = totalInputBudget - 3_000;
    const referenceBudget = mgr.computeReferenceContextBudget(200_000); // 80000
    const remainingAfterReference = availableForAgents - referenceBudget;

    const cr = allocs.find(a => a.agentRole === 'Code Reviewer')!;
    const fd = allocs.find(a => a.agentRole === 'Flow Diagram')!;
    const ob = allocs.find(a => a.agentRole === 'Observer')!;
    const sa = allocs.find(a => a.agentRole === 'Security Analyst')!;

    assert.strictEqual(cr.totalBudget, Math.floor(remainingAfterReference * 0.30));
    assert.strictEqual(fd.totalBudget, Math.floor(remainingAfterReference * 0.20));
    assert.strictEqual(ob.totalBudget, Math.floor(remainingAfterReference * 0.20));
    assert.strictEqual(sa.totalBudget, Math.floor(remainingAfterReference * 0.30));
  });

  test('allocateAgentBudgets: diffBudget ratios — CR=100%, FD=35%, Observer=15% of diffTokens', () => {
    const mgr = createManager();
    const diffTokens = 15_000;
    const allocs = mgr.allocateAgentBudgets(200_000, 128_000, 3_000, diffTokens);

    const cr = allocs.find(a => a.agentRole === 'Code Reviewer')!;
    const fd = allocs.find(a => a.agentRole === 'Flow Diagram')!;
    const ob = allocs.find(a => a.agentRole === 'Observer')!;

    assert.strictEqual(cr.diffBudget, Math.floor(diffTokens * 1.00));
    assert.strictEqual(fd.diffBudget, Math.floor(diffTokens * 0.35));
    assert.strictEqual(ob.diffBudget, Math.floor(diffTokens * 0.15));
  });

  // ── enforceGlobalBudget ──

  test('enforceGlobalBudget: total ≤ 85% context window → returns allocations unchanged', () => {
    const mgr = createManager();
    const contextWindow = 200_000;
    const safetyLimit = Math.floor(contextWindow * 0.85); // 170000

    // Create allocations well under the limit
    const allocations: AgentBudgetAllocation[] = [
      { agentRole: 'Code Reviewer', totalBudget: 30000, diffBudget: 10000, referenceBudget: 10000, sharedContextBudget: 5000, reservedForOutput: 128000 },
      { agentRole: 'Flow Diagram', totalBudget: 25000, diffBudget: 5000, referenceBudget: 8000, sharedContextBudget: 4000, reservedForOutput: 128000 },
      { agentRole: 'Observer', totalBudget: 20000, diffBudget: 2000, referenceBudget: 6000, sharedContextBudget: 3000, reservedForOutput: 128000 },
    ];

    // total = (10000+10000+5000) + (5000+8000+4000) + (2000+6000+3000) = 53000 < 170000
    const result = mgr.enforceGlobalBudget(allocations, contextWindow);

    // Should be unchanged — same references
    assert.deepStrictEqual(result, allocations);
  });

  test('enforceGlobalBudget: total > 85% → referenceBudget and sharedContextBudget reduced, diffBudget unchanged', () => {
    const mgr = createManager();
    const contextWindow = 100_000;
    const safetyLimit = Math.floor(contextWindow * 0.85); // 85000

    // Create allocations that exceed the limit
    const allocations: AgentBudgetAllocation[] = [
      { agentRole: 'Code Reviewer', totalBudget: 60000, diffBudget: 20000, referenceBudget: 30000, sharedContextBudget: 15000, reservedForOutput: 16000 },
      { agentRole: 'Flow Diagram', totalBudget: 50000, diffBudget: 10000, referenceBudget: 20000, sharedContextBudget: 10000, reservedForOutput: 16000 },
      { agentRole: 'Observer', totalBudget: 40000, diffBudget: 5000, referenceBudget: 15000, sharedContextBudget: 8000, reservedForOutput: 16000 },
    ];

    // total = (20000+30000+15000) + (10000+20000+10000) + (5000+15000+8000) = 133000 > 85000
    const result = mgr.enforceGlobalBudget(allocations, contextWindow);

    const overageRatio = safetyLimit / 133000;

    for (let i = 0; i < result.length; i++) {
      const orig = allocations[i];
      const enforced = result[i];

      // diffBudget unchanged
      assert.strictEqual(enforced.diffBudget, orig.diffBudget);

      // referenceBudget and sharedContextBudget reduced
      assert.strictEqual(enforced.referenceBudget, Math.floor(orig.referenceBudget * overageRatio));
      assert.strictEqual(enforced.sharedContextBudget, Math.floor(orig.sharedContextBudget * overageRatio));
    }
  });

  // ── Custom BudgetManagerConfig overrides ──

  test('custom BudgetManagerConfig: custom ratios are used', () => {
    const customConfig: Partial<BudgetManagerConfig> = {
      referenceContextRatio: 0.50,
      minReferenceTokens: 50_000,
      maxSymbolsFormula: (cw: number) => Math.min(Math.floor(cw / 1000), 200),
      maxFilesFormula: (cw: number) => Math.min(Math.floor(cw / 2000), 60),
      agentBudgetRatios: {
        'Code Reviewer': 0.50,
        'Flow Diagram': 0.30,
        'Observer': 0.20,
      },
      safetyThreshold: 0.90,
    };
    const mgr = createManager(customConfig);

    // referenceContextRatio = 0.50 → 200000 * 0.50 = 100000
    assert.strictEqual(mgr.computeReferenceContextBudget(200_000), 100_000);

    // maxSymbolsFormula: min(floor(200000/1000), 200) = min(200, 200) = 200
    assert.strictEqual(mgr.computeMaxSymbols(200_000), 200);

    // maxFilesFormula: min(floor(200000/2000), 60) = min(100, 60) = 60
    assert.strictEqual(mgr.computeMaxReferenceFiles(200_000), 60);

    // agentBudgetRatios: 50%/30%/20%
    const allocs = mgr.allocateAgentBudgets(200_000, 128_000, 3_000, 15_000);
    const cr = allocs.find(a => a.agentRole === 'Code Reviewer')!;
    const fd = allocs.find(a => a.agentRole === 'Flow Diagram')!;
    const ob = allocs.find(a => a.agentRole === 'Observer')!;

    const totalInputBudget = 200_000 - 8192;
    const availableForAgents = totalInputBudget - 3_000;
    const referenceBudget = 100_000; // custom ratio
    const remaining = availableForAgents - referenceBudget;

    assert.strictEqual(cr.totalBudget, Math.floor(remaining * 0.50));
    assert.strictEqual(fd.totalBudget, Math.floor(remaining * 0.30));
    assert.strictEqual(ob.totalBudget, Math.floor(remaining * 0.20));

    // safetyThreshold = 0.90
    const safetyLimit = Math.floor(200_000 * 0.90); // 180000
    const enforced = mgr.enforceGlobalBudget(allocs, 200_000);
    const totalEstimated = allocs.reduce(
      (sum, a) => sum + a.diffBudget + a.referenceBudget + a.sharedContextBudget, 0
    );
    if (totalEstimated <= safetyLimit) {
      assert.deepStrictEqual(enforced, allocs);
    }
  });
});
