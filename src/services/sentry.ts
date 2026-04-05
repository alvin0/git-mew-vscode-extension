import * as Sentry from '@sentry/node';

let initialized = false;

/**
 * Danh sách các message pattern thuộc về user-input / validation,
 * KHÔNG nên gửi lên Sentry vì không phải bug.
 */
const IGNORED_PATTERNS = [
    'Please select all fields',
    'must be different',
    'Missing PlantUML repair payload',
    'Review generation cancelled',
];

export function initSentry(extensionVersion: string) {
    if (initialized) {
        return;
    }

    Sentry.init({
        dsn: 'https://da55ab0c7da986fdad65588d812cb615@o4511155891798016.ingest.us.sentry.io/4511155900907520',
        release: `git-mew@${extensionVersion}`,
        environment: 'production',
        sendDefaultPii: false,
        // Chỉ gửi 100% error events — giảm nếu user base lớn
        sampleRate: 1.0,
        beforeSend(event) {
            // Loại bỏ thông tin nhạy cảm
            if (event.extra) {
                delete event.extra['apiKey'];
                delete event.extra['token'];
                delete event.extra['baseURL'];
            }

            // Không gửi validation / user-input errors
            const message = event.message
                || event.exception?.values?.[0]?.value
                || '';
            if (IGNORED_PATTERNS.some(p => message.includes(p))) {
                return null;
            }

            return event;
        },
    });

    initialized = true;
}

export type ErrorSeverity = 'crash' | 'operational' | 'cosmetic';

/**
 * Capture error lên Sentry với severity phân loại.
 * - crash: lỗi không mong đợi, cần fix ngay (exception trong catch)
 * - operational: lỗi từ API/network, cần theo dõi
 * - cosmetic: lỗi nhỏ (PlantUML render fail), chỉ log warning
 */
export function captureError(
    error: unknown,
    context?: Record<string, unknown>,
    severity: ErrorSeverity = 'operational'
) {
    if (!initialized) {
        return;
    }

    // Cosmetic errors chỉ log breadcrumb, không tạo event
    if (severity === 'cosmetic') {
        Sentry.addBreadcrumb({
            category: 'cosmetic-error',
            message: error instanceof Error ? error.message : String(error),
            level: 'warning',
            data: context,
        });
        return;
    }

    Sentry.withScope((scope) => {
        scope.setLevel(severity === 'crash' ? 'fatal' : 'warning');
        scope.setTag('error.severity', severity);
        if (context) {
            // Filter out undefined values — Sentry may call .replace() on extras
            // and throws if a value is undefined.
            const safeExtras: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(context)) {
                if (value !== undefined) {
                    safeExtras[key] = value;
                }
            }
            scope.setExtras(safeExtras);
        }
        Sentry.captureException(error);
    });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
    if (!initialized) {
        return;
    }
    Sentry.captureMessage(message, level);
}

export function setSentryUser(userId: string) {
    if (!initialized) {
        return;
    }
    Sentry.setUser({ id: userId });
}

export function flushSentry(timeout = 2000): Promise<boolean> {
    return Sentry.flush(timeout);
}

/**
 * Gửi feedback / góp ý từ người dùng lên Sentry.
 * Không cần gắn với error event — user có thể gửi bất cứ lúc nào.
 */
export function captureFeedback(message: string, email?: string, name?: string) {
    if (!initialized || !message.trim()) {
        return;
    }

    Sentry.captureFeedback({
        message,
        ...(email && { email }),
        ...(name && { name }),
    });
}
