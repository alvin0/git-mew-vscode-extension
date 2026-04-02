import * as vscode from 'vscode';
import { ReviewPanelProvider } from './reviewPanel/reviewPanelProvider';

export function registerReviewPanelCommand(context: vscode.ExtensionContext): void {
	const reviewPanelProvider = ReviewPanelProvider.getInstance(context);

	context.subscriptions.push(
		vscode.commands.registerCommand('git-mew.show-review-panel', () => {
			reviewPanelProvider.show();
		})
	);
}
