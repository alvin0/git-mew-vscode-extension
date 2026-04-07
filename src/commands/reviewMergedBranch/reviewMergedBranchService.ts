import { LLMProvider } from '../../llm-adapter';
import { readCommitMessagesTool } from '../../llm-tools/tools';
import { SYSTEM_PROMPT_GENERATE_REVIEW_MERGE } from '../../prompts/systemPromptGenerateReviewMerge';
import {
    ContextStrategy,
    ContextTaskSpec,
    GenerationCancelledError,
    LlmRequestLogEntry,
    LLMService,
    UnifiedDiffFile
} from '../../services/llm';
import { ContextBudgetManager, DEFAULT_BUDGET_CONFIG } from '../../services/llm/orchestrator/ContextBudgetManager';
import { DependencyGraphIndex, DEFAULT_GRAPH_CONFIG } from '../../services/llm/orchestrator/DependencyGraphIndex';
import { SharedContextStoreImpl } from '../../services/llm/orchestrator/SharedContextStore';
import { SessionMemory } from '../../services/llm/orchestrator/SessionMemory';
import { AgentPromptBuilder } from '../../services/llm/orchestrator/AgentPromptBuilder';
import { TokenEstimatorService } from '../../services/llm/TokenEstimatorService';
import {
    AgentPrompt,
    AgentPromptBuildContext,
    CodeReviewerOutput,
    FlowDiagramOutput,
    ObserverOutput,
    StructuredAgentReport
} from '../../services/llm/orchestrator/orchestratorTypes';
import { shouldUseAdaptivePipeline } from '../../services/llm/orchestrator/adaptivePipelineFlag';
import { GitService } from '../../services/utils/gitService';
import { MergedBranchInfo } from '../../services/utils/gitService';
import { ReviewWorkflowServiceBase } from '../reviewShared/reviewWorkflowServiceBase';

export interface ReviewResult {
    success: boolean;
    review?: string;
    diff?: string;
    changes?: UnifiedDiffFile[];
    error?: string;
}

export interface PlantUmlRepairResult {
    success: boolean;
    content?: string;
    error?: string;
}

/**
 * Service for handling review operations on already-merged branches.
 * Extends ReviewWorkflowServiceBase to reuse the entire multi-agent pipeline,
 * adapter management, abort handling, and PlantUML repair.
 */
export class ReviewMergedBranchService extends ReviewWorkflowServiceBase {
    constructor(gitService: GitService, llmService: LLMService) {
        super(gitService, llmService);
    }

    async searchMergedBranches(targetBranch: string, query: string, limit: number = 20): Promise<MergedBranchInfo[]> {
        return this.gitService.searchMergedBranches(targetBranch, query, limit);
    }

