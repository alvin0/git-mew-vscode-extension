import { LLMProvider } from '../../llm-adapter';
import { captureError, ErrorSeverity } from '../../services/sentry';
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

/** Validation / user-input messages — không cần gửi Sentry */
const VALIDATION_PATTERNS = [
    'Please select all fields',
    'must be different',
];

/** Lỗi cosmetic — chỉ log breadcrumb, không tạo Sentry event */
const COSMETIC_OPERATIONS = [
    'repair PlantUML',
];

/**
 * Lỗi từ hệ thống/môi trường user — không phải bug của extension.
 * API errors, network, git config, v.v.
 */
const USER_ENVIRONMENT_PATTERNS = [
    'API key',
    'api_key',
    'Unauthorized',
    'Forbidden',
    'rate limit',
    'quota',
    'too many requests',
    'Request timeout',
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'ETIMEDOUT',
    'fetch failed',
    'Cannot connect to Ollama',
    'socket hang up',
    'API error:',
    'Service Unavailable',
    'Bad Gateway',
    'Internal Server Error',
    'overloaded',
    'Git extension not found',
    'No Git repository found',
    'Model name is required',
    'Adapter not initialized',
    'base URL is required',
    'exceeds the limit',
    'context length exceeded',
];

function classifyErrorSeverity(error: unknown, context: ReviewErrorContext): ErrorSeverity | 'skip' {
    const errorStr = error instanceof Error ? error.message : String(error);

    // Validation errors: user chưa nhập đủ → không gửi
    if (VALIDATION_PATTERNS.some(p => errorStr.includes(p))) {
        return 'skip';
    }

    // Cancelled bởi user → không gửi
    if (errorStr.includes('cancelled') || errorStr.includes('canceled')) {
        return 'skip';
    }

    // PlantUML repair fail → cosmetic, chỉ breadcrumb
    if (COSMETIC_OPERATIONS.includes(context.operation)) {
        return 'cosmetic';
    }

    // Lỗi từ hệ thống/môi trường user → skip, không phải bug
    if (USER_ENVIRONMENT_PATTERNS.some(p => errorStr.toLowerCase().includes(p.toLowerCase()))) {
        return 'skip';
    }

    // Error là instance Error có stack → crash thật
    if (error instanceof Error) {
        return 'crash';
    }

    // Còn lại (API error string, unknown) → operational
    return 'operational';
}

export function createReviewErrorPayload(
    error: unknown,
    context: ReviewErrorContext,
    overrides?: Partial<Pick<ReviewErrorPayload, 'title' | 'summary' | 'hint'>>
): ReviewErrorPayload {
    const normalizedError = normalizeUnknownError(error);

    const payload: ReviewErrorPayload = {
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

    const severity = classifyErrorSeverity(error, context);
    if (severity !== 'skip') {
        captureError(error, {
            operation: payload.operation,
            provider: payload.provider,
            model: payload.model,
            command: payload.command,
            title: payload.title,
            summary: payload.summary,
        }, severity);
    }

    return payload;
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
