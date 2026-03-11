import * as vscode from 'vscode';
import { ReviewResultPayload } from './types';

export function postProgress(panel: vscode.WebviewPanel, message: string): void {
    panel.webview.postMessage({ command: 'showProgress', message });
}

export function postLog(panel: vscode.WebviewPanel, message: string): void {
    panel.webview.postMessage({ command: 'showLog', message });
}

export function postError(panel: vscode.WebviewPanel, message: string): void {
    panel.webview.postMessage({ command: 'showError', message });
}

export function postResult(panel: vscode.WebviewPanel, payload: ReviewResultPayload): void {
    panel.webview.postMessage({
        command: 'showResult',
        ...payload,
    });
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
}

export async function openDiffDocument(diffContent?: string): Promise<void> {
    if (!diffContent) {
        vscode.window.showWarningMessage('No diff content available.');
        return;
    }

    try {
        const doc = await vscode.workspace.openTextDocument({
            content: diffContent,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, { preview: false });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open diff: ${error}`);
        console.error('Error opening diff:', error);
    }
}
