import { FunctionCall, ToolExecuteResponse } from "../../../llm-tools/toolInterface";
import { UnifiedDiffFile } from "../contextTypes";

export type BudgetProfile = {
  contextWindow: number;
  directInputBudget: number;
  workerInputBudget: number;
  reducerInputBudget: number;
  finalInputBudget: number;
};

export type TaskExecutionProfile = {
  concurrency: number;
  workerBudgetMultiplier: number;
  reducerBudgetMultiplier: number;
  finalBudgetMultiplier: number;
  changedFilesBudgetMultiplier: number;
  workerMaxTokens: number;
  reducerMaxTokens: number;
};

export type AgentPrompt = {
  role: string;
  systemMessage: string;
  prompt: string;
  tools?: FunctionCall[];
  maxIterations?: number;
  selfAudit?: boolean;
  // Phased execution optional fields
  phase?: number;
  outputSchema?: 'code-reviewer' | 'flow-diagram' | 'observer';
  sharedStore?: SharedContextStore;
  /** Git ref for branch-aware file reading */
  compareBranch?: string;
  /** GitService instance for branch-aware file reading */
  gitService?: any;
};

// Forward reference — actual implementation in SharedContextStore.ts
export type SharedContextStore = any;

// Forward reference — actual implementation in AgentPromptBuilder.ts
export type AgentPromptBuilder = any;

export type ContextOrchestratorConfig = {
  concurrency: number;
  defaultContextWindow: number;
  directBudgetRatio: number;
  workerBudgetRatio: number;
  reducerBudgetRatio: number;
  finalBudgetRatio: number;
  changedFilesBudgetRatio: number;
  workerOverheadTokens: number;
  reducerOverheadTokens: number;
  /** Called when the service auto-discovers the real context window from an API error */
  onCalibrate?: (provider: string, model: string, contextWindow: number) => void;
};

export const DEFAULT_ORCHESTRATOR_CONFIG: ContextOrchestratorConfig = {
  concurrency: 2,
  defaultContextWindow: 32768,
  directBudgetRatio: 0.55,
  workerBudgetRatio: 0.18,
  reducerBudgetRatio: 0.2,
  finalBudgetRatio: 0.35,
  changedFilesBudgetRatio: 0.2,
  workerOverheadTokens: 1200,
  reducerOverheadTokens: 900,
};

export const WORKER_SYSTEM_PROMPT = `You summarize git diff chunks for a larger coordinator.

Return ONLY valid JSON.
Do not wrap the JSON in markdown fences.
Do not add commentary.
Use this exact shape:
{
  "files": ["path/to/file.ts"],
  "intent": ["short summary"],
  "risks": ["short risk"],
  "breakingChanges": ["short breaking change"],
  "testImpact": ["short testing impact"],
  "notableSymbols": ["SymbolName"]
}

Rules:
- Keep each array short and specific.
- Use empty arrays when there is nothing to report.
- Never include raw diff lines.
- "files" must contain relative file paths only.
- Max 4 items for intent/risks/breakingChanges/testImpact.
- Max 8 items for notableSymbols.`;

export const REDUCER_SYSTEM_PROMPT = `You combine multiple git diff summaries into a smaller normalized JSON summary.

Return ONLY valid JSON with this exact shape:
{
  "files": ["path/to/file.ts"],
  "intent": ["short summary"],
  "risks": ["short risk"],
  "breakingChanges": ["short breaking change"],
  "testImpact": ["short testing impact"],
  "notableSymbols": ["SymbolName"]
}

Rules:
- Merge duplicate items.
- Keep the most important information only.
- Use empty arrays when needed.
- Never include markdown fences or commentary.`;

export const FAST_WORKER_SYSTEM_PROMPT = `You summarize git diff chunks for fast commit generation.

Return ONLY valid JSON.
Do not wrap the JSON in markdown fences.
Use this exact shape:
{
  "files": ["path/to/file.ts"],
  "intent": ["short summary"],
  "risks": [],
  "breakingChanges": [],
  "testImpact": [],
  "notableSymbols": ["SymbolName"]
}

Rules:
- Keep output minimal and fast.
- Focus on the main intent of the changes.
- Use at most 2 intent items.
- Keep notableSymbols to the most important 4 items.
- Prefer empty arrays for risks, breakingChanges, and testImpact unless clearly necessary.`;

export const FAST_REDUCER_SYSTEM_PROMPT = `You compress multiple diff summaries for fast commit generation.

Return ONLY valid JSON with this exact shape:
{
  "files": ["path/to/file.ts"],
  "intent": ["short summary"],
  "risks": [],
  "breakingChanges": [],
  "testImpact": [],
  "notableSymbols": ["SymbolName"]
}

Rules:
- Keep only the minimum information needed to write a good commit message.
- Merge duplicates aggressively.
- Prefer empty arrays for non-essential sections.`;

// ─── Structured Agent Output Schemas ───

