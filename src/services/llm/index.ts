/**
 * LLM Services Module
 * Provides modular LLM functionality for the extension
 */

// Export main service (recommended for most use cases)
export { LLMService } from "./LLMService";

// Export individual services (for advanced use cases)
export { LLMAdapterService } from "./LLMAdapterService";
export { LLMConfigManager } from "./LLMConfigManager";
export {
  ContextOrchestratorService,
  GenerationCancelledError,
} from "./ContextOrchestratorService";
export { TokenEstimatorService } from "./TokenEstimatorService";
export type {
  ChunkAnalysis,
  ContextGenerationRequest,
  ContextStrategy,
  ContextTaskSpec,
  DiffChunk,
  TaskKind,
  UnifiedDiffFile,
} from "./contextTypes";
export { LLMGenerationService } from "./LLMGenerationCommitMessageService";
export { LLMUIService } from "./LLMUIService";
