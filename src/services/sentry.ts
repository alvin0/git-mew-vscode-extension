import * as Sentry from '@sentry/node';

let initialized = false;

/**
 * Tag để đánh dấu event được gửi chủ động từ code của mình.
 * Mọi event không có tag này sẽ bị drop trong beforeSend.
 */
const GITMEW_ORIGIN_TAG = 'gitmew.origin';

export function initSentry(extensionVersion: string) {
    if (initialized) {
        return;
    }

    Sentry.init({
        dsn: 'https://da55ab0c7da986fdad65588d812cb615@o4511155891798016.ingest.us.sentry.io/4511155900907520',
        release: `git-mew@${extensionVersion}`,
        environment: 'production',
        sendDefaultPii: false,
        sampleRate: 1.0,

        // Tắt auto-capture cho global unhandled exceptions & rejections.
        // Chỉ nhận events từ captureError / captureMessage của mình.
        integrations(defaults) {
            return defaults.filter(i =>
                i.name !== 'OnUncaughtException' &&
                i.name !== 'OnUnhandledRejection'
            );
        },

        beforeSend(event) {
            // Chỉ gửi events có tag origin từ code của mình
            if (!event.tags?.[GITMEW_ORIGIN_TAG]) {
                return null;
            }

            // Loại bỏ thông tin nhạy cảm
            if (event.extra) {
                delete event.extra['apiKey'];
                delete event.extra['token'];
                delete event.extra['baseURL'];
            }

            return event;
        },
    });

    initialized = true;
}

export type ErrorSeverity = 'crash' | 'operational' | 'cosmetic';

/**
 * Capture error lên Sentry với severity phân loại.
 * Đây là cách DUY NHẤT để gửi error lên Sentry.
 * - crash: lỗi không mong đợi, cần fix ngay
 * - operational: lỗi từ API/network, cần theo dõi
 * - cosmetic: lỗi nhỏ, chỉ log breadcrumb
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
        scope.setTag(GITMEW_ORIGIN_TAG, 'captureError');
        if (context) {
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
    Sentry.withScope((scope) => {
        scope.setTag(GITMEW_ORIGIN_TAG, 'captureMessage');
        Sentry.captureMessage(message, level);
    });
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
