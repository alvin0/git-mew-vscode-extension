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
import {
    AgentPromptBuildContext,
    StructuredAgentReport,
    CodeReviewerOutput,
    FlowDiagramOutput,
    ObserverOutput,
    SecurityAnalystOutput,
    SynthesisAgentContext
} from '../../services/llm/orchestrator/orchestratorTypes';
import { ReviewMemoryService } from '../../services/llm/ReviewMemoryService';
import {
    PatternEntry,
    ResolutionStats,
    ReviewSummary,
    SuppressedFinding
} from '../../services/llm/reviewMemoryTypes';
import { mergeSynthesisOutputs } from '../../services/llm/orchestrator/SynthesisMerger';
import { REVIEW_OUTPUT_CONTRACT } from '../../prompts/reviewOutputContract';
import { randomUUID } from 'crypto';

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
    private reviewMemory?: ReviewMemoryService;

    constructor(gitService: GitService, llmService: LLMService) {
        super(gitService, llmService);
    }

    setReviewMemory(memory: ReviewMemoryService): void {
        this.reviewMemory = memory;
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

                const currentBranch = await this.gitService.getCurrentBranch() ?? '';
                const reviewCtx = {
                    branch: currentBranch,
                    repoName: this.gitService.getWorkspaceRoot().split('/').pop() ?? '',
                };
                const customSystemPrompt = await this.gitService.getCustomReviewMergeSystemPrompt(reviewCtx);
                const customAgentInstructions = await this.gitService.getCustomReviewMergeAgentPrompt(reviewCtx);
                const customRules = await this.gitService.getCustomReviewMergeRules(reviewCtx);
                const systemPrompt = this.buildStagedReviewSystemPrompt(
                    language,
                    customSystemPrompt,
                    customRules,
                    customAgentInstructions
                );
                const basePrompt = this.buildReviewPrompt(preview.diff, taskInfo);
                const reviewStartTime = Date.now();

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

                let relevantPatterns: PatternEntry[] = [];
                let suppressedFindings: SuppressedFinding[] = [];
                let relevantHistory: ReviewSummary[] = [];
                let resolutionStats: ResolutionStats = {
                    overallRate: 0,
                    byAgent: {},
                    historicalDismissRates: {},
                };

                if (this.reviewMemory) {
                    const fileGlobs = preview.changes.map(file => file.relativePath);
                    relevantPatterns = await this.reviewMemory.getPatterns(fileGlobs);
                    suppressedFindings = await this.reviewMemory.getSuppressedFindings();
                    relevantHistory = await this.reviewMemory.getRelevantHistory(fileGlobs, 3);
                    resolutionStats = {
                        overallRate: await this.reviewMemory.getResolutionRate(),
                        byAgent: await this.reviewMemory.getAgentResolutionRates(),
                        historicalDismissRates: await this.reviewMemory.getHistoricalDismissRates(),
                    };
                    await this.reviewMemory.decayPatterns();
                }

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
                    relevantPatterns,
                    relevantHistory,
                    resolutionStats,
                    suppressedFindings,
                };
                const codeReviewerBudget = safeBudgets.find(budget => budget.agentRole === 'Code Reviewer') ?? safeBudgets[0];
                const flowDiagramBudget = safeBudgets.find(budget => budget.agentRole === 'Flow Diagram') ?? safeBudgets[1];
                const securityBudget = safeBudgets.find(budget => budget.agentRole === 'Security Analyst') ?? codeReviewerBudget;

                const codeReviewerAgent = promptBuilder.buildCodeReviewerPrompt(buildContext, codeReviewerBudget);
                const flowDiagramAgent = promptBuilder.buildFlowDiagramPrompt(buildContext, flowDiagramBudget);
                const securityAgent = promptBuilder.buildSecurityAgentPrompt(buildContext, securityBudget);
                const detailChangeAgent = promptBuilder.buildDetailChangePrompt(
                    buildContext,
                    { ...codeReviewerBudget, agentRole: 'Detail Change' }
                );

                const agents: AgentPrompt[] = [codeReviewerAgent, flowDiagramAgent, detailChangeAgent, securityAgent];
                const reviewRequest = {
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
                };

                const phaseReports = await this.contextOrchestrator.executePhasedAgentReports(
                    {
                        phase1: agents,
                        phase2: [],
                        sharedStore,
                        promptBuilder,
                        buildContext,
                        budgetAllocations: safeBudgets,
                    },
                    dependencyState.adapter,
                    abortController.signal,
                    reviewRequest
                );

                const structuredReports: StructuredAgentReport[] = [];
                const crFindings = sharedStore.getAgentFindings('Code Reviewer');
                const fdFindings = sharedStore.getAgentFindings('Flow Diagram');
                const saFindings = sharedStore.getAgentFindings('Security Analyst');
                const obsFindings = sharedStore.getAgentFindings('Observer');

                if (crFindings.length > 0) {
                    structuredReports.push({
                        role: 'Code Reviewer',
                        structured: crFindings[0].data as CodeReviewerOutput,
                        raw: this.getRawAgentReport(phaseReports, 'Code Reviewer'),
                    });
                }
                if (fdFindings.length > 0) {
                    structuredReports.push({
                        role: 'Flow Diagram',
                        structured: fdFindings[0].data as FlowDiagramOutput,
                        raw: this.getRawAgentReport(phaseReports, 'Flow Diagram'),
                    });
                }
                if (saFindings.length > 0) {
                    structuredReports.push({
                        role: 'Security Analyst',
                        structured: saFindings[0].data as SecurityAnalystOutput,
                        raw: this.getRawAgentReport(phaseReports, 'Security Analyst'),
                    });
                }
                if (obsFindings.length > 0) {
                    structuredReports.push({
                        role: 'Observer',
                        structured: obsFindings[0].data as ObserverOutput,
                        raw: this.getRawAgentReport(phaseReports, 'Observer'),
                    });
                }

                const synthCtx: SynthesisAgentContext = {
                    diffSummary: promptBuilder.buildDiffSummary(preview.changes),
                    changedFiles: preview.changes,
                    outputContract: REVIEW_OUTPUT_CONTRACT,
                    suppressedFindings,
                    resolutionStats,
                    codeReviewerFindings: crFindings[0]?.data as CodeReviewerOutput | undefined,
                    securityFindings: saFindings[0]?.data as SecurityAnalystOutput | undefined,
                    observerFindings: obsFindings[0]?.data as ObserverOutput | undefined,
                    flowDiagramFindings: fdFindings[0]?.data as FlowDiagramOutput | undefined,
                    detailChangeReport: this.getRawAgentReport(phaseReports, 'Detail Change'),
                    hypothesisVerdicts: (obsFindings[0]?.data as ObserverOutput | undefined)?.hypothesisVerdicts,
                    dependencyGraphSummary: dependencyGraph
                        ? DependencyGraphIndex.serializeForPrompt(dependencyGraph, 'summary')
                        : undefined,
                };

                const synthesisBudgets = budgetManager.allocateSynthesisBudgets(
                    adapterContextWindow,
                    adapterMaxOutputTokens,
                    systemTokens,
                );
                const summaryBudget = synthesisBudgets.find(budget => budget.agentRole === 'Summary & Detail') ?? synthesisBudgets[0];
                const improvementBudget = synthesisBudgets.find(budget => budget.agentRole === 'Improvement Suggestions') ?? synthesisBudgets[1];
                const riskBudget = synthesisBudgets.find(budget => budget.agentRole === 'Risk & TODO') ?? synthesisBudgets[2];
                const diagramBudget = synthesisBudgets.find(budget => budget.agentRole === 'Diagram & Assessment') ?? synthesisBudgets[3];

                const synthesisAgents = [
                    promptBuilder.buildSummaryDetailAgentPrompt(synthCtx, summaryBudget),
                    promptBuilder.buildImprovementSuggestionsAgentPrompt(synthCtx, improvementBudget),
                    promptBuilder.buildRiskTodoAgentPrompt(synthCtx, riskBudget),
                    promptBuilder.buildDiagramAssessmentAgentPrompt(synthCtx, diagramBudget),
                ];

                onProgress?.('Running synthesis agents...');
                const synthesisOutputs = await this.contextOrchestrator.executeSynthesisAgentReports(
                    synthesisAgents,
                    dependencyState.adapter,
                    abortController.signal,
                    reviewRequest,
                );

                const review = mergeSynthesisOutputs(
                    synthesisOutputs,
                    preview.changes,
                    structuredReports,
                    suppressedFindings,
                    Date.now() - reviewStartTime,
                    synthCtx.detailChangeReport,
                );

                if (this.reviewMemory) {
                    await this.reviewMemory.savePatterns(structuredReports);
                    await this.reviewMemory.saveReviewSummary(this.buildReviewSummary(
                        preview.changes,
                        crFindings[0]?.data as CodeReviewerOutput | undefined,
                        saFindings[0]?.data as SecurityAnalystOutput | undefined,
                    ));
                }

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

    private buildReviewSummary(
        changes: UnifiedDiffFile[],
        codeReviewer?: CodeReviewerOutput,
        security?: SecurityAnalystOutput,
    ): ReviewSummary {
        const issueCounts: Record<string, number> = {};
        for (const issue of codeReviewer?.issues ?? []) {
            issueCounts[issue.severity] = (issueCounts[issue.severity] ?? 0) + 1;
        }

        const securityVulnCounts: Record<string, number> = {};
        for (const vulnerability of security?.vulnerabilities ?? []) {
            securityVulnCounts[vulnerability.type] = (securityVulnCounts[vulnerability.type] ?? 0) + 1;
        }

        const topFindings = [
            ...(codeReviewer?.issues ?? []).map(issue => ({
                severity: issue.severity,
                description: issue.description,
                file: issue.file,
            })),
            ...(security?.vulnerabilities ?? []).map(vulnerability => ({
                severity: vulnerability.severity,
                description: vulnerability.description,
                file: vulnerability.file,
            })),
        ].slice(0, 5);

        return {
            id: randomUUID(),
            timestamp: Date.now(),
            baseBranch: 'STAGED',
            compareBranch: 'WORKTREE',
            changedFiles: changes.map(change => change.relativePath),
            qualityVerdict: codeReviewer?.qualityVerdict ?? 'N/A',
            issueCounts,
            securityVulnCounts,
            topFindings,
            resolutionRate: undefined,
        };
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
