import * as path from 'path';
import * as vscode from 'vscode';
import { ContextOrchestratorService, ContextStrategy, UnifiedDiffFile } from '../../services/llm';
import { TokenEstimatorService } from '../../services/llm/TokenEstimatorService';
import { resolveSymbolDefinitions } from '../../utils/symbolDefinitionResolver';

const LEGACY_MAX_REFERENCE_FILES = 4;
const MAX_LINES_PER_REFERENCE = 40;
const MAX_SYMBOLS_TOTAL = 24;
const MAX_SYMBOLS_PER_FILE = 8;
const MAX_EXPANDED_REFERENCE_FILES = 8;
const MAX_EXPANDED_SECTIONS_PER_FILE = 3;
const AUTO_TRIGGER_FILE_COUNT = 3;
const AUTO_TRIGGER_PROMPT_RATIO = 0.7;

const IDENTIFIER_REGEX = /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g;
const SYMBOL_STOP_WORDS = new Set([
    'const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum',
    'public', 'private', 'protected', 'return', 'await', 'async', 'new',
    'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue',
    'try', 'catch', 'finally', 'import', 'from', 'export', 'default', 'extends',
    'implements', 'true', 'false', 'null', 'undefined', 'this', 'super'
]);

export type ReferenceContextMode = 'auto' | 'always' | 'off';
export type ReferenceTriggerReason =
    | 'always'
    | 'hierarchical'
    | 'file-count'
    | 'prompt-budget'
    | 'disabled'
    | 'not-needed'
    | 'insufficient-input';

export interface ReviewReferenceContextOptions {
    strategy: ContextStrategy;
    model: string;
    contextWindow: number;
    mode?: ReferenceContextMode;
    systemMessage?: string;
    directPrompt?: string;
    effectiveStrategy?: ContextStrategy;
    maxSymbols?: number;
    maxReferenceFiles?: number;
    tokenBudget?: number;
}

export interface ReviewReferenceContextMetadata {
    mode: ReferenceContextMode;
    effectiveStrategy: ContextStrategy;
    triggerReason: ReferenceTriggerReason;
    triggered: boolean;
    candidateSymbols: number;
    symbolsResolved: number;
    filesIncluded: number;
    estimatedTokens: number;
    expansionTokenCap: number;
    truncatedByBudget: boolean;
}

export interface ReviewReferenceContextResult {
    context?: string;
    metadata: ReviewReferenceContextMetadata;
}

export interface CandidateSymbol {
    symbol: string;
    filePath: string;
}

interface ExpansionBuildResult {
    context?: string;
    symbolsResolved: number;
    filesIncluded: number;
    truncatedByBudget: boolean;
}

export interface AutoExpansionDecisionInput {
    mode?: ReferenceContextMode;
    strategy: ContextStrategy;
    effectiveStrategy?: ContextStrategy;
    model: string;
    contextWindow: number;
    systemMessage?: string;
    directPrompt?: string;
    changedFileCount: number;
}

export interface AutoExpansionDecision {
    triggered: boolean;
    triggerReason: ReferenceTriggerReason;
    effectiveStrategy: ContextStrategy;
    promptTokenEstimate: number;
    directInputBudget: number;
}

export function computeReferenceExpansionTokenCap(contextWindow: number): number {
    return Math.min(4500, Math.floor(contextWindow * 0.25));
}

export function extractCandidateSymbolsFromDiff(
    changedFiles: UnifiedDiffFile[],
    maxTotal: number = MAX_SYMBOLS_TOTAL,
    maxPerFile: number = MAX_SYMBOLS_PER_FILE
): CandidateSymbol[] {
    const candidates: CandidateSymbol[] = [];
    const globalSeen = new Set<string>();

    for (const file of changedFiles) {
        if (file.isBinary || file.isDeleted) {
            continue;
        }

        const perFileSeen = new Set<string>();
        const changedLines = file.diff
            .split('\n')
            .filter((line) =>
                (line.startsWith('+') || line.startsWith('-')) &&
                !line.startsWith('+++') &&
                !line.startsWith('---')
            )
            .map((line) => line.slice(1));

        for (const line of changedLines) {
            const symbols = line.match(IDENTIFIER_REGEX) || [];
            for (const symbol of symbols) {
                const lower = symbol.toLowerCase();
                if (SYMBOL_STOP_WORDS.has(lower) || perFileSeen.has(symbol) || globalSeen.has(symbol)) {
                    continue;
                }

                perFileSeen.add(symbol);
                globalSeen.add(symbol);
                candidates.push({ symbol, filePath: file.filePath });

                if (perFileSeen.size >= maxPerFile || candidates.length >= maxTotal) {
                    break;
                }
            }

            if (perFileSeen.size >= maxPerFile || candidates.length >= maxTotal) {
                break;
            }
        }

        if (candidates.length >= maxTotal) {
            break;
        }
    }

    return candidates;
}

