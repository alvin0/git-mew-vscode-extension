import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { GenerateOptions } from "../../llm-adapter";
import { getSystemPrompt } from "../../prompts/systemPromptGenerateCommit";
import { SYSTEM_PROMPT_GENERATE_REVIEW_MERGE } from "../../prompts/systemPromptGenerateReviewMerge";
import {
  ContextOrchestratorService,
  GenerationCancelledError,
} from "./ContextOrchestratorService";
import {
  ContextStrategy,
  ContextTaskSpec,
  UnifiedDiffFile,
} from "./contextTypes";
import { LLMAdapterService } from "./LLMAdapterService";
import { LLMUIService } from "./LLMUIService";
import { interpolate } from "../../services/utils/templateInterpolator";

/**
 * Handles LLM-based text generation tasks
 * Currently focused on commit message generation
 */
export class LLMGenerationService {
  private customPromptCache: string | null = null;
  private customPromptPath: string | null = null;
  private readonly contextOrchestrator: ContextOrchestratorService;

  constructor(
    private adapterService: LLMAdapterService,
    private uiService: LLMUIService
  ) {
    this.contextOrchestrator = new ContextOrchestratorService();
  }

  /**
   * Load custom commit rules.
   * Priority: project .gitmew/commit/rules.md > global ~/.gitmew/commit/rules.md > legacy project commit-rule.generate-commit.md
   * @returns Custom prompt content or null if file doesn't exist
   */
  private async loadCustomCommitRules(): Promise<string | null> {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const projectDir = path.join(workspaceRoot, ".gitmew");
      const globalDir = path.join(os.homedir(), ".gitmew");
      const candidates = [
        path.join(projectDir, "commit", "rules.md"),
        path.join(globalDir, "commit", "rules.md"),
        path.join(projectDir, "commit-rule.generate-commit.md"),
      ];

      for (const candidatePath of candidates) {
        if (fs.existsSync(candidatePath)) {
          const customPrompt = fs.readFileSync(candidatePath, "utf-8");
          this.customPromptCache = customPrompt;
          this.customPromptPath = candidatePath;
          return customPrompt;
        }
      }

      return null;
    } catch (error) {
      console.error("Error loading custom commit rules:", error);
      return null;
    }
  }

  /**
   * Get the system prompt for commit message generation
   * Checks for custom rules first, falls back to default
   */
  private async getSystemPrompt(currentBranch: string): Promise<string> {
    const customRaw = await this.loadCustomCommitRules();

    let customPrompt: string | undefined;
    if (customRaw) {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const repoName = workspaceFolders?.[0]?.uri.fsPath.split('/').pop() ?? '';
      customPrompt = interpolate(customRaw, { branch: currentBranch, repoName });
      console.log("Using custom commit rules from .gitmew/commit/rules.md");
    } else {
      console.log("Using default system prompt");
    }

    return getSystemPrompt(customPrompt);
  }

  private getCommitContextStrategy(): ContextStrategy {
    const config = vscode.workspace.getConfiguration("git-mew.commit");
    return config.get<ContextStrategy>("contextStrategy") || "auto";
  }

  /**
   * Configure options for GPT-5 models
   * @param adapter - The LLM adapter instance
   * @param options - Current generation options
   * @returns Updated options with GPT-5 specific settings if applicable
   */
  private configureGPT5Options(
    adapter: any,
    options: GenerateOptions
  ): GenerateOptions {
    if (
      adapter.getProvider() === "openai" &&
      adapter.getModel().startsWith("gpt-5")
    ) {
      return {
        ...options,
        reasoning: {
          effort: "low",
        },
        // text: { verbosity: "low" },
      };
    }
    return options;
  }

  /**
   * Generate commit message using LLM
   */
  async generateCommitMessage(
    stagedChanges: UnifiedDiffFile[],
    renderedDiff: string,
    currentBranch: string,
    signal?: AbortSignal,
    onProgress?: (message: string) => void
  ): Promise<string | null> {
    const adapter = await this.adapterService.getAdapter();
    if (!adapter) {
      return null;
    }

    try {
      const systemPrompt = await this.getSystemPrompt(currentBranch);
      const taskSpec = this.buildCommitTaskSpec(
        currentBranch,
        renderedDiff,
        systemPrompt
      );

      return await this.contextOrchestrator.generate({
        adapter,
        strategy: this.getCommitContextStrategy(),
        changes: stagedChanges,
        task: taskSpec,
        signal,
        onProgress,
      });
    } catch (error) {
      if (error instanceof GenerationCancelledError) {
        return null;
      }
      this.uiService.showError(`Failed to generate commit message: ${error}`);
      return null;
    }
  }

  private buildCommitTaskSpec(
    currentBranch: string,
    renderedDiff: string,
    systemMessage: string
  ): ContextTaskSpec {
    const directPrompt = `
## Current Branch: ${currentBranch}
## Staged Changes:
${renderedDiff}`;

    return {
      kind: "commit",
      label: "commit message generation",
      speedProfile: "fast",
      systemMessage,
      directPrompt,
      buildCoordinatorPrompt: ({ changedFilesSummary, analysesSummary }) => `
## Current Branch: ${currentBranch}
## Changed Files:
${changedFilesSummary}

## Hierarchical Chunk Summaries:
${analysesSummary}

Generate the final commit message from these summaries.
Do not mention that the diff was summarized in multiple stages.`,
    };
  }

  /**
   * Generate merge request review using LLM
   */
  async generateReviewMerge(
    baseBranch: string,
    compareBranch: string,
    diffContent: string
  ): Promise<string | null> {
    const adapter = await this.adapterService.getAdapter();
    if (!adapter) {
      return null;
    }

    try {
      const prompt = `
# Merge Request Review

**Base Branch:** ${baseBranch}
**Compare Branch:** ${compareBranch}

## Changes:

${diffContent}

Please analyze these changes and provide a comprehensive merge request review.`;

      const response = await adapter.generateText(prompt, {
        systemMessage: SYSTEM_PROMPT_GENERATE_REVIEW_MERGE(),
      });

      return response.text.trim();
    } catch (error) {
      this.uiService.showError(`Failed to generate merge review: ${error}`);
      return null;
    }
  }

  /**
   * Clear cached custom prompt (useful for testing or when file changes)
   */
  public clearCustomPromptCache(): void {
    this.customPromptCache = null;
    this.customPromptPath = null;
  }
}