    /**
     * Generate a review for a branch that has already been merged.
     * Uses the merge commit SHA to extract the first-parent diff,
     * then runs the full multi-agent review pipeline.
     */
    async generateReview(
        mergeCommitSha: string,
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
        onLog?: (message: string) => void,
        onLlmLog?: (entry: LlmRequestLogEntry) => void
    ): Promise<ReviewResult> {
        return this.withAbortController(async (abortController) => {
            try {
                const reviewStartTime = Date.now();
                // Step 1: Prepare LLM adapter
                const dependencyState = await this.prepareAdapter(
                    provider, model, language, strategy,
                    apiKey, baseURL, contextWindow, maxOutputTokens
                );
                if (!dependencyState.adapter) {
                    return { success: false, error: dependencyState.error };
                }

                // Step 2: Get diff from merge commit
                const branchDiff = await this.gitService.getMergedBranchDiff(mergeCommitSha);

                const currentBranch = await this.gitService.getCurrentBranch() ?? '';
                const reviewCtx = {
                    branch: currentBranch,
                    repoName: this.gitService.getWorkspaceRoot().split('/').pop() ?? '',
                };
                const customSystemPrompt = await this.gitService.getCustomReviewMergeSystemPrompt(reviewCtx);
                const customAgentInstructions = await this.gitService.getCustomReviewMergeAgentPrompt(reviewCtx);
                const customRules = await this.gitService.getCustomReviewMergeRules(reviewCtx);

                // Step 4: Build system message
                const systemMessage = SYSTEM_PROMPT_GENERATE_REVIEW_MERGE(
                    language, customSystemPrompt, customRules, customAgentInstructions
                );
                const basePrompt = this.buildMergedBranchReviewPrompt(
                    mergeCommitSha, branchDiff.diff, taskInfo
                );

                // Step 5: Initialize pipeline components
                const sharedStore = shouldUseAdaptivePipeline() ? new SessionMemory() : new SharedContextStoreImpl();
                const tokenEstimator = new TokenEstimatorService();
                const budgetManager = new ContextBudgetManager(DEFAULT_BUDGET_CONFIG, tokenEstimator);
                const promptBuilder = new AgentPromptBuilder(budgetManager, tokenEstimator);

                // Step 6: Build dependency graph
                onProgress?.("Building dependency graph from VS Code index...");
                const graphIndex = new DependencyGraphIndex(
                    DEFAULT_GRAPH_CONFIG, this.gitService, mergeCommitSha
                );
                let dependencyGraph;
                try {
                    dependencyGraph = await graphIndex.build(branchDiff.changes);
                    sharedStore.setDependencyGraph(dependencyGraph);
                    onLog?.(`[pre-analysis] graph built: ${dependencyGraph.fileDependencies.size} files, ${dependencyGraph.symbolMap.size} symbols, ${dependencyGraph.criticalPaths.length} critical paths`);
                } catch (error) {
                    onLog?.(`[pre-analysis] failed, falling back to legacy: ${error}`);
                }

                // Step 7: Calculate budgets
                const adapterContextWindow = dependencyState.adapter.getContextWindow();
                const adapterMaxOutputTokens = dependencyState.adapter.getMaxOutputTokens();
                const systemTokens = tokenEstimator.estimateTextTokens(
                    systemMessage, dependencyState.adapter.getModel()
                );
                const diffTokens = tokenEstimator.estimateTextTokens(
                    branchDiff.diff, dependencyState.adapter.getModel()
                );
                const budgetAllocations = budgetManager.allocateAgentBudgets(
                    adapterContextWindow, adapterMaxOutputTokens, systemTokens, diffTokens
                );
                const safeBudgets = budgetManager.enforceGlobalBudget(
                    budgetAllocations, adapterContextWindow
                );

                // Step 8: Build reference context
                const dynamicReferenceContextResult = await this.gitService.buildReviewReferenceContext(
                    branchDiff.changes, {
                        strategy,
                        model: dependencyState.adapter.getModel(),
                        contextWindow: adapterContextWindow,
                        mode: 'auto',
                        systemMessage,
                        directPrompt: basePrompt,
                        maxSymbols: budgetManager.computeMaxSymbols(adapterContextWindow),
                        maxReferenceFiles: budgetManager.computeMaxReferenceFiles(adapterContextWindow),
                        tokenBudget: budgetManager.computeReferenceContextBudget(adapterContextWindow),
                    }
                );
                this.logReferenceContextMetadata(dynamicReferenceContextResult.metadata, onLog);

                // Step 9: Build AgentPromptBuildContext
                const buildContext: AgentPromptBuildContext = {
                    fullDiff: branchDiff.diff,
                    changedFiles: branchDiff.changes,
                    referenceContext: dynamicReferenceContextResult.context,
                    dependencyGraph,
                    sharedContextStore: sharedStore,
                    additionalTools: [readCommitMessagesTool],
                    language,
                    taskInfo,
                    customSystemPrompt,
                    customRules,
                    customAgentInstructions,
                    compareBranch: mergeCommitSha,
                    gitService: this.gitService,
                };

                // Step 10: Build agent prompts
                const codeReviewerAgent = promptBuilder.buildCodeReviewerPrompt(
                    buildContext, safeBudgets[0]
                );
                const flowDiagramAgent = promptBuilder.buildFlowDiagramPrompt(
                    buildContext, safeBudgets[1]
                );
                const detailChangeAgent = promptBuilder.buildDetailChangePrompt(
                    buildContext,
                    { ...safeBudgets[0], agentRole: 'Detail Change' }
                );
                const agents: AgentPrompt[] = [codeReviewerAgent, flowDiagramAgent, detailChangeAgent];

                // Step 11: Execute multi-agent pipeline
                const reviewRequest = {
                    adapter: dependencyState.adapter,
                    strategy,
                    changes: branchDiff.changes,
                    signal: abortController.signal,
                    onProgress,
                    onLog,
                    onLlmLog,
                    task: this.buildMergedBranchReviewTaskSpec(
                        mergeCommitSha, branchDiff.diff, taskInfo,
                        systemMessage, dynamicReferenceContextResult.context
                    ),
                };
                const phaseConfig = {
                    phase1: agents,
                    phase2: [],
                    sharedStore,
                    promptBuilder,
                    buildContext,
                    budgetAllocations: safeBudgets,
                };

                const review = shouldUseAdaptivePipeline()
                    ? (await this.contextOrchestrator.runAdaptivePipeline({
                        adapter: dependencyState.adapter,
                        phaseConfig,
                        sharedStore,
                        suppressedFindings: [],
                        changedFiles: branchDiff.changes,
                        language,
                        reviewDurationMs: 0,
                        reviewStartTimeMs: reviewStartTime,
                        signal: abortController.signal,
                        request: reviewRequest,
                        actualReferenceTokens: dynamicReferenceContextResult.metadata.estimatedTokens,
                    })).review
                    : await this.contextOrchestrator.generateMultiAgentFinalText(
                        dependencyState.adapter,
                        agents,
                        systemMessage,
                        (reports) => {
                            const structuredReports: StructuredAgentReport[] = [];
                            const crFindings = sharedStore.getAgentFindings('Code Reviewer');
                            const fdFindings = sharedStore.getAgentFindings('Flow Diagram');
                            const obsFindings = sharedStore.getAgentFindings('Observer');

                            if (crFindings.length > 0) {
                                structuredReports.push({
                                    role: 'Code Reviewer',
                                    structured: crFindings[0].data as CodeReviewerOutput,
                                    raw: this.getRawAgentReport(reports, 'Code Reviewer'),
                                });
                            }
                            if (fdFindings.length > 0) {
                                structuredReports.push({
                                    role: 'Flow Diagram',
                                    structured: fdFindings[0].data as FlowDiagramOutput,
                                    raw: this.getRawAgentReport(reports, 'Flow Diagram'),
                                });
                            }
                            if (obsFindings.length > 0) {
                                structuredReports.push({
                                    role: 'Observer',
                                    structured: obsFindings[0].data as ObserverOutput,
                                    raw: this.getRawAgentReport(reports, 'Observer'),
                                });
                            }

                            if (structuredReports.length === 0) {
                                return reports.join('\n\n---\n\n');
                            }

                            return promptBuilder.buildSynthesizerPrompt(
                                structuredReports,
                                promptBuilder.buildDiffSummary(branchDiff.changes),
                                this.getRawAgentReport(reports, 'Detail Change'),
                            );
                        },
                        abortController.signal,
                        reviewRequest,
                        phaseConfig
                    );

                // Step 12: Return result
                return {
                    success: true,
                    review: this.gitService.normalizeGeneratedPaths(review, branchDiff.changes),
                    diff: branchDiff.diff,
                    changes: branchDiff.changes,
                };
            } catch (error) {
                return this.handleGenerationError(error, 'Review generation cancelled.');
            }
        });
    }

