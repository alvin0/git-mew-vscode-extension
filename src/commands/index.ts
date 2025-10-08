import * as vscode from 'vscode';
import { LLMService } from '../services/llm';
import { GitService } from '../services/utils/gitService';
import { registerCancelGenerateCommand, registerGenerateCommitCommand } from './generateCommitCommand';
import { registerMarkdownViewerCommand } from './markdownViewerCommand';
import { createPublishCommand } from './publishCommand';
import { registerReviewMergeCommand } from './reviewMergeCommand';
import { registerReviewStagedChangesCommand } from './reviewStagedChangesCommand';
import { registerSetupModelCommand } from './setupModelGenerateCommitCommand';

/**
 * Register all extension commands
 */
export function registerAllCommands(
	context: vscode.ExtensionContext,
	gitService: GitService,
	llmService: LLMService
): void {
	// Register all commands
	const commands = [
		registerGenerateCommitCommand(context, gitService, llmService),
		registerCancelGenerateCommand(),
		registerSetupModelCommand(context, llmService),
		registerReviewMergeCommand(context, gitService, llmService),
		registerReviewStagedChangesCommand(context, gitService, llmService),
		createPublishCommand(context),
		registerMarkdownViewerCommand(context)
	];

	// Add all commands to subscriptions
	context.subscriptions.push(...commands);
}