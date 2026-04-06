import { PostHog } from 'posthog-node';
import * as vscode from 'vscode';
import * as crypto from 'crypto';

let client: PostHog | null = null;
let distinctId: string = 'anonymous';

const POSTHOG_API_KEY = 'phc_BTgigtET97rPJ7Kf6w32EPK2RvQ8XKtUPm7ycUhXMtm2';
const POSTHOG_HOST = 'https://us.i.posthog.com'; // hoặc https://eu.i.posthog.com nếu chọn EU region

/**
 * Tạo anonymous user ID dựa trên machineId của VS Code.
 * Không chứa PII, chỉ dùng để đếm unique users.
 */
function getAnonymousId(machineId: string): string {
    return crypto.createHash('sha256').update(machineId).digest('hex').substring(0, 16);
}

/**
 * Khởi tạo PostHog client. Gọi 1 lần trong activate().
 */
export function initPostHog(extensionVersion: string) {
    if (client) {
        return;
    }

    // Respect VS Code telemetry setting
    if (!vscode.env.isTelemetryEnabled) {
        return;
    }

    try {
        client = new PostHog(POSTHOG_API_KEY, {
            host: POSTHOG_HOST,
            flushAt: 10,
            flushInterval: 30000, // 30s
        });

        distinctId = getAnonymousId(vscode.env.machineId);

        // Identify user với metadata cơ bản (không PII)
        client.identify({
            distinctId,
            properties: {
                extension_version: extensionVersion,
                vscode_version: vscode.version,
                os: process.platform,
                language: vscode.env.language,
            },
        });
    } catch (error) {
        console.error('PostHog initialization failed:', error);
        client = null;
    }
}

/**
 * Track một event. Đây là function chính bạn sẽ gọi ở khắp nơi.
 *
 * Ví dụ:
 *   trackEvent('command_executed', { command: 'generate-commit', provider: 'openai' });
 *   trackEvent('review_completed', { type: 'merge', file_count: 5 });
 */
export function trackEvent(event: string, properties?: Record<string, unknown>) {
    if (!client) {
        return;
    }

    client.capture({
        distinctId,
        event,
        properties: {
            ...properties,
            timestamp: new Date().toISOString(),
        },
    });
}

/**
 * Flush pending events và shutdown. Gọi trong deactivate().
 */
export async function shutdownPostHog(): Promise<void> {
    if (!client) {
        return;
    }

    try {
        await client.shutdown();
    } catch (error) {
        console.error('PostHog shutdown failed:', error);
    } finally {
        client = null;
    }
}
