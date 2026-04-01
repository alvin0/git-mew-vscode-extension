import { ILLMAdapter } from "../../llm-adapter";

export type ContextStrategy = "direct" | "auto" | "hierarchical";

export type TaskKind =
  | "commit"
  | "stagedReview"
  | "mergeReview"
  | "mrDescription";

export interface UnifiedDiffFile {
  filePath: string;
  relativePath: string;
  diff: string;
  status: number;
  statusLabel: string;
  isDeleted: boolean;
  isBinary: boolean;
  originalFilePath?: string;
}

export interface DiffChunkEntry {
  file: UnifiedDiffFile;
  content: string;
  segmentLabel?: string;
  estimatedTokens: number;
}

export interface DiffChunk {
  id: string;
  files: DiffChunkEntry[];
  estimatedTokens: number;
}

export interface ChunkAnalysis {
  files: string[];
  intent: string[];
  risks: string[];
  breakingChanges: string[];
  testImpact: string[];
  notableSymbols: string[];
}

export interface CoordinatorPromptInput {
  changedFiles: UnifiedDiffFile[];
  changedFilesSummary: string;
  analyses: ChunkAnalysis[];
  analysesSummary: string;
}

export interface ContextTaskSpec {
  kind: TaskKind;
  label: string;
  systemMessage: string;
  directPrompt: string;
  taskContext?: string;
  buildCoordinatorPrompt: (input: CoordinatorPromptInput) => string;
  speedProfile?: "balanced" | "fast";
}

export interface ContextGenerationRequest {
  adapter: ILLMAdapter;
  strategy: ContextStrategy;
  changes: UnifiedDiffFile[];
  task: ContextTaskSpec;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  onLog?: (message: string) => void;
  onLlmLog?: (entry: LlmRequestLogEntry) => void;
}

export interface LlmRequestLogEntry {
  stage: string;
  provider: string;
  model: string;
  systemMessage: string;
  prompt: string;
  response?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  finishReason?: string;
  durationMs?: number;
  timestamp: string;
}