export function shouldAutoExpandReferenceContext(input: AutoExpansionDecisionInput): AutoExpansionDecision {
    const mode = input.mode || 'auto';
    const tokenEstimator = new TokenEstimatorService();
    const orchestrator = new ContextOrchestratorService();
    const budgetProfile = orchestrator.getBudgetProfile(input.contextWindow);
    const promptTokenEstimate = tokenEstimator.estimateTextTokens(input.systemMessage || '', input.model) +
        tokenEstimator.estimateTextTokens(input.directPrompt || '', input.model);
    const directInputBudget = budgetProfile.directInputBudget;

    const effectiveStrategy = input.effectiveStrategy ||
        orchestrator.resolveStrategy(
            input.strategy,
            input.contextWindow,
            input.model,
            input.systemMessage || '',
            input.directPrompt || ''
        );

    if (mode === 'off') {
        return {
            triggered: false,
            triggerReason: 'disabled',
            effectiveStrategy,
            promptTokenEstimate,
            directInputBudget,
        };
    }

    if (mode === 'always') {
        return {
            triggered: true,
            triggerReason: 'always',
            effectiveStrategy,
            promptTokenEstimate,
            directInputBudget,
        };
    }

    if (!input.systemMessage || !input.directPrompt) {
        return {
            triggered: false,
            triggerReason: 'insufficient-input',
            effectiveStrategy,
            promptTokenEstimate,
            directInputBudget,
        };
    }

    if (effectiveStrategy === 'hierarchical') {
        return {
            triggered: true,
            triggerReason: 'hierarchical',
            effectiveStrategy,
            promptTokenEstimate,
            directInputBudget,
        };
    }

    if (input.changedFileCount >= AUTO_TRIGGER_FILE_COUNT) {
        return {
            triggered: true,
            triggerReason: 'file-count',
            effectiveStrategy,
            promptTokenEstimate,
            directInputBudget,
        };
    }

    if (promptTokenEstimate > Math.floor(directInputBudget * AUTO_TRIGGER_PROMPT_RATIO)) {
        return {
            triggered: true,
            triggerReason: 'prompt-budget',
            effectiveStrategy,
            promptTokenEstimate,
            directInputBudget,
        };
    }

    return {
        triggered: false,
        triggerReason: 'not-needed',
        effectiveStrategy,
        promptTokenEstimate,
        directInputBudget,
    };
}

export class ReviewReferenceContextProvider {
    private readonly tokenEstimator = new TokenEstimatorService();

    async buildReferenceContext(
        changedFiles: UnifiedDiffFile[],
        options?: ReviewReferenceContextOptions
    ): Promise<ReviewReferenceContextResult> {
        const mode = options?.mode || 'auto';
        const maxSymbols = options?.maxSymbols ?? MAX_SYMBOLS_TOTAL;
        const maxFiles = options?.maxReferenceFiles ?? MAX_EXPANDED_REFERENCE_FILES;
        const expansionTokenCap = options?.tokenBudget ?? computeReferenceExpansionTokenCap(options?.contextWindow || 32768);
        const decision = options
            ? shouldAutoExpandReferenceContext({
                mode,
                strategy: options.strategy,
                effectiveStrategy: options.effectiveStrategy,
                model: options.model,
                contextWindow: options.contextWindow,
                systemMessage: options.systemMessage,
                directPrompt: options.directPrompt,
                changedFileCount: changedFiles.length,
            })
            : {
                triggered: false,
                triggerReason: 'insufficient-input' as ReferenceTriggerReason,
                effectiveStrategy: 'direct' as ContextStrategy,
            };

        const legacyContext = await this.buildLegacyReferenceContext(changedFiles);
        const candidates = decision.triggered ? extractCandidateSymbolsFromDiff(changedFiles, maxSymbols, MAX_SYMBOLS_PER_FILE) : [];
        const expanded = decision.triggered
            ? await this.buildExpandedSymbolContext(changedFiles, candidates, expansionTokenCap, maxFiles)
            : { context: undefined, symbolsResolved: 0, filesIncluded: 0, truncatedByBudget: false };

        const combinedContext = [legacyContext, expanded.context].filter(Boolean).join('\n\n') || undefined;
        const estimatedTokens = combinedContext
            ? this.tokenEstimator.estimateTextTokens(combinedContext, options?.model)
            : 0;

        return {
            context: combinedContext,
            metadata: {
                mode,
                effectiveStrategy: decision.effectiveStrategy,
                triggerReason: decision.triggerReason,
                triggered: decision.triggered,
                candidateSymbols: candidates.length,
                symbolsResolved: expanded.symbolsResolved,
                filesIncluded: this.countSectionHeaders(legacyContext) + expanded.filesIncluded,
                estimatedTokens,
                expansionTokenCap,
                truncatedByBudget: expanded.truncatedByBudget,
            },
        };
    }

