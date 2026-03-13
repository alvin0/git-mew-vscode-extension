import { LLMProvider } from '../../llm-adapter';
import { SYSTEM_PROMPT_GENERATE_DESCRIPTION_MERGE } from '../../prompts/systemPromptGenerateDescriptionMerge';
import { SYSTEM_PROMPT_GENERATE_REVIEW_MERGE } from '../../prompts/systemPromptGenerateReviewMerge';
import {
    ContextStrategy,
    ContextTaskSpec,
    GenerationCancelledError,
    LLMService,
    UnifiedDiffFile
} from '../../services/llm';
import { GitService } from '../../services/utils/gitService';
import { ReviewWorkflowServiceBase } from '../reviewShared/reviewWorkflowServiceBase';
import { 
    getDiagnosticsTool, 
    findReferencesTool, 
    readFileTool, 
    searchCodeTool, 
    getRelatedFilesTool, 
    getSymbolDefinitionTool 
} from '../../llm-tools/tools';
import { AgentPrompt } from '../../services/llm/ContextOrchestratorService';

export interface ReviewResult {
    success: boolean;
    review?: string;
    diff?: string;
    changes?: UnifiedDiffFile[];
    error?: string;
}

export interface DescriptionResult {
    success: boolean;
    description?: string;
    diff?: string;
    error?: string;
}

export interface PlantUmlRepairResult {
    success: boolean;
    content?: string;
    error?: string;
}

/**
 * Service for handling review merge operations
 */
export class ReviewMergeService extends ReviewWorkflowServiceBase {
    constructor(gitService: GitService, llmService: LLMService) {
        super(gitService, llmService);
    }

    /**
     * Generate a review for merging two branches
     */
    async generateReview(
        baseBranch: string,
        compareBranch: string,
        provider: LLMProvider,
        model: string,
        language: string,
        strategy: ContextStrategy,
        taskInfo?: string,
        apiKey?: string,
        baseURL?: string,
        contextWindow?: number,
        maxOutputTokens?: number,
        onProgress?: (message: string) => void,
        onLog?: (message: string) => void
    ): Promise<ReviewResult> {
        return this.withAbortController(async (abortController) => {
            try {
                const dependencyState = await this.prepareAdapter(
                    provider,
                    model,
                    language,
                    strategy,
                    apiKey,
                    baseURL,
                    contextWindow,
                    maxOutputTokens
                );
                if (!dependencyState.adapter) {
                    return { success: false, error: dependencyState.error };
                }

                const branchDiff = await this.getBranchDiffPreview(baseBranch, compareBranch);
                const customSystemPrompt = await this.gitService.getCustomReviewMergeSystemPrompt();
                const customAgentInstructions = await this.gitService.getCustomReviewMergeAgentPrompt();
                const customRules = await this.gitService.getCustomReviewMergeRules();
                const systemMessage = SYSTEM_PROMPT_GENERATE_REVIEW_MERGE(
                    language,
                    customSystemPrompt,
                    customRules,
                    customAgentInstructions
                );
                const basePrompt = this.buildReviewPrompt(baseBranch, compareBranch, branchDiff.diff, taskInfo);
                const referenceContextResult = await this.gitService.buildReviewReferenceContext(branchDiff.changes, {
                    strategy,
                    model: dependencyState.adapter.getModel(),
                    contextWindow: dependencyState.adapter.getContextWindow(),
                    mode: 'auto',
                    systemMessage,
                    directPrompt: basePrompt,
                });
                this.logReferenceContextMetadata(referenceContextResult.metadata, onLog);

                const agents: AgentPrompt[] = [
                    {
                        role: "Code Reviewer",
                        systemMessage: `${systemMessage}\n\nYour specific role is Code Reviewer Agent. 
- Inspect correctness, maintainability, security, performance, and testing gaps in the changed code.
- Prioritize concrete issues and actionable fixes.
- Use tools to investigate function implementations, trace symbol usage (find_references, get_symbol_definition), or search for patterns (search_code) when the provided context is insufficient.
- You can read full file contents using read_file if you identify a related file that needs deeper inspection.`,
                        prompt: `${referenceContextResult.context ? `${referenceContextResult.context}\n\n` : ''}${basePrompt}`,
                        tools: [findReferencesTool, getDiagnosticsTool, readFileTool, getSymbolDefinitionTool, searchCodeTool],
                        maxIterations: 3,
                        selfAudit: true
                    },
                    {
                        role: "Flow Diagram",
                        systemMessage: `${systemMessage}\n\nYour specific role is Flow Diagram Agent. 
- Reconstruct the most important control flow or data flow affected by the change.
- Use additional reference context from non-changed related files when available.
- Draw one or more PlantUML fenced blocks when the change affects multiple independent problems or flows.
- Name each diagram clearly to reflect the specific problem/flow it explains.
- Prefer the simplest suitable PlantUML diagram type: activity, sequence, class, or IE.
- Use get_related_files and read_file to discovery and understand interconnected logic.`,
                        prompt: `${referenceContextResult.context ? `${referenceContextResult.context}\n\n` : ''}${basePrompt}`,
                        tools: [findReferencesTool, getRelatedFilesTool, readFileTool, getSymbolDefinitionTool],
                        maxIterations: 3,
                        selfAudit: true
                    },
                    {
                        role: "Observer",
                        systemMessage: `${systemMessage}\n\nYour specific role is Observer Agent. 
- Look beyond the changed diff to infer hidden risks, missing edge-case coverage, and likely integration regressions.
- Use any provided supporting context from related files as read-only background.
- Produce a short execution todo list with no more than 4 items.
- Use get_diagnostics to check for project-wide impact and read_file to verify assumptions about integration points.`,
                        prompt: `${referenceContextResult.context ? `${referenceContextResult.context}\n\n` : ''}${basePrompt}`,
                        tools: [getDiagnosticsTool, getRelatedFilesTool, readFileTool],
                        maxIterations: 3,
                        selfAudit: true
                    },
                ];

                const review = await this.contextOrchestrator.generateMultiAgentFinalText(
                    dependencyState.adapter,
                    agents,
                    systemMessage,
                    (reports) => `You are the Synthesizer. Here are the review reports from your specialized agents:

${reports.join('\n\n')}

Please synthesize these inputs into a final, highly structured markdown report following the exact format requested.
Do NOT output the raw agent reports. Merge them gracefully according to the output contract.`,
                    abortController.signal,
                    {
                        adapter: dependencyState.adapter,
                        strategy,
                        changes: branchDiff.changes,
                        signal: abortController.signal,
                        onProgress,
                        onLog,
                        task: this.buildMergeReviewTaskSpec(
                            baseBranch,
                            compareBranch,
                            branchDiff.diff,
                            taskInfo,
                            systemMessage,
                            referenceContextResult.context
                        ),
                    }
                );

                return {
                    success: true,
                    review: this.gitService.normalizeGeneratedPaths(review, branchDiff.changes),
                    diff: branchDiff.diff,
                    changes: branchDiff.changes
                };
            } catch (error) {
                return this.handleGenerationError(error, 'Review generation cancelled.');
            }
        });
    }