    /**
     * Repair PlantUML diagrams in the review output.
     * Delegates to the base class repairPlantUmlMarkdown method.
     */
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
            provider, model, language, strategy,
            content, renderError,
            apiKey, baseURL, contextWindow, maxOutputTokens,
            onProgress, onLog
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
     * Build the review prompt for a merged branch.
     */
    private buildMergedBranchReviewPrompt(
        mergeCommitSha: string,
        diff: string,
        taskInfo?: string
    ): string {
        return `# Merged Branch Review

**Merge Commit:** ${mergeCommitSha}
${taskInfo ? `\n**Task Context:** ${taskInfo}\n` : ''}

## Changes:

${diff}

Please analyze these changes and provide a comprehensive review of the merged branch.`;
    }

    private buildMergedBranchReviewTaskSpec(
        mergeCommitSha: string,
        diff: string,
        taskInfo: string | undefined,
        systemMessage: string,
        referenceContext?: string
    ): ContextTaskSpec {
        return {
            kind: 'mergeReview',
            label: 'merged branch review',
            systemMessage,
            directPrompt: this.withReferenceContext(
                this.buildMergedBranchReviewPrompt(mergeCommitSha, diff, taskInfo),
                referenceContext
            ),
            buildCoordinatorPrompt: ({ changedFilesSummary, analysesSummary }) => `# Merged Branch Review

**Merge Commit:** ${mergeCommitSha}
${taskInfo ? `\n**Task Context:** ${taskInfo}\n` : ''}

## Changed Files:

${changedFilesSummary}

## Hierarchical Chunk Summaries:

${analysesSummary}

${referenceContext ? `${referenceContext}\n\n` : ''}Please analyze these changes and provide a comprehensive review of the merged branch.
Do not mention that the diff was summarized in multiple stages.`
        };
    }

    private withReferenceContext(prompt: string, referenceContext?: string): string {
        if (!referenceContext) {
            return prompt;
        }
        return `${prompt}\n\n${referenceContext}`;
    }

    private handleGenerationError(error: unknown, cancelledMessage: string): ReviewResult {
        if (error instanceof GenerationCancelledError) {
            return { success: false, error: cancelledMessage };
        }
        return { success: false, error: `${error}` };
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
