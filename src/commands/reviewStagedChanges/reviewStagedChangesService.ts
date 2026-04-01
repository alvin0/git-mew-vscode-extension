import { LLMProvider } from '../../llm-adapter';
import { buildReviewSystemInstructionBlock } from '../../prompts/systemPromptGenerateReviewMerge';
import {
    ContextStrategy,
    ContextTaskSpec,
    GenerationCancelledError,
    LlmRequestLogEntry,
    LLMService,
    UnifiedDiffFile
} from '../../services/llm';
import { GitService } from '../../services/utils/gitService';
import { ReviewWorkflowServiceBase } from '../reviewShared/reviewWorkflowServiceBase';
import { AgentPrompt } from '../../services/llm/ContextOrchestratorService';
import { SharedContextStoreImpl } from '../../services/llm/orchestrator/SharedContextStore';
import { ContextBudgetManager, DEFAULT_BUDGET_CONFIG } from '../../services/llm/orchestrator/ContextBudgetManager';
import { AgentPromptBuilder } from '../../services/llm/orchestrator/AgentPromptBuilder';
import { DependencyGraphIndex, DEFAULT_GRAPH_CONFIG } from '../../services/llm/orchestrator/DependencyGraphIndex';
import { TokenEstimatorService } from '../../services/llm/TokenEstimatorService';
import { AgentPromptBuildContext, StructuredAgentReport, CodeReviewerOutput, FlowDiagramOutput, ObserverOutput } from '../../services/llm/orchestrator/orchestratorTypes';

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
        onLog?: (message: string) => void,
        onLlmLog?: (entry: LlmRequestLogEntry) => void
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
                const systemPrompt = this.buildStagedReviewSystemPrompt(
                    language,
                    customSystemPrompt,
                    customRules,
                    customAgentInstructions
                );
                const basePrompt = this.buildReviewPrompt(preview.diff, taskInfo);

                // ── Step 2: Initialize new pipeline components ──
                const sharedStore = new SharedContextStoreImpl();
                const tokenEstimator = new TokenEstimatorService();
                const budgetManager = new ContextBudgetManager(DEFAULT_BUDGET_CONFIG, tokenEstimator);
                const promptBuilder = new AgentPromptBuilder(budgetManager, tokenEstimator);

                // ── Step 3: Pre-Analysis Phase ──
                onProgress?.("Building dependency graph from VS Code index...");
                const graphIndex = new DependencyGraphIndex(DEFAULT_GRAPH_CONFIG);
                let dependencyGraph;
                try {
                    dependencyGraph = await graphIndex.build(preview.changes);
                    sharedStore.setDependencyGraph(dependencyGraph);
                    onLog?.(`[pre-analysis] graph built: ${dependencyGraph.fileDependencies.size} files, ${dependencyGraph.symbolMap.size} symbols, ${dependencyGraph.criticalPaths.length} critical paths`);
                } catch (error) {
                    onLog?.(`[pre-analysis] failed, falling back to legacy: ${error}`);
                }

                // ── Step 4: Calculate budgets ──
                const adapterContextWindow = dependencyState.adapter.getContextWindow();
                const adapterMaxOutputTokens = dependencyState.adapter.getMaxOutputTokens();
                const systemTokens = tokenEstimator.estimateTextTokens(systemPrompt, dependencyState.adapter.getModel());
                const diffTokens = tokenEstimator.estimateTextTokens(preview.diff, dependencyState.adapter.getModel());
                const budgetAllocations = budgetManager.allocateAgentBudgets(adapterContextWindow, adapterMaxOutputTokens, systemTokens, diffTokens);
                const safeBudgets = budgetManager.enforceGlobalBudget(budgetAllocations, adapterContextWindow);

                // ── Step 5: Re-build reference context with dynamic limits ──
                const dynamicReferenceContextResult = await this.gitService.buildReviewReferenceContext(preview.changes, {
                    strategy,
                    model: dependencyState.adapter.getModel(),
                    contextWindow: adapterContextWindow,
                    mode: 'auto',
                    systemMessage: systemPrompt,
                    directPrompt: basePrompt,
                    maxSymbols: budgetManager.computeMaxSymbols(adapterContextWindow),
                    maxReferenceFiles: budgetManager.computeMaxReferenceFiles(adapterContextWindow),
                    tokenBudget: budgetManager.computeReferenceContextBudget(adapterContextWindow),
                });
                this.logReferenceContextMetadata(dynamicReferenceContextResult.metadata, onLog);

                // ── Step 6: Build agent-specific prompts ──
                const buildContext: AgentPromptBuildContext = {
                    fullDiff: preview.diff,
                    changedFiles: preview.changes,
                    referenceContext: dynamicReferenceContextResult.context,
                    dependencyGraph,
                    sharedContextStore: sharedStore,
                    language,
                    taskInfo,
                    customSystemPrompt,
                    customRules,
                    customAgentInstructions,
                };
                const codeReviewerAgent = promptBuilder.buildCodeReviewerPrompt(buildContext, safeBudgets[0]);
                const flowDiagramAgent = promptBuilder.buildFlowDiagramPrompt(buildContext, safeBudgets[1]);
                const detailChangeAgent = promptBuilder.buildDetailChangePrompt(
                    buildContext,
                    { ...safeBudgets[0], agentRole: 'Detail Change' }
                );

                const agents: AgentPrompt[] = [codeReviewerAgent, flowDiagramAgent, detailChangeAgent];

                // ── Step 7: Execute with phased config ──
                const review = await this.contextOrchestrator.generateMultiAgentFinalText(
                    dependencyState.adapter,
                    agents,
                    systemPrompt,
                    (reports) => {
                        // Reconstruct structured reports from SharedContextStore (has real parsed data)
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

                        // Fallback: if no structured data, build from raw text
                        if (structuredReports.length === 0) {
                            return reports.join('\n\n---\n\n');
                        }

                        return promptBuilder.buildSynthesizerPrompt(
                            structuredReports,
                            promptBuilder.buildDiffSummary(preview.changes),
                            this.getRawAgentReport(reports, 'Detail Change'),
                        );
                    },
                    abortController.signal,
                    {
                        adapter: dependencyState.adapter,
                        strategy,
                        changes: preview.changes,
                        signal: abortController.signal,
                        onProgress,
                        onLog,
                        onLlmLog,
                        task: this.buildStagedReviewTaskSpec(
                            preview.diff,
                            taskInfo,
                            systemPrompt,
                            dynamicReferenceContextResult.context
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
    private buildStagedReviewSystemPrompt(
        language: string,
        customSystemPrompt?: string,
        customRules?: string,
        customAgentInstructions?: string
    ): string {
        const instructionBlock = buildReviewSystemInstructionBlock(
            customSystemPrompt,
            customRules,
            customAgentInstructions
        );

        return `You are an expert code reviewer. Your task is to review staged changes and provide constructive feedback.

IMPORTANT: Provide your review in ${language} language.

${instructionBlock}

Be constructive, specific, and actionable in your feedback.`;
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
