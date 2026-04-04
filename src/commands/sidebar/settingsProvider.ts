import * as vscode from 'vscode';

class SettingsItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly commandId: string,
		public readonly icon: string
	) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.iconPath = new vscode.ThemeIcon(icon);
		this.command = {
			command: commandId,
			title: label,
		};
	}
}

export class SettingsProvider implements vscode.TreeDataProvider<SettingsItem> {
	getTreeItem(element: SettingsItem): vscode.TreeItem {
		return element;
	}

	getChildren(): SettingsItem[] {
		return [
			new SettingsItem('Publish Rules to .gitmew', 'git-mew.publish', 'add'),
			new SettingsItem('Setup Model Generate Commit', 'git-mew.setupModelGenerateCommit', 'gear'),
			new SettingsItem('Manage API Keys', 'git-mew.manage-api-keys', 'key'),
			new SettingsItem('Send Feedback', 'git-mew.send-feedback', 'feedback'),
		];
	}
}
