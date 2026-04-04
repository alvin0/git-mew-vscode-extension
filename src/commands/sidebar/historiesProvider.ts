import * as vscode from 'vscode';
import { listHistoryFilesAsync, getWorkspaceHistoryDir } from '../../services/historyService';

type HistoryTreeItem = HistoryDateItem | HistoryFileItem;

class HistoryDateItem extends vscode.TreeItem {
    readonly kind = 'date' as const;
    constructor(
        public readonly dateFolder: string,
        public readonly fileCount: number
    ) {
        super(dateFolder, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = `${fileCount} file${fileCount > 1 ? 's' : ''}`;
        this.iconPath = new vscode.ThemeIcon('calendar');
        this.contextValue = 'gitmew-history-date';
    }
}

class HistoryFileItem extends vscode.TreeItem {
    readonly kind = 'file' as const;
    constructor(
        public readonly label: string,
        public readonly filePath: string,
        public readonly mtime: Date,
        public readonly dateFolder: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = filePath;
        this.description = formatRelativeDate(mtime);
        this.iconPath = new vscode.ThemeIcon('file', new vscode.ThemeColor('charts.blue'));
        this.contextValue = 'gitmew-history-file';
        this.command = {
            command: 'git-mew.history.preview',
            title: 'Preview History',
            arguments: [vscode.Uri.file(filePath)],
        };
    }
}

export class HistoriesProvider implements vscode.TreeDataProvider<HistoryTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<HistoryTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private _cachedFiles: { name: string; filePath: string; mtime: Date; dateFolder: string }[] | undefined;

    refresh(): void {
        this._cachedFiles = undefined;
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: HistoryTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: HistoryTreeItem): Promise<HistoryTreeItem[]> {
        const historyDir = getWorkspaceHistoryDir();
        if (!historyDir) { return []; }

        // Load files if not cached
        if (!this._cachedFiles) {
            this._cachedFiles = await listHistoryFilesAsync();
        }
        const files = this._cachedFiles || [];
        if (files.length === 0) { return []; }

        if (!element) {
            // Root: group by dateFolder, sorted newest first
            const grouped = new Map<string, number>();
            for (const f of files) {
                grouped.set(f.dateFolder, (grouped.get(f.dateFolder) || 0) + 1);
            }
            return Array.from(grouped.entries())
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([date, count]) => new HistoryDateItem(date, count));
        }

        if (element instanceof HistoryDateItem) {
            return files
                .filter(f => f.dateFolder === element.dateFolder)
                .map(f => new HistoryFileItem(
                    f.name.replace(/\.md$/, ''),
                    f.filePath,
                    f.mtime,
                    f.dateFolder
                ));
        }

        return [];
    }
}

function formatRelativeDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) { return 'just now'; }
    if (diffMins < 60) { return `${diffMins}m ago`; }
    if (diffHours < 24) { return `${diffHours}h ago`; }
    if (diffDays < 7) { return `${diffDays}d ago`; }
    return date.toLocaleDateString();
}
