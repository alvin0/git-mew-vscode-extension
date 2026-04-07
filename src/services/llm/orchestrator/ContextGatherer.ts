import { UnifiedDiffFile } from '../contextTypes';
import { TokenEstimatorService } from '../TokenEstimatorService';
import { DEFAULT_BUDGET_CONFIG } from './ContextBudgetManager';
import { DependencyGraphData } from './orchestratorTypes';
import { ExecutionPlan, PatchIntent, RiskFlags } from './executionPlanTypes';

export interface ContextGathererInput {
  changes: UnifiedDiffFile[];
  diffText: string;
  dependencyGraph?: DependencyGraphData;
  diffTokens: number;
  contextWindow: number;
}

export interface ContextGathererDebugTrace {
  patchSize: 'small' | 'medium' | 'large';
  additions: number;
  deletions: number;
  newFiles: number;
  renamedFiles: number;
  topLevelDirectories: string[];
  graphAvailability: 'available' | 'unavailable' | 'partial';
  securitySignals: string[];
  apiContractSignals: string[];
}

const DEFAULT_ENABLED_AGENTS = [
  'Code Reviewer',
  'Flow Diagram',
  'Detail Change',
  'Security Analyst',
  'Observer',
];

const SECURITY_PATTERNS = /(auth|crypto|token|secret|password|session|permission|\.env)/i;
const SECURITY_KEYWORDS = /(apiKey|jwt|hash|encrypt)/i;
const API_CONTRACT_PATTERN =
  /^[+-]\s*export\s+(interface|type|class|enum|function|async function|const\s+\w+\s*=\s*\()/m;

export class ContextGatherer {
  private lastDebugTrace?: ContextGathererDebugTrace;

  constructor(
    private readonly tokenEstimator: TokenEstimatorService,
    private readonly defaultBudgetRatios: Record<string, number> = DEFAULT_BUDGET_CONFIG.agentBudgetRatios,
  ) {}

  analyze(input: ContextGathererInput): ExecutionPlan {
    try {
      const patchSize = this.classifyPatchSize(input.changes.length, input.diffTokens);
      const counts = this.countDiffLines(input.diffText);
      const patchIntent = this.classifyPatchIntent(input.changes, input.diffText, patchSize, counts);
      const riskFlags = this.detectRiskFlags(input.changes, input.diffText, input.dependencyGraph);
      const priorityFiles = this.identifyHotspots(input.changes, input.dependencyGraph);
      const agentBudgets = this.computeAgentBudgets(patchIntent, riskFlags, this.defaultBudgetRatios);
      const enabledAgents = this.determineEnabledAgents();
      const topLevelDirectories = this.collectTopLevelDirectories(input.changes);
      const graphAvailability = this.determineGraphAvailability(input.changes, input.dependencyGraph);

      this.lastDebugTrace = {
        patchSize,
        additions: counts.additions,
        deletions: counts.deletions,
        newFiles: input.changes.filter((change) => change.statusLabel === 'added').length,
        renamedFiles: input.changes.filter((change) => change.statusLabel === 'renamed' || !!change.originalFilePath).length,
        topLevelDirectories,
        graphAvailability,
        securitySignals: this.collectSecuritySignals(input.changes, input.diffText),
        apiContractSignals: this.collectApiContractSignals(input.diffText),
      };

      return {
        patchIntent,
        riskFlags,
        enabledAgents,
        disabledAgents: [],
        agentBudgets,
        sectionWriters: {
          summary: patchSize !== 'small',
          // Eligibility only. Actual activation still depends on runtime findings in HybridAssembly.
          improvements: true,
        },
        sectionWriterBudgets: {
          ...(patchSize !== 'small'
            ? {
                summary: Math.max(512, Math.floor(input.contextWindow * 0.05)),
              }
            : {}),
          improvements: Math.max(512, Math.floor(input.contextWindow * 0.06)),
        },
        focusAreas: priorityFiles.length > 0
          ? priorityFiles
          : input.changes.slice(0, 5).map((change) => change.relativePath),
        priorityFiles,
        fallbackPolicy: 'skip-agent',
        patchSize,
      };
    } catch {
      return this.buildDefaultPlan();
    }
  }

  getLastDebugTrace(): ContextGathererDebugTrace | undefined {
    return this.lastDebugTrace;
  }

  private classifyPatchSize(
    fileCount: number,
    diffTokens: number,
  ): 'small' | 'medium' | 'large' {
    if (fileCount > 30 || diffTokens > 15_000) {
      return 'large';
    }
    if (fileCount >= 10 || diffTokens >= 3_000) {
      return 'medium';
    }
    return 'small';
  }

  private classifyPatchIntent(
    changes: UnifiedDiffFile[],
    diffText: string,
    patchSize: 'small' | 'medium' | 'large',
    counts: { additions: number; deletions: number },
  ): PatchIntent {
    const totalChanged = Math.max(1, counts.additions + counts.deletions);
    const additionRatio = counts.additions / totalChanged;
    const deletionDelta = Math.abs(counts.additions - counts.deletions) / totalChanged;
    const newFiles = changes.filter((change) => change.statusLabel === 'added').length;
    const renamedFiles = changes.filter((change) => change.statusLabel === 'renamed' || !!change.originalFilePath).length;
    const renameRatio = changes.length > 0 ? renamedFiles / changes.length : 0;
    const hasNewExports = /^[+]\s*export\s+/m.test(diffText);
    const hasTestFiles = changes.some((change) => /(^|\/)(test|tests|__tests__|spec)\b/i.test(change.relativePath));
    const hasSourceFiles = changes.some((change) => !/(^|\/)(test|tests|__tests__|spec)\b/i.test(change.relativePath));

    if (additionRatio > 0.6 && (newFiles > 0 || patchSize !== 'small')) {
      return 'feature';
    }

    if ((renameRatio >= 0.3 || renamedFiles >= 2) && deletionDelta <= 0.2) {
      return 'refactor';
    }

    if (patchSize === 'small' && hasTestFiles && hasSourceFiles && newFiles === 0) {
      return 'bugfix';
    }

    return 'mixed';
  }

  private detectRiskFlags(
    changes: UnifiedDiffFile[],
    diffText: string,
    graph?: DependencyGraphData,
  ): RiskFlags {
    const topLevelDirectories = this.collectTopLevelDirectories(changes);
    const changedLineCounts = changes.map((change) => this.countChangedLines(change.diff));
    const crossModuleFromGraph = (graph?.criticalPaths ?? []).filter((path) => path.changedFileCount >= 2).length >= 2;

    return {
      securitySensitive:
        changes.some((change) => SECURITY_PATTERNS.test(change.relativePath)) ||
        SECURITY_KEYWORDS.test(diffText),
      crossModule:
        topLevelDirectories.length >= 3 ||
        crossModuleFromGraph,
      highChurn:
        changedLineCounts.filter((count) => count > 100).length >= 5,
      apiContractChange:
        API_CONTRACT_PATTERN.test(diffText),
    };
  }

  private identifyHotspots(changes: UnifiedDiffFile[], graph?: DependencyGraphData): string[] {
    if (!graph) {
      return [];
    }

    const changedPaths = new Set(changes.map((change) => change.filePath || change.relativePath));
    return [...graph.fileDependencies.entries()]
      .filter(([filePath]) => changedPaths.has(filePath) || changes.some((change) => change.relativePath === filePath))
      .sort((left, right) => right[1].importedBy.length - left[1].importedBy.length)
      .map(([filePath]) => {
        const matching = changes.find((change) => change.filePath === filePath || change.relativePath === filePath);
        return matching?.relativePath ?? filePath;
      });
  }

  private determineEnabledAgents(): string[] {
    return [...DEFAULT_ENABLED_AGENTS];
  }

  private computeAgentBudgets(
    patchIntent: PatchIntent,
    riskFlags: RiskFlags,
    defaultRatios: Record<string, number>,
  ): Record<string, number> {
    const targetBudgets: Record<string, number> = { ...defaultRatios };
    const boostedRoles = new Set<string>();

    if (riskFlags.securitySensitive && targetBudgets['Security Analyst'] !== undefined) {
      targetBudgets['Security Analyst'] = defaultRatios['Security Analyst'] * 1.2;
      boostedRoles.add('Security Analyst');
    }
    if (patchIntent === 'refactor' && targetBudgets['Flow Diagram'] !== undefined) {
      targetBudgets['Flow Diagram'] = defaultRatios['Flow Diagram'] * 1.15;
      boostedRoles.add('Flow Diagram');
    }

    const boostedTotal = [...boostedRoles].reduce((sum, role) => sum + (targetBudgets[role] ?? 0), 0);
    if (boostedTotal >= 1) {
      const normalizedBoosts: Record<string, number> = {};
      for (const role of Object.keys(targetBudgets)) {
        normalizedBoosts[role] = boostedRoles.has(role) ? (targetBudgets[role] ?? 0) / boostedTotal : 0;
      }
      return normalizedBoosts;
    }

    const remainingRoles = Object.keys(defaultRatios).filter((role) => !boostedRoles.has(role));
    const remainingDefaultTotal = remainingRoles.reduce((sum, role) => sum + (defaultRatios[role] ?? 0), 0);
    const remainingBudget = Math.max(0, 1 - boostedTotal);
    const finalBudgets: Record<string, number> = {};

    for (const [role, ratio] of Object.entries(defaultRatios)) {
      if (boostedRoles.has(role)) {
        finalBudgets[role] = targetBudgets[role];
        continue;
      }
      finalBudgets[role] = remainingDefaultTotal > 0
        ? remainingBudget * (ratio / remainingDefaultTotal)
        : 0;
    }

    return finalBudgets;
  }

  private buildDefaultPlan(): ExecutionPlan {
    return {
      patchIntent: 'mixed',
      riskFlags: {
        securitySensitive: false,
        crossModule: false,
        highChurn: false,
        apiContractChange: false,
      },
      enabledAgents: this.determineEnabledAgents(),
      disabledAgents: [],
      agentBudgets: { ...this.defaultBudgetRatios },
      sectionWriters: {
        summary: false,
        improvements: false,
      },
      focusAreas: [],
      priorityFiles: [],
      fallbackPolicy: 'static-budget',
      patchSize: 'small',
    };
  }

  private countDiffLines(diffText: string): { additions: number; deletions: number } {
    let additions = 0;
    let deletions = 0;

    for (const line of diffText.split('\n')) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }

    return { additions, deletions };
  }

  private countChangedLines(diffText: string): number {
    return diffText
      .split('\n')
      .filter((line) =>
        (line.startsWith('+') && !line.startsWith('+++')) ||
        (line.startsWith('-') && !line.startsWith('---')),
      )
      .length;
  }

  private collectTopLevelDirectories(changes: UnifiedDiffFile[]): string[] {
    return [...new Set(
      changes
        .map((change) => change.relativePath.replace(/\\/g, '/').split('/')[0])
        .filter((segment) => segment.length > 0),
    )];
  }

  private determineGraphAvailability(
    changes: UnifiedDiffFile[],
    graph?: DependencyGraphData,
  ): 'available' | 'unavailable' | 'partial' {
    if (!graph) {
      return 'unavailable';
    }

    const expected = changes.filter((change) => !change.isBinary && !change.isDeleted).length;
    if (graph.fileDependencies.size === 0) {
      return 'partial';
    }
    return graph.fileDependencies.size >= expected ? 'available' : 'partial';
  }

  private collectSecuritySignals(changes: UnifiedDiffFile[], diffText: string): string[] {
    const matches = changes
      .filter((change) => SECURITY_PATTERNS.test(change.relativePath))
      .map((change) => change.relativePath);
    if (SECURITY_KEYWORDS.test(diffText)) {
      matches.push('diff-keyword');
    }
    return matches;
  }

  private collectApiContractSignals(diffText: string): string[] {
    return diffText
      .split('\n')
      .filter((line) => API_CONTRACT_PATTERN.test(line))
      .slice(0, 10);
  }
}
