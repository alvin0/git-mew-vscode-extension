import { LLMProvider } from '../../llm-adapter';
import { ReviewErrorPayload } from './types';

export interface ReviewErrorContext {
    operation: string;
    provider?: LLMProvider;
    model?: string;
    baseBranch?: string;
    compareBranch?: string;
    command?: string;
    target?: string;
    hint?: string;
}

export function createReviewErrorPayload(
    error: unknown,
    context: ReviewErrorContext,
    overrides?: Partial<Pick<ReviewErrorPayload, 'title' | 'summary' | 'hint'>>
): ReviewErrorPayload {
    const normalizedError = normalizeUnknownError(error);

    return {
        title: overrides?.title || 'Review workflow failed',
        summary: overrides?.summary || normalizedError.summary,
        rawError: normalizedError.rawError,
        operation: context.operation,
        timestamp: new Date().toISOString(),
        provider: context.provider,
        model: context.model,
        baseBranch: context.baseBranch,
        compareBranch: context.compareBranch,
        command: context.command,
        target: context.target,
        hint: overrides?.hint || context.hint,
    };
}

function normalizeUnknownError(error: unknown): { summary: string; rawError: string; } {
    if (error instanceof Error) {
        return {
            summary: error.message || error.name || 'Unknown error occurred.',
            rawError: error.stack || `${error.name}: ${error.message}`,
        };
    }

    if (typeof error === 'string') {
        return {
            summary: firstMeaningfulLine(error),
            rawError: error,
        };
    }

    try {
        const serialized = JSON.stringify(error, null, 2);
        return {
            summary: firstMeaningfulLine(serialized) || 'Unknown error occurred.',
            rawError: serialized,
        };
    } catch {
        const fallback = String(error);
        return {
            summary: firstMeaningfulLine(fallback),
            rawError: fallback,
        };
    }
}

function firstMeaningfulLine(value: string): string {
    const firstLine = value
        .split('\n')
        .map((line) => line.trim())
        .find(Boolean);

    return firstLine || 'Unknown error occurred.';
}
