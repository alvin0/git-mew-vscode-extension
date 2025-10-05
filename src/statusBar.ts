import * as vscode from 'vscode';

export function createStatusBarItem(context: vscode.ExtensionContext) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = `$(hub) Git Mew`;
    statusBarItem.tooltip = 'Git Mew Commands';
    statusBarItem.command = 'git-mew.showCommands';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    const showCommandsCommand = vscode.commands.registerCommand('git-mew.showCommands', async () => {
        const items = [
            {
                label: '$(gear) Setup Model Generate Commit',
                description: 'Configure the AI model for commit generation',
                command: 'git-mew.setupModelGenerateCommit'
            },
            {
                label: '$(rocket) Publish',
                description: 'Publish your project',
                command: 'git-mew.publish'
            },
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a Git Mew command to run',
        });

        if (selected) {
            vscode.commands.executeCommand(selected.command);
        }
    });

    context.subscriptions.push(showCommandsCommand);
}