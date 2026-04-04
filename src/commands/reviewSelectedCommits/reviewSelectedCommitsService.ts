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
import { GitService } from '../../services/utils/gitService';
import { ReviewWorkflowServiceBase } from '../reviewShared/reviewWorkflowServiceBase';

export interface ReviewResult {
    success: boolean;
    review?: string;
    diff?: string;
    changes?: UnifiedDiffFile[];
    error?: string;
}

export class ReviewSelectedCommitsService extends ReviewWorkflowServiceBase {
    constructor(gitService: GitService, llmService: LLMService) {
        super(gitService, llmService);
    }

    /**
     * Generate a review for a range of selected commits.
     * Uses oldest^..newest to extract the combined diff,
     * then runs the full multi-agent review pipeline.
     */
    async generateReview(
        oldestSha: string,
        newestSha: string,
        commitCount: number,
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
                const dependencyState = await this.prepareAdapter(
                    provider, model, language, strategy,
                    apiKey, baseURL, contextWindow, maxOutputTokens
                );
                if (!dependencyState.adapter) {
                    return { success: false, error: dependencyState.error };
                }

                onProgress?.(`Getting diff for ${commitCount} selected commit(s)...`);
                const branchDiff = await this.gitService.getCommitRangeDiff(oldestSha, newestSha);

                if (branchDiff.changes.length === 0) {
                    return { success: false, error: 'No changes found in the selected commits.' };
                }

                const currentBranch = await this.gitService.getCurrentBranch() ?? '';
                const reviewCtx = {
                    branch: currentBranch,
                    repoName: this.gitService.getWorkspaceRoot().split('/').pop() ?? '',
                };
                const customSystemPrompt = await this.gitService.getCustomReviewMergeSystemPrompt(reviewCtx);
                const customAgentInstructions = await this.gitService.getCustomReviewMergeAgentPrompt(reviewCtx);
                const customRules = await this.gitService.getCustomReviewMergeRules(reviewCtx);

                const systemMessage = SYSTEM_PROMPT_GENERATE_REVIEW_MERGE(
                    language, customSystemPrompt, customRules, customAgentInstructions
                );
                const basePrompt = this.buildReviewPrompt(
                    oldestSha, newestSha, commitCount, branchDiff.diff, taskInfo
                );

                const sharedStore = new SharedContextStoreImpl();
                const tokenEstimator = new TokenEstimatorService();
                const budgetManager = new ContextBudgetManager(DEFAULT_BUDGET_CONFIG, tokenEstimator);
                const promptBuilder = new AgentPromptBuilder(budgetManager, tokenEstimator);

                onProgress?.("Building dependency graph from VS Code index...");
                const graphIndex = new DependencyGraphIndex(
                    DEFAULT_GRAPH_CONFIG, this.gitService, newestSha
                );
                let dependencyGraph;
                try {
                    dependencyGraph = await graphIndex.build(branchDiff.changes);
                    sharedStore.setDependencyGraph(dependencyGraph);
                    onLog?.(`[pre-analysis] graph built: ${dependencyGraph.fileDependencies.size} files, ${dependencyGraph.symbolMap.size} symbols, ${dependencyGraph.criticalPaths.length} critical paths`);
                } catch (error) {
                    onLog?.(`[pre-analysis] failed, falling back to legacy: ${error}`);
                }

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
                onLog?.(
                    `[reference] symbols=${dynamicReferenceContextResult.metadata.symbolsResolved}/${dynamicReferenceContextResult.metadata.candidateSymbols} files=${dynamicReferenceContextResult.metadata.filesIncluded} tokens~${dynamicReferenceContextResult.metadata.estimatedTokens} trigger=${dynamicReferenceContextResult.metadata.triggerReason} expanded=${dynamicReferenceContextResult.metadata.triggered} truncated=${dynamicReferenceContextResult.metadata.truncatedByBudget}`
                );

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
                    compareBranch: newestSha,
                    gitService: this.gitService,
                };

                const codeReviewerAgent = promptBuilder.buildCodeReviewerPrompt(buildContext, safeBudgets[0]);
                const flowDiagramAgent = promptBuilder.buildFlowDiagramPrompt(buildContext, safeBudgets[1]);
                const detailChangeAgent = promptBuilder.buildDetailChangePrompt(
                    buildContext, { ...safeBudgets[0], agentRole: 'Detail Change' }
                );
                const agents: AgentPrompt[] = [codeReviewerAgent, flowDiagramAgent, detailChangeAgent];

                const review = await this.contextOrchestrator.generateMultiAgentFinalText(
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
                    {
                        adapter: dependencyState.adapter,
                        strategy,
                        changes: branchDiff.changes,
                        signal: abortController.signal,
                        onProgress,
                        onLog,
                        onLlmLog,
                        task: this.buildTaskSpec(
                            oldestSha, newestSha, commitCount, branchDiff.diff, taskInfo,
                            systemMessage, dynamicReferenceContextResult.context
                        ),
                    },
                    {
                        sharedStore,
                        promptBuilder,
                        buildContext,
                        budgetAllocations: safeBudgets,
                    }
                );

                return {
                    success: true,
                    review: this.gitService.normalizeGeneratedPaths(review, branchDiff.changes),
                    diff: branchDiff.diff,
                    changes: branchDiff.changes,
                };
            } catch (error) {
                if (error instanceof GenerationCancelledError) {
                    return { success: false, error: 'Review generation cancelled.' };
                }
                return { success: false, error: `${error}` };
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
    ): Promise<{ success: boolean; content?: string; error?: string }> {
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

    private buildReviewPrompt(
        oldestSha: string,
        newestSha: string,
        commitCount: number,
        diff: string,
        taskInfo?: string
    ): string {
        return `# Selected Commits Review

**Commit range:** ${oldestSha.slice(0, 7)}..${newestSha.slice(0, 7)} (${commitCount} commit${commitCount > 1 ? 's' : ''})
${taskInfo ? `\n**Task Context:** ${taskInfo}\n` : ''}

## Changes:

${diff}

Please analyze these changes and provide a comprehensive review of the selected commits.`;
    }

    private buildTaskSpec(
        oldestSha: string,
        newestSha: string,
        commitCount: number,
        diff: string,
        taskInfo: string | undefined,
        systemMessage: string,
        referenceContext?: string
    ): ContextTaskSpec {
        const rangeLabel = `${oldestSha.slice(0, 7)}..${newestSha.slice(0, 7)}`;
        return {
            kind: 'mergeReview',
            label: 'selected commits review',
            systemMessage,
            directPrompt: referenceContext
                ? `${this.buildReviewPrompt(oldestSha, newestSha, commitCount, diff, taskInfo)}\n\n${referenceContext}`
                : this.buildReviewPrompt(oldestSha, newestSha, commitCount, diff, taskInfo),
            buildCoordinatorPrompt: ({ changedFilesSummary, analysesSummary }) => `# Selected Commits Review

**Commit range:** ${rangeLabel} (${commitCount} commit${commitCount > 1 ? 's' : ''})
${taskInfo ? `\n**Task Context:** ${taskInfo}\n` : ''}

## Changed Files:

${changedFilesSummary}

## Hierarchical Chunk Summaries:

${analysesSummary}

${referenceContext ? `${referenceContext}\n\n` : ''}Please analyze these changes and provide a comprehensive review of the selected commits.
Do not mention that the diff was summarized in multiple stages.`
        };
    }
}
