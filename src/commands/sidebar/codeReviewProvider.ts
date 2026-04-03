import * as vscode from 'vscode';

class CodeReviewItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly commandId: string,
		public readonly icon: string,
		public readonly desc?: string
	) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.tooltip = desc || label;
		this.description = desc || '';
		this.iconPath = new vscode.ThemeIcon(icon);
		this.command = {
			command: commandId,
			title: label,
		};
	}
}

export class CodeReviewProvider implements vscode.TreeDataProvider<CodeReviewItem> {
	getTreeItem(element: CodeReviewItem): vscode.TreeItem {
		return element;
	}

	getChildren(): CodeReviewItem[] {
		return [
			new CodeReviewItem('Review Staged Changes', 'git-mew.review-staged-changes', 'eye', 'AI review of staged files'),
			new CodeReviewItem('Review Merge', 'git-mew.review-merge', 'git-merge', 'Review PR or generate description'),
			new CodeReviewItem('Review Merged Branch', 'git-mew.review-merged-branch', 'history', 'Review a merged branch'),
		];
	}
}
