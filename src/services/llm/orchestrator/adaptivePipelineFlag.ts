import * as vscode from 'vscode';

export function shouldUseAdaptivePipeline(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>('gitmew.useAdaptivePipeline', false);
}

export function isDebugTelemetryEnabled(): boolean {
  return vscode.workspace.getConfiguration().get<boolean>('gitmew.debugTelemetry', false);
}
