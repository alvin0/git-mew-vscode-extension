import * as vscode from 'vscode';
import * as path from 'path';

export class ReviewPanelProvider {
	public static readonly viewType = 'git-mew-review-panel';
	private static instance: ReviewPanelProvider;
	private panel: vscode.WebviewPanel | undefined;
	private context: vscode.ExtensionContext;

	private constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	public static getInstance(context: vscode.ExtensionContext): ReviewPanelProvider {
		if (!ReviewPanelProvider.instance) {
			ReviewPanelProvider.instance = new ReviewPanelProvider(context);
		}
		return ReviewPanelProvider.instance;
	}

	public show(): void {
		if (this.panel) {
			this.panel.reveal(vscode.ViewColumn.Beside);
			return;
		}

		this.panel = vscode.window.createWebviewPanel(
			ReviewPanelProvider.viewType,
			'Git Mew Reviews',
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.file(path.join(this.context.extensionPath, 'resources'))
				]
			}
		);

		this.panel.iconPath = vscode.Uri.file(
			path.join(this.context.extensionPath, 'resources', 'images', 'logo-white-no-background.png')
		);

		this.panel.webview.html = this.getHtmlContent();

		this.panel.onDidDispose(() => {
			this.panel = undefined;
		});

		this.panel.webview.onDidReceiveMessage(async (message) => {
			switch (message.command) {
				case 'review-staged':
					await vscode.commands.executeCommand('git-mew.review-staged-changes');
					break;
				case 'review-merge':
					await vscode.commands.executeCommand('git-mew.review-merge');
					break;
				case 'review-merged-branch':
					await vscode.commands.executeCommand('git-mew.review-merged-branch');
					break;
			}
		});
	}

	private getHtmlContent(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Git Mew Reviews</title>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
			color: var(--vscode-foreground);
			background-color: var(--vscode-sideBar-background);
			padding: 0;
			height: 100vh;
			overflow: hidden;
		}

		.container {
			display: flex;
			flex-direction: column;
			height: 100%;
		}

		.header {
			padding: 16px;
			border-bottom: 1px solid var(--vscode-sideBar-border);
			background-color: var(--vscode-sideBarSectionHeader-background);
		}

		.header h1 {
			font-size: 13px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--vscode-sideBarSectionHeader-foreground);
		}

		.content {
			flex: 1;
			overflow-y: auto;
			padding: 8px;
		}

		.review-item {
			display: flex;
			align-items: center;
			padding: 12px 8px;
			margin-bottom: 4px;
			border-radius: 4px;
			cursor: pointer;
			transition: background-color 0.2s;
			user-select: none;
		}

		.review-item:hover {
			background-color: var(--vscode-list-hoverBackground);
		}

		.review-item:active {
			background-color: var(--vscode-list-activeSelectionBackground);
		}

		.review-item-icon {
			width: 24px;
			height: 24px;
			display: flex;
			align-items: center;
			justify-content: center;
			margin-right: 12px;
			flex-shrink: 0;
			font-size: 16px;
		}

		.review-item-content {
			flex: 1;
			min-width: 0;
		}

		.review-item-title {
			font-size: 13px;
			font-weight: 500;
			color: var(--vscode-foreground);
			margin-bottom: 2px;
		}

		.review-item-description {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.divider {
			height: 1px;
			background-color: var(--vscode-sideBar-border);
			margin: 8px 0;
		}

		.section-title {
			padding: 8px 8px;
			font-size: 11px;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			color: var(--vscode-sideBarSectionHeader-foreground);
			opacity: 0.7;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<h1>🐱 Git Mew</h1>
		</div>
		<div class="content">
			<div class="section-title">Code Review</div>
			
			<div class="review-item" onclick="sendCommand('review-staged')">
				<div class="review-item-icon">👁️</div>
				<div class="review-item-content">
					<div class="review-item-title">Review Staged Changes</div>
					<div class="review-item-description">AI review of staged files</div>
				</div>
			</div>

			<div class="review-item" onclick="sendCommand('review-merge')">
				<div class="review-item-icon">🔀</div>
				<div class="review-item-content">
					<div class="review-item-title">Review Merge</div>
					<div class="review-item-description">Review PR or generate description</div>
				</div>
			</div>

			<div class="review-item" onclick="sendCommand('review-merged-branch')">
				<div class="review-item-icon">📜</div>
				<div class="review-item-content">
					<div class="review-item-title">Review Merged Branch</div>
					<div class="review-item-description">Review a merged branch</div>
				</div>
			</div>
		</div>
	</div>

	<script>
		const vscode = acquireVsCodeApi();

		function sendCommand(command) {
			vscode.postMessage({ command });
		}
	</script>
</body>
</html>`;
	}
}
