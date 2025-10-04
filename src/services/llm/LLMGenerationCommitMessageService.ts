import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SYSTEM_PROMPT_GENERATE_COMMIT } from "../../prompts/systemPromptGenerateCommit";
import { SYSTEM_PROMPT_GENERATE_REVIEW_MERGE } from "../../prompts/systemPromptGenerateReviewMerge";
import { LLMAdapterService } from "./LLMAdapterService";
import { LLMUIService } from "./LLMUIService";

/**
 * Handles LLM-based text generation tasks
 * Currently focused on commit message generation
 */
export class LLMGenerationService {
  private customPromptCache: string | null = null;
  private customPromptPath: string | null = null;

  constructor(
    private adapterService: LLMAdapterService,
    private uiService: LLMUIService
  ) {}

  /**
   * Load custom commit rules from .gitmew/commit-rule.generate-commit.md
   * @returns Custom prompt content or null if file doesn't exist
   */
  private async loadCustomCommitRules(): Promise<string | null> {
    try {
      // Get workspace root
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return null;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const customRulePath = path.join(workspaceRoot, ".gitmew", "commit-rule.generate-commit.md");

      // Check if custom rule file exists
      if (!fs.existsSync(customRulePath)) {
        return null;
      }

      // Read custom rule file
      const customPrompt = fs.readFileSync(customRulePath, "utf-8");

      // Cache the custom prompt and path
      this.customPromptCache = customPrompt;
      this.customPromptPath = customRulePath;

      return customPrompt;
    } catch (error) {
      console.error("Error loading custom commit rules:", error);
      return null;
    }
  }

  /**
   * Get the system prompt for commit message generation
   * Checks for custom rules first, falls back to default
   * @returns System prompt string
   */
  private async getSystemPrompt(): Promise<string> {
    // Try to load custom rules
    const customPrompt = await this.loadCustomCommitRules();

    if (customPrompt) {
      console.log("Using custom commit rules from .gitmew/commit-rule.generate-commit.md");
      return customPrompt;
    }

    // Fall back to default system prompt
    console.log("Using default system prompt");
    return SYSTEM_PROMPT_GENERATE_COMMIT;
  }

  /**
   * Generate commit message using LLM
   */
  async generateCommitMessage(stagedChanges: string): Promise<string | null> {
    const adapter = await this.adapterService.getAdapter();
    if (!adapter) {
      return null;
    }

    try {
      const prompt = `
      ${stagedChanges}`;

      // Get dynamic system prompt (custom or default)
      const systemPrompt = await this.getSystemPrompt();

      const response = await adapter.generateText(prompt, {
        systemMessage: systemPrompt,
      });

      return response.text.trim();
    } catch (error) {
      this.uiService.showError(
        `Failed to generate commit message: ${error}`
      );
      return null;
    }
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
      this.uiService.showError(
        `Failed to generate merge review: ${error}`
      );
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