    /**
     * Generate a merge request description
     */
    async generateDescription(
        baseBranch: string,
        compareBranch: string,
        provider: LLMProvider,
        model: string,
        language: string,
        strategy: ContextStrategy,
        taskInfo?: string,
        diff?: string,
        changes?: UnifiedDiffFile[],
        apiKey?: string,
        baseURL?: string,
        contextWindow?: number,
        maxOutputTokens?: number,
        onProgress?: (message: string) => void,
        onLog?: (message: string) => void
    ): Promise<DescriptionResult> {
        return this.withAbortController(async (abortController) => {
            try {
                const dependencyState = await this.prepareAdapter(
                    provider,
                    model,
                    language,
                    strategy,
                    apiKey,
                    baseURL,
                    contextWindow,
                    maxOutputTokens
                );
                if (!dependencyState.adapter) {
                    return { success: false, error: dependencyState.error };
                }

                const branchDiff = changes && diff
                    ? { changes, diff }
                    : await this.getBranchDiffPreview(baseBranch, compareBranch);
                const customSystemPrompt = await this.gitService.getCustomDescriptionMergeSystemPrompt();
                const systemMessage = SYSTEM_PROMPT_GENERATE_DESCRIPTION_MERGE(language, customSystemPrompt, '');
                const basePrompt = this.buildDescriptionPrompt(baseBranch, compareBranch, branchDiff.diff, taskInfo);
                const referenceContextResult = await this.gitService.buildReviewReferenceContext(branchDiff.changes, {
                    strategy,
                    model: dependencyState.adapter.getModel(),
                    contextWindow: dependencyState.adapter.getContextWindow(),
                    mode: 'auto',
                    systemMessage,
                    directPrompt: basePrompt,
                });
                this.logReferenceContextMetadata(referenceContextResult.metadata, onLog);

                const description = await this.contextOrchestrator.generate({
                    adapter: dependencyState.adapter,
                    strategy,
                    changes: branchDiff.changes,
                    signal: abortController.signal,
                    onProgress,
                    onLog,
                    task: this.buildMergeDescriptionTaskSpec(
                        baseBranch,
                        compareBranch,
                        branchDiff.diff,
                        taskInfo,
                        systemMessage,
                        referenceContextResult.context
                    ),
                });

                return {
                    success: true,
                    description: this.gitService.normalizeGeneratedPaths(description, branchDiff.changes),
                    diff: branchDiff.diff
                };
            } catch (error) {
                return this.handleGenerationError(error, 'Description generation cancelled.');
            }
        });
    }

    async repairPlantUml(
        provider: LLMProvider,
        model: string,
        language: string,
        strategy: ContextStrategy,
        content: string,
        renderError: string,
        changedFiles: UnifiedDiffFile[] = [],
        apiKey?: string,
        baseURL?: string,
        contextWindow?: number,
        maxOutputTokens?: number,
        onProgress?: (message: string) => void,
        onLog?: (message: string) => void
    ): Promise<PlantUmlRepairResult> {
        const result = await this.repairPlantUmlMarkdown(
            provider,
            model,
            language,
            strategy,
            content,
            renderError,
            apiKey,
            baseURL,
            contextWindow,
            maxOutputTokens,
            onProgress,
            onLog
        );

        if (result.success && result.content) {
            return {
                success: true,
                content: this.gitService.normalizeGeneratedPaths(result.content, changedFiles),
            };
        }

        return result;
    }

