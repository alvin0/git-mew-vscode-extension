import { LLMProvider } from '../../llm-adapter';
import { REVIEW_AGENT_INSTRUCTIONS, REVIEW_OUTPUT_CONTRACT } from '../../prompts/reviewOutputContract';
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
    error?: string;
}

export interface PlantUmlRepairResult {
    success: boolean;
    content?: string;
    error?: string;
}

/**
 * Service for handling review staged changes operations
 */
export class ReviewStagedChangesService extends ReviewWorkflowServiceBase {
    constructor(gitService: GitService, llmService: LLMService) {
        super(gitService, llmService);
    }

    /**
     * Generate a review for staged changes
     */
    async generateReview(
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

                const preview = await this.getStagedDiffPreview();
                if (!preview) {
                    return {
                        success: false,
                        error: 'No staged files found. Please stage some files before reviewing.'
                    };
                }

                const customSystemPrompt = await this.gitService.getCustomReviewMergeSystemPrompt();
                const customAgentInstructions = await this.gitService.getCustomReviewMergeAgentPrompt();
                const customRules = await this.gitService.getCustomReviewMergeRules();
                const systemPrompt = this.withCustomAgentInstructions(
                    this.buildStagedReviewSystemPrompt(language, customSystemPrompt, customRules),
                    customAgentInstructions
                );
                const basePrompt = this.buildReviewPrompt(preview.diff, taskInfo);
                const referenceContextResult = await this.gitService.buildReviewReferenceContext(preview.changes, {
                    strategy,
                    model: dependencyState.adapter.getModel(),
                    contextWindow: dependencyState.adapter.getContextWindow(),
                    mode: 'auto',
                    systemMessage: systemPrompt,
                    directPrompt: basePrompt,
                });
                this.logReferenceContextMetadata(referenceContextResult.metadata, onLog);

                const agents: AgentPrompt[] = [
                    {
                        role: "Code Reviewer",
                        systemMessage: `${systemPrompt}\n\nYour specific role is Code Reviewer Agent. 
- Inspect correctness, maintainability, security, performance, and testing gaps in the staged changes.
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
                        systemMessage: `${systemPrompt}\n\nYour specific role is Flow Diagram Agent. 
- Reconstruct the most important control flow or data flow affected by the staged changes.
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
                        systemMessage: `${systemPrompt}\n\nYour specific role is Observer Agent. 
- Look beyond the staged diff to infer hidden risks, missing edge-case coverage, and likely integration regressions.
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
                    systemPrompt,
                    (reports) => `You are the Synthesizer. Here are the review reports from your specialized agents:

${reports.join('\n\n')}

Please synthesize these inputs into a final, highly structured markdown report following the exact format requested.
Do NOT output the raw agent reports. Merge them gracefully according to the output contract.`,
                    abortController.signal,
                    {
                        adapter: dependencyState.adapter,
                        strategy,
                        changes: preview.changes,
                        signal: abortController.signal,
                        onProgress,
                        onLog,
                        task: this.buildStagedReviewTaskSpec(
                            preview.diff,
                            taskInfo,
                            systemPrompt,
                            referenceContextResult.context
                        ),
                    }
                );

                return {
                    success: true,
                    review: this.gitService.normalizeGeneratedPaths(review, preview.changes),
                    diff: preview.diff
                };
            } catch (error) {
                if (error instanceof GenerationCancelledError) {
                    return {
                        success: false,
                        error: 'Review generation cancelled.'
                    };
                }
                return {
                    success: false,
                    error: `${error}`
                };
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
     * Build the prompt for the LLM
     */
    private buildReviewPrompt(diff: string, taskInfo?: string): string {
        return `# Staged Changes Review

${taskInfo ? `**Task Context:** ${taskInfo}\n\n` : ''}
## Staged Changes:

${diff}

Please analyze these staged changes and provide a comprehensive code review.`;
    }

    private buildStagedReviewTaskSpec(
        diff: string,
        taskInfo: string | undefined,
        systemMessage: string,
        referenceContext?: string
    ): ContextTaskSpec {
        return {
            kind: 'stagedReview',
            label: 'staged changes review',
            systemMessage,
            directPrompt: this.withReferenceContext(this.buildReviewPrompt(diff, taskInfo), referenceContext),
            buildCoordinatorPrompt: ({ changedFilesSummary, analysesSummary }) => `# Staged Changes Review

${taskInfo ? `**Task Context:** ${taskInfo}\n\n` : ''}${referenceContext ? `${referenceContext}\n\n` : ''}## Changed Files:

${changedFilesSummary}

## Hierarchical Chunk Summaries:

${analysesSummary}

Please analyze these staged changes and provide a comprehensive code review.
Do not mention that the diff was summarized in multiple stages.`
        };
    }

    /**
     * Build the system prompt for code review
     */
    private buildStagedReviewSystemPrompt(language: string, customSystemPrompt?: string, customRules?: string): string {
        const basePrompt = customSystemPrompt || `You are an expert code reviewer. Your task is to review staged changes and provide constructive feedback.

${REVIEW_AGENT_INSTRUCTIONS}

${REVIEW_OUTPUT_CONTRACT}

Be constructive, specific, and actionable in your feedback.`;

        const rulesSection = customRules ? `\n\n## Custom Review Rules:\n${customRules}` : '';
        const languageInstruction = `\n\nIMPORTANT: Provide your review in ${language} language.`;

        return basePrompt + rulesSection + languageInstruction;
    }

    private async getStagedDiffPreview(): Promise<{ changes: Awaited<ReturnType<GitService['getStagedDiffFiles']>>; diff: string; } | undefined> {
        const hasStagedFiles = await this.gitService.hasStagedFiles();
        if (!hasStagedFiles) {
            return undefined;
        }

        const changes = await this.gitService.getStagedDiffFiles();
        const diff = this.gitService.renderStagedDiffFiles(changes);
        return { changes, diff };
    }

    private withReferenceContext(prompt: string, referenceContext?: string): string {
        if (!referenceContext) {
            return prompt;
        }

        return `${prompt}\n\n${referenceContext}`;
    }

    private withCustomAgentInstructions(systemPrompt: string, customAgentInstructions?: string): string {
        if (!customAgentInstructions) {
            return systemPrompt;
        }

        return `${systemPrompt}\n\n## Custom Review Agents\n\n${customAgentInstructions}`;
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
