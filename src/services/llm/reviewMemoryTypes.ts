export interface PatternEntry {
  id: string;
  description: string;
  category: 'correctness' | 'security' | 'performance' | 'maintainability' | 'testing';
  frequencyCount: number;
  firstSeen: number;
  lastSeen: number;
  filePatterns: string[];
  averageSeverity: string;
  sourceAgents: string[];
}

export interface SuppressedFinding {
  filePattern: string;
  issueCategory: string;
  descriptionHash: string;
  description?: string;
  dismissReason?: string;
  dismissedAt: number;
  normalizedDescription?: string;
}

export interface FindingSignature {
  file: string;
  category: string;
  description: string;
}

export interface ReviewSummary {
  id: string;
  timestamp: number;
  baseBranch: string;
  compareBranch: string;
  changedFiles: string[];
  qualityVerdict: string;
  issueCounts: Record<string, number>;
  securityVulnCounts: Record<string, number>;
  topFindings: Array<{ severity: string; description: string; file: string }>;
  resolutionRate?: number;
}

export type ResolutionAction = 'resolved' | 'dismissed' | 'acknowledged';

export interface ResolutionRecord {
  findingId: string;
  action: ResolutionAction;
  timestamp: number;
  reviewId: string;
}

export interface ResolutionStats {
  overallRate: number;
  byAgent: Record<string, number>;
  historicalDismissRates: Record<string, number>;
}

export interface MemoryStats {
  totalPatterns: number;
  totalSuppressedFindings: number;
  cacheHitRate: number;
  totalReviewsStored: number;
  averageResolutionRate: number;
}