    /**
     * Get branch diff in both structured and rendered form
     */
    async getBranchDiffPreview(baseBranch: string, compareBranch: string): Promise<{ changes: UnifiedDiffFile[]; diff: string; }> {
        const changes = await this.gitService.getBranchDiffFiles(baseBranch, compareBranch);
        const diff = this.gitService.renderBranchDiffFiles(changes);
        return { changes, diff };
    }

    /**
     * Build the prompt for the LLM
     */
    private buildReviewPrompt(baseBranch: string, compareBranch: string, diff: string, taskInfo?: string): string {
        return `# Merge Request Review

**Base Branch:** ${baseBranch}
**Compare Branch:** ${compareBranch}
${taskInfo ? `\n**Task Context:** ${taskInfo}\n` : ''}

## Changes:

${diff}

Please analyze these changes and provide a comprehensive merge request review.`;
    }

    private buildMergeReviewTaskSpec(
        baseBranch: string,
        compareBranch: string,
        diff: string,
        taskInfo: string | undefined,
        systemMessage: string,
        referenceContext?: string
    ): ContextTaskSpec {
        return {
            kind: 'mergeReview',
            label: 'merge request review',
            systemMessage,
            directPrompt: this.withReferenceContext(
                this.buildReviewPrompt(baseBranch, compareBranch, diff, taskInfo),
                referenceContext
            ),
            buildCoordinatorPrompt: ({ changedFilesSummary, analysesSummary }) => `# Merge Request Review

**Base Branch:** ${baseBranch}
**Compare Branch:** ${compareBranch}
${taskInfo ? `\n**Task Context:** ${taskInfo}\n` : ''}

## Changed Files:

${changedFilesSummary}

## Hierarchical Chunk Summaries:

${analysesSummary}

${referenceContext ? `${referenceContext}\n\n` : ''}Please analyze these changes and provide a comprehensive merge request review.
Do not mention that the diff was summarized in multiple stages.`
        };
    }

    /**
     * Build the prompt for generating MR description
     */
    private buildDescriptionPrompt(baseBranch: string, compareBranch: string, diff: string, taskInfo?: string): string {
        return `# Generate Merge Request Description

**Base Branch:** ${baseBranch}
**Compare Branch:** ${compareBranch}
${taskInfo ? `\n**Task Info:** ${taskInfo}\n` : ''}

## Changes:

${diff}

Please generate a comprehensive merge request description following the template guidelines.`;
    }

    private buildMergeDescriptionTaskSpec(
        baseBranch: string,
        compareBranch: string,
        diff: string,
        taskInfo: string | undefined,
        systemMessage: string,
        referenceContext?: string
    ): ContextTaskSpec {
        return {
            kind: 'mrDescription',
            label: 'merge request description generation',
            systemMessage,
            directPrompt: this.withReferenceContext(
                this.buildDescriptionPrompt(baseBranch, compareBranch, diff, taskInfo),
                referenceContext
            ),
            buildCoordinatorPrompt: ({ changedFilesSummary, analysesSummary }) => `# Generate Merge Request Description

**Base Branch:** ${baseBranch}
**Compare Branch:** ${compareBranch}
${taskInfo ? `\n**Task Info:** ${taskInfo}\n` : ''}

## Changed Files:

${changedFilesSummary}

## Hierarchical Chunk Summaries:

${analysesSummary}

${referenceContext ? `${referenceContext}\n\n` : ''}Please generate a comprehensive merge request description following the template guidelines.
Do not mention that the diff was summarized in multiple stages.`
        };
    }

    private withReferenceContext(prompt: string, referenceContext?: string): string {
        if (!referenceContext) {
            return prompt;
        }

        return `${prompt}\n\n${referenceContext}`;
    }

    private handleGenerationError(error: unknown, cancelledMessage: string): ReviewResult | DescriptionResult {
        if (error instanceof GenerationCancelledError) {
            return {
                success: false,
                error: cancelledMessage
            };
        }

        return {
            success: false,
            error: `${error}`
        };
    }

    private logReferenceContextMetadata(
        metadata: {
            symbolsResolved: number;
            filesIncluded: number;
            estimatedTokens: number;
            triggerReason: string;
            candidateSymbols: number;
            triggered: boolean;
            truncatedByBudget: boolean;
        },
        onLog?: (message: string) => void
    ): void {
        onLog?.(
            `[reference] symbols=${metadata.symbolsResolved}/${metadata.candidateSymbols} files=${metadata.filesIncluded} tokens~${metadata.estimatedTokens} trigger=${metadata.triggerReason} expanded=${metadata.triggered} truncated=${metadata.truncatedByBudget}`
        );
    }
}
