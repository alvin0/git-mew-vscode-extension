import * as vscode from 'vscode';
import { LlmRequestLogEntry, ReviewErrorPayload, ReviewResultPayload } from './types';
import { saveReviewHistory, updateHistoryFile } from '../../services/historyService';

/** Callback invoked after a review history file is saved. */
let onHistorySavedCallback: (() => void) | undefined;

/** Track the last saved history file path per panel, so PlantUML repair can update it. */
const lastHistoryFilePaths = new WeakMap<vscode.WebviewPanel, string>();

/** Track save generation per panel to prevent race conditions. */
const panelSaveGeneration = new WeakMap<vscode.WebviewPanel, number>();

/**
 * Register a callback to be invoked whenever a review is saved to history.
 * Used by the HistoriesProvider to auto-refresh the tree.
 */
export function onHistorySaved(callback: () => void): void {
    onHistorySavedCallback = callback;
}

export function postProgress(panel: vscode.WebviewPanel, message: string): void {
    panel.webview.postMessage({ command: 'showProgress', message });
}

export function postLog(panel: vscode.WebviewPanel, message: string): void {
    panel.webview.postMessage({ command: 'showLog', message });
}

export function postLlmLog(panel: vscode.WebviewPanel, entry: LlmRequestLogEntry): void {
    panel.webview.postMessage({ command: 'showLlmLog', entry });
}

export function postError(panel: vscode.WebviewPanel, error: ReviewErrorPayload): void {
    panel.webview.postMessage({ command: 'showError', error });
}

export function postResult(panel: vscode.WebviewPanel, payload: ReviewResultPayload, historyFileName?: string, model?: string): void {
    panel.webview.postMessage({
        command: 'showResult',
        ...payload,
    });

    // Auto-save review to history
    if (payload.review) {
        // Build filename: context + model
        const baseName = historyFileName || extractTitleFromMarkdown(payload.review);
        const parts = [baseName, model].filter(Boolean).join('_');
        const finalName = parts || undefined;

        // Increment generation to guard against race conditions
        const gen = (panelSaveGeneration.get(panel) ?? 0) + 1;
        panelSaveGeneration.set(panel, gen);

        saveReviewHistory(payload.review, finalName).then((savedPath) => {
            // Only update if this is still the latest save for this panel
            if (savedPath && panelSaveGeneration.get(panel) === gen) {
                lastHistoryFilePaths.set(panel, savedPath);
            }
            onHistorySavedCallback?.();
        }).catch(err => {
            console.error('[history] Failed to save review history:', err);
        });
    }
}

/**
 * Extract a meaningful title from the first markdown heading.
 * Falls back to undefined if no heading found (will use default timestamp name).
 */
function extractTitleFromMarkdown(markdown: string): string | undefined {
    const match = markdown.match(/^#+\s+(.+)$/m);
    if (match) {
        return match[1].trim().slice(0, 80);
    }
    return undefined;
}

export function postPlantUmlRepairResult(
    panel: vscode.WebviewPanel,
    target: 'review' | 'description',
    content: string,
    attempt: number
): void {
    panel.webview.postMessage({
        command: 'replacePlantUmlContent',
        target,
        content,
        attempt,
    });

    // Update the history file with repaired content (only for review target)
    if (target === 'review') {
        const historyPath = lastHistoryFilePaths.get(panel);
        if (historyPath) {
            updateHistoryFile(historyPath, content).catch(err => {
                console.error('[history] Failed to update history after PlantUML repair:', err);
            });
        }
    }
}

export async function openDiffDocument(diffContent?: string): Promise<void> {
    if (!diffContent) {
        vscode.window.showWarningMessage('No diff content available.');
        return;
    }

    try {
        const doc = await vscode.workspace.openTextDocument({
            content: diffContent,
            language: 'diff'
        });
        await vscode.window.showTextDocument(doc, { preview: false });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open diff: ${error}`);
        console.error('Error opening diff:', error);
    }
}