export interface CodeReviewerOutput {
  issues: Array<{
    file: string;
    location: string;
    severity: 'critical' | 'major' | 'minor' | 'suggestion';
    category: 'correctness' | 'security' | 'performance' | 'maintainability' | 'testing';
    description: string;
    suggestion: string;
  }>;
  affectedSymbols: string[];
  qualityVerdict: 'Critical' | 'Not Bad' | 'Safe' | 'Good' | 'Perfect';
}

export interface FlowDiagramOutput {
  diagrams: Array<{
    name: string;
    type: 'activity' | 'sequence' | 'class' | 'ie';
    plantumlCode: string;
    description: string;
  }>;
  affectedFlows: string[];
}

export interface ObserverOutput {
  risks: Array<{
    description: string;
    severity: 'high' | 'medium' | 'low';
    affectedArea: string;
  }>;
  todoItems: Array<{
    action: string;
    parallelizable: boolean;
  }>;
  integrationConcerns: string[];
  hypothesisVerdicts?: Array<{
    hypothesisIndex: number;
    verdict: 'confirmed' | 'refuted' | 'inconclusive';
    evidence: string;
  }>;
}

export type StructuredAgentReport =
  | { role: 'Code Reviewer'; structured: CodeReviewerOutput; raw: string }
  | { role: 'Flow Diagram'; structured: FlowDiagramOutput; raw: string }
  | { role: 'Observer'; structured: ObserverOutput; raw: string };

// ─── Risk Hypothesis ───

export interface RiskHypothesis {
  question: string;
  affectedFiles: string[];
  evidenceNeeded: string;
  severityEstimate: 'high' | 'medium' | 'low';
  source: 'heuristic' | 'llm';
}

// ─── Phased Execution Config ───

export interface PhasedAgentConfig {
  phase1: AgentPrompt[];
  phase2: AgentPrompt[];
  sharedStore: SharedContextStore;
  promptBuilder: AgentPromptBuilder;
  buildContext: AgentPromptBuildContext;
  budgetAllocations: AgentBudgetAllocation[];
}

// ─── Budget Allocation ───

export interface AgentBudgetAllocation {
  agentRole: string;
  totalBudget: number;
  diffBudget: number;
  referenceBudget: number;
  sharedContextBudget: number;
  reservedForOutput: number;
}

export interface BudgetManagerConfig {
  referenceContextRatio: number;
  minReferenceTokens: number;
  maxSymbolsFormula: (cw: number) => number;
  maxFilesFormula: (cw: number) => number;
  agentBudgetRatios: Record<string, number>;
  safetyThreshold: number;
}

// ─── Agent Prompt Build Context ───

export interface AgentPromptBuildContext {
  fullDiff: string;
  changedFiles: UnifiedDiffFile[];
  referenceContext?: string;
  dependencyGraph?: DependencyGraphData;
  sharedContextStore?: SharedContextStore;
  additionalTools?: FunctionCall[];
  riskHypotheses?: RiskHypothesis[];
  language: string;
  taskInfo?: string;
  customSystemPrompt?: string;
  customRules?: string;
  customAgentInstructions?: string;
  /** The branch being reviewed — tools will read file content from this ref */
  compareBranch?: string;
  /** GitService instance for branch-aware file reading */
  gitService?: any;
}

// ─── Dependency Graph ───

export interface DependencyGraphData {
  fileDependencies: Map<string, { imports: string[]; importedBy: string[] }>;
  symbolMap: Map<string, {
    definedIn: string;
    referencedBy: string[];
    type: 'function' | 'class' | 'interface' | 'type' | 'constant' | 'enum';
  }>;
  criticalPaths: Array<{
    files: string[];
    changedFileCount: number;
    description: string;
  }>;
}

export interface DependencyGraphConfig {
  maxFiles: number;
  maxSymbolLookups: number;
  timeoutMs: number;
  criticalPathThreshold: number;
}

// ─── Tool Result Cache ───

export interface ToolResultCacheEntry {
  toolName: string;
  normalizedArgs: string;
  result: ToolExecuteResponse;
  timestamp: number;
}

// ─── Agent Finding ───

export interface AgentFinding {
  agentRole: string;
  type: 'issue' | 'flow' | 'risk' | 'todo';
  data: unknown;
  timestamp: number;
}

// ─── MR Description Agent Output Schemas ───

export interface ChangeAnalyzerOutput {
  changeGroups: Array<{
    scope: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test' | 'infra' | 'config';
    files: string[];
    summary: string;
    breakingChange: boolean;
  }>;
  detectedIssueRefs: string[];
  migrationNotes: string[];
  templateHint: 'default' | 'release' | 'hotfix';
}

export interface ContextInvestigatorOutput {
  impactedModules: string[];
  risks: Array<{ description: string; severity: 'high' | 'medium' | 'low' }>;
  relatedContext: string[];
  backwardCompatibility: string;
  rollbackNotes: string;
}

export type DescriptionAgentReport =
  | { role: 'Change Analyzer'; structured: ChangeAnalyzerOutput; raw: string }
  | { role: 'Context Investigator'; structured: ContextInvestigatorOutput; raw: string };
