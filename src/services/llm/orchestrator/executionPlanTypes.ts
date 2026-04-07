export type PatchIntent = 'feature' | 'refactor' | 'bugfix' | 'mixed';

export interface RiskFlags {
  securitySensitive: boolean;
  crossModule: boolean;
  highChurn: boolean;
  apiContractChange: boolean;
}

export interface ExecutionPlan {
  patchIntent: PatchIntent;
  riskFlags: RiskFlags;
  enabledAgents: string[];
  disabledAgents: Array<{
    role: string;
    reason: string;
  }>;
  agentBudgets: Record<string, number>;
  sectionWriterBudgets?: {
    summary?: number;
    improvements?: number;
  };
  sectionWriters: {
    summary: boolean;
    improvements: boolean;
  };
  focusAreas: string[];
  priorityFiles: string[];
  fallbackPolicy: 'static-budget' | 'skip-agent' | 'abort';
  patchSize?: 'small' | 'medium' | 'large';
}

export interface Evidence_Ref {
  file: string;
  lineRange: {
    start: number;
    end: number;
  };
  toolResultId: string | null;
  diffLineRef: boolean;
}

export type FindingStatus = 'proposed' | 'verified' | 'rejected' | 'suppressed';
export type HypothesisStatus = 'proposed' | 'verified' | 'rejected';

export interface Finding {
  id: string;
  agentRole: string;
  category: 'correctness' | 'security' | 'performance' | 'maintainability' | 'testing' | 'integration';
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  confidence: number;
  status: FindingStatus;
  file: string;
  lineRange: {
    start: number;
    end: number;
  };
  description: string;
  suggestion: string;
  evidenceRefs: Evidence_Ref[];
  linkedFindingIds: string[];
}

export interface Hypothesis {
  id: string;
  sourceAgentRole: string;
  category: 'security' | 'integration' | 'correctness' | 'performance';
  description: string;
  affectedFiles: string[];
  confidence: number;
  status: HypothesisStatus;
  evidenceRefs: Evidence_Ref[];
  linkedFindingIds: string[];
}

export interface FindingFilter {
  agentRole?: string;
  status?: FindingStatus[];
  category?: Finding['category'];
  minSeverity?: Finding['severity'];
}

export interface HypothesisFilter {
  sourceAgentRole?: string;
  status?: HypothesisStatus[];
  category?: Hypothesis['category'];
}

export type ActorRole =
  | 'specialist_agent'
  | 'self_audit'
  | 'observer'
  | 'suppression_filter'
  | 'section_writer'
  | 'deterministic_renderer'
  | 'hybrid_assembly';

export const ALLOWED_TRANSITIONS = {
  specialist_agent: {
    create: ['proposed'],
  },
  self_audit: {
    proposed: ['verified', 'rejected'],
  },
  observer: {
    proposed: ['verified', 'rejected'],
  },
  suppression_filter: {
    verified: ['suppressed'],
  },
  section_writer: {},
  deterministic_renderer: {},
  hybrid_assembly: {},
} as const satisfies Record<ActorRole, Record<string, readonly string[]>>;

export class InvalidTransitionError extends Error {
  constructor(
    public readonly actor: ActorRole,
    public readonly currentStatus: string,
    public readonly targetStatus: string,
  ) {
    super(`Invalid transition for ${actor}: ${currentStatus} -> ${targetStatus}`);
    this.name = 'InvalidTransitionError';
  }
}

export class DuplicateFindingError extends Error {
  constructor(public readonly entityId: string) {
    super(`Duplicate finding or hypothesis id: ${entityId}`);
    this.name = 'DuplicateFindingError';
  }
}

export class FindingNotFoundError extends Error {
  constructor(public readonly entityId: string) {
    super(`Finding or hypothesis not found: ${entityId}`);
    this.name = 'FindingNotFoundError';
  }
}
