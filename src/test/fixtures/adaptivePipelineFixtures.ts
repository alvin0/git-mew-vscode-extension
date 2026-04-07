import { randomUUID } from 'crypto';
import { UnifiedDiffFile } from '../../services/llm/contextTypes';
import {
  Evidence_Ref,
  ExecutionPlan,
  Finding,
  Hypothesis,
} from '../../services/llm/orchestrator/executionPlanTypes';

export function createMockEvidenceRef(overrides: Partial<Evidence_Ref> = {}): Evidence_Ref {
  return {
    file: 'src/example.ts',
    lineRange: { start: 1, end: 2 },
    toolResultId: null,
    diffLineRef: true,
    ...overrides,
  };
}

export function createMockFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: randomUUID(),
    agentRole: 'Code Reviewer',
    category: 'correctness',
    severity: 'minor',
    confidence: 0.8,
    status: 'proposed',
    file: 'src/example.ts',
    lineRange: { start: 1, end: 2 },
    description: 'Example finding',
    suggestion: 'Apply the suggested fix',
    evidenceRefs: [createMockEvidenceRef()],
    linkedFindingIds: [],
    ...overrides,
  };
}

export function createMockHypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: randomUUID(),
    sourceAgentRole: 'Observer',
    category: 'correctness',
    description: 'Example hypothesis',
    affectedFiles: ['src/example.ts'],
    confidence: 0.7,
    status: 'proposed',
    evidenceRefs: [createMockEvidenceRef()],
    linkedFindingIds: [],
    ...overrides,
  };
}

export function createMockExecutionPlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    patchIntent: 'mixed',
    riskFlags: {
      securitySensitive: false,
      crossModule: false,
      highChurn: false,
      apiContractChange: false,
    },
    enabledAgents: ['Code Reviewer', 'Flow Diagram', 'Observer', 'Security Analyst'],
    disabledAgents: [],
    agentBudgets: {
      'Code Reviewer': 0.3,
      'Flow Diagram': 0.2,
      'Observer': 0.2,
      'Security Analyst': 0.3,
    },
    sectionWriters: {
      summary: false,
      improvements: false,
    },
    focusAreas: ['src/example.ts'],
    priorityFiles: ['src/example.ts'],
    fallbackPolicy: 'static-budget',
    patchSize: 'small',
    ...overrides,
  };
}

export function createMockChangedFile(overrides: Partial<UnifiedDiffFile> = {}): UnifiedDiffFile {
  return {
    relativePath: 'src/example.ts',
    statusLabel: 'modified',
    diff: '@@ -1,1 +1,2 @@\n-export const value = 1;\n+export const value = 2;\n+export const enabled = true;',
    ...overrides,
  } as UnifiedDiffFile;
}