    private async buildLegacyReferenceContext(changedFiles: UnifiedDiffFile[]): Promise<string | undefined> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const changedPaths = new Set(changedFiles.map((file) => path.normalize(file.filePath)));
        const candidateFiles = new Set<string>();

        for (const changedFile of changedFiles) {
            if (changedFile.isBinary || changedFile.isDeleted) {
                continue;
            }

            const relatedFiles = await this.findRelatedFiles(changedFile.filePath);
            for (const relatedFile of relatedFiles) {
                const normalizedPath = path.normalize(relatedFile);
                if (!changedPaths.has(normalizedPath)) {
                    candidateFiles.add(normalizedPath);
                }
                if (candidateFiles.size >= LEGACY_MAX_REFERENCE_FILES) {
                    break;
                }
            }
            if (candidateFiles.size >= LEGACY_MAX_REFERENCE_FILES) {
                break;
            }
        }

        const selectedFiles = Array.from(candidateFiles).slice(0, LEGACY_MAX_REFERENCE_FILES);
        if (selectedFiles.length === 0) {
            return undefined;
        }

        const renderedFiles = await Promise.all(
            selectedFiles.map(async (filePath) => {
                try {
                    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                    const relativePath = path.relative(workspaceRoot, filePath);
                    const summaryLines = this.extractRelevantLines(document.getText());
                    if (summaryLines.length === 0) {
                        return undefined;
                    }

                    return `### ${relativePath}\n\`\`\`\n${summaryLines.join('\n')}\n\`\`\``;
                } catch {
                    return undefined;
                }
            })
        );

        const sections = renderedFiles.filter((value): value is string => Boolean(value));
        if (sections.length === 0) {
            return undefined;
        }

