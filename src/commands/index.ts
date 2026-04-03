import * as vscode from 'vscode';
import { LLMService } from '../services/llm';
import { GitService } from '../services/utils/gitService';
import { registerCancelGenerateCommand, registerGenerateCommitCommand } from './generateCommitCommand';
import { registerManageApiKeysCommand } from './manageApiKeysCommand';
import { registerMarkdownViewerCommand } from './markdownViewerCommand';
import { createPublishCommand } from './publishCommand';
import { registerReviewMergeCommand } from './reviewMergeCommand';
import { registerReviewMergedBranchCommand } from './reviewMergedBranchCommand';
import { registerReviewStagedChangesCommand } from './reviewStagedChangesCommand';
import { registerSetupModelCommand } from './setupModelGenerateCommitCommand';
import { registerReviewPanelCommand } from './reviewPanelCommand';
import { registerSendFeedbackCommand } from './sendFeedbackCommand';

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
		registerManageApiKeysCommand(llmService),
		registerSetupModelCommand(context, llmService),
		registerReviewMergeCommand(context, gitService, llmService),
		registerReviewStagedChangesCommand(context, gitService, llmService),
		registerReviewMergedBranchCommand(context, gitService, llmService),
		createPublishCommand(context),
		registerMarkdownViewerCommand(context),
		registerSendFeedbackCommand(context)
	];

	// Add all commands to subscriptions
	context.subscriptions.push(...commands);

	// Register review panel command
	registerReviewPanelCommand(context);
}
