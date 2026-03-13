import { FunctionCall } from "../../../llm-tools/toolInterface";

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
};

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