        return [
            '## Additional Reference Context',
            'The following read-only files are outside the diff but appear related to the reviewed flow. Use them only as supporting context for hidden risk analysis and flow reconstruction.',
            ...sections,
        ].join('\n\n');
    }

    private async buildExpandedSymbolContext(
        changedFiles: UnifiedDiffFile[],
        candidates: CandidateSymbol[],
        tokenBudget: number,
        maxFiles: number = MAX_EXPANDED_REFERENCE_FILES
    ): Promise<ExpansionBuildResult> {
        if (candidates.length === 0 || tokenBudget <= 0) {
            return {
                context: undefined,
                symbolsResolved: 0,
                filesIncluded: 0,
                truncatedByBudget: false,
            };
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return {
                context: undefined,
                symbolsResolved: 0,
                filesIncluded: 0,
                truncatedByBudget: false,
            };
        }

        const changedPaths = new Set(changedFiles.map((file) => path.normalize(file.filePath)));
        const documentCache = new Map<string, vscode.TextDocument>();
        const definitionKeys = new Set<string>();
        const resolvedSymbols = new Set<string>();
        const sectionsByFile = new Map<string, string[]>();
        let consumedTokens = 0;
        let truncatedByBudget = false;

        for (const candidate of candidates) {
            if (sectionsByFile.size >= maxFiles) {
                break;
            }

            const sourceDoc = await this.openDocumentCached(candidate.filePath, documentCache);
            if (!sourceDoc) {
                continue;
            }

            const definitions = await resolveSymbolDefinitions(sourceDoc, candidate.symbol, { maxMatches: 2 });
            for (const definition of definitions) {
                if (definition.uri.scheme !== 'file') {
                    continue;
                }

                const normalizedDefPath = path.normalize(definition.uri.fsPath);
                if (changedPaths.has(normalizedDefPath)) {
                    continue;
                }

                const sectionKey = `${definition.uri.toString()}#${definition.range.start.line}:${definition.range.start.character}-${definition.range.end.line}:${definition.range.end.character}`;
                if (definitionKeys.has(sectionKey)) {
                    continue;
                }

                if (!sectionsByFile.has(normalizedDefPath) && sectionsByFile.size >= maxFiles) {
                    break;
                }

                const sectionList = sectionsByFile.get(normalizedDefPath) || [];
                if (sectionList.length >= MAX_EXPANDED_SECTIONS_PER_FILE) {
                    continue;
                }

                const defDoc = await this.openDocumentCached(normalizedDefPath, documentCache);
                if (!defDoc) {
                    continue;
                }

                const renderedSection = this.renderDefinitionSection(
                    defDoc,
                    definition.range,
                    candidate.symbol,
                    workspaceRoot
                );
                const sectionTokens = this.tokenEstimator.estimateTextTokens(renderedSection);
                if (consumedTokens + sectionTokens > tokenBudget) {
                    truncatedByBudget = true;
                    break;
                }

                consumedTokens += sectionTokens;
                definitionKeys.add(sectionKey);
                resolvedSymbols.add(candidate.symbol);
                sectionList.push(renderedSection);
                sectionsByFile.set(normalizedDefPath, sectionList);
            }

            if (truncatedByBudget) {
                break;
            }
        }

        const sections = Array.from(sectionsByFile.values()).flat();
        if (sections.length === 0) {
            return {
                context: undefined,
                symbolsResolved: 0,
                filesIncluded: 0,
                truncatedByBudget,
            };
        }

        const context = [
            '## Additional Reference Context (Expanded)',
            'The following snippets were resolved from symbols used in changed lines. Use them to improve flow understanding and risk detection.',
            ...sections,
        ].join('\n\n');

        return {
            context,
            symbolsResolved: resolvedSymbols.size,
            filesIncluded: sectionsByFile.size,
            truncatedByBudget,
        };
    }

    private renderDefinitionSection(
        document: vscode.TextDocument,
        range: vscode.Range,
        symbol: string,
        workspaceRoot: string
    ): string {
        const startLine = Math.max(0, range.start.line - 6);
        const preferredEnd = Math.max(range.end.line + 10, startLine + MAX_LINES_PER_REFERENCE - 1);
        const endLine = Math.min(document.lineCount - 1, preferredEnd, startLine + MAX_LINES_PER_REFERENCE - 1);
        const lines: string[] = [];
        for (let line = startLine; line <= endLine; line++) {
            lines.push(document.lineAt(line).text);
        }

        const relativePath = path.relative(workspaceRoot, document.uri.fsPath);
        const lineLabel = `${range.start.line + 1}-${range.end.line + 1}`;

        return `### ${relativePath} :: ${symbol} (line ${lineLabel})\n\`\`\`\n${lines.join('\n')}\n\`\`\``;
    }

    private async openDocumentCached(
        filePath: string,
        cache: Map<string, vscode.TextDocument>
    ): Promise<vscode.TextDocument | undefined> {
        const normalizedPath = path.normalize(filePath);
        const cached = cache.get(normalizedPath);
        if (cached) {
            return cached;
        }

        try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(normalizedPath));
            cache.set(normalizedPath, document);
            return document;
        } catch {
            return undefined;
        }
    }

    private async findRelatedFiles(filePath: string): Promise<string[]> {
        try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            const relatedFiles = new Set<string>();

            const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
                'vscode.executeLinkProvider',
                document.uri
            );

            for (const link of links || []) {
                if (link.target?.scheme === 'file') {
                    relatedFiles.add(link.target.fsPath);
                }
                if (relatedFiles.size >= LEGACY_MAX_REFERENCE_FILES) {
                    break;
                }
            }

            return Array.from(relatedFiles);
        } catch {
            return [];
        }
    }

    private extractRelevantLines(content: string): string[] {
        const lines = content.split('\n');
        const matched = lines.filter((line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                return false;
            }

            return /^(import |export |class |interface |type |enum |function |async function |const [A-Za-z0-9_]+ = \(|public |private |protected )/.test(trimmed);
        });

        const sourceLines = matched.length > 0 ? matched : lines.filter((line) => line.trim()).slice(0, MAX_LINES_PER_REFERENCE);
        return sourceLines.slice(0, MAX_LINES_PER_REFERENCE);
    }

    private countSectionHeaders(context?: string): number {
        if (!context) {
            return 0;
        }

        return (context.match(/^### /gm) || []).length;
    }
}
