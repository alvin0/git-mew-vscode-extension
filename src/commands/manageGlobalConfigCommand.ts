import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

const GLOBAL_GITMEW_DIR = path.join(os.homedir(), ".gitmew");

interface ConfigFileSeed {
  relativePath: string;
  placeholder: string;
}

const CONFIG_FILES: ConfigFileSeed[] = [
  {
    relativePath: "review/system-prompt.md",
    placeholder: "# Custom Review System Prompt\n\nAdd your custom review system prompt here.\n",
  },
  {
    relativePath: "review/agent-rules.md",
    placeholder: "# Custom Review Agent Instructions\n\nDefine custom agents or override default agent behavior here.\n",
  },
  {
    relativePath: "review/code-rules.md",
    placeholder: "# Custom Code Review Rules\n\nAdd your project-specific code review rules here.\n",
  },
  {
    relativePath: "description/system-prompt.md",
    placeholder: "# Custom MR Description Prompt\n\nDefine your MR description templates and routing rules here.\n",
  },
  {
    relativePath: "commit/rules.md",
    placeholder: "# Custom Commit Rules\n\nDefine your commit message formatting rules here.\n",
  },
];

// ── Tree Item ──

class GitmewTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly filePath?: string,
    public readonly isFile: boolean = false,
    public readonly exists: boolean = false,
  ) {
    super(label, collapsibleState);

    if (isFile && filePath) {
      this.tooltip = filePath;
      this.resourceUri = vscode.Uri.file(filePath);
      this.contextValue = exists ? "gitmew-file-exists" : "gitmew-file-missing";
      this.iconPath = exists
        ? new vscode.ThemeIcon("file", new vscode.ThemeColor("charts.green"))
        : new vscode.ThemeIcon("file-add", new vscode.ThemeColor("descriptionForeground"));
      this.description = exists ? "" : "(not created)";

      if (exists) {
        this.command = {
          command: "vscode.open",
          title: "Open File",
          arguments: [vscode.Uri.file(filePath)],
        };
      }
    } else {
      this.iconPath = new vscode.ThemeIcon("folder");
    }
  }
}

// ── Tree Data Provider ──

export class GitmewGlobalConfigProvider implements vscode.TreeDataProvider<GitmewTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GitmewTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: GitmewTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: GitmewTreeItem): GitmewTreeItem[] {
    if (!element) {
      // Root level: show folders
      const folders = new Set<string>();
      for (const file of CONFIG_FILES) {
        const folder = file.relativePath.split("/")[0];
        folders.add(folder);
      }
      return Array.from(folders).map(
        (folder) => new GitmewTreeItem(folder, vscode.TreeItemCollapsibleState.Expanded)
      );
    }

    // Child level: show files under this folder
    const folderName = element.label as string;
    return CONFIG_FILES
      .filter((f) => f.relativePath.startsWith(folderName + "/"))
      .map((f) => {
        const fullPath = path.join(GLOBAL_GITMEW_DIR, f.relativePath);
        const exists = fsSync.existsSync(fullPath);
        const fileName = path.basename(f.relativePath);
        return new GitmewTreeItem(
          fileName,
          vscode.TreeItemCollapsibleState.None,
          fullPath,
          true,
          exists,
        );
      });
  }
}

// ── Commands ──

async function createGlobalFile(filePath: string): Promise<void> {
  const seed = CONFIG_FILES.find(
    (f) => path.join(GLOBAL_GITMEW_DIR, f.relativePath) === filePath
  );
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, seed?.placeholder || "# Configuration\n", "utf-8");
}

export function registerManageGlobalConfigCommand(
  provider: GitmewGlobalConfigProvider
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Create file command
  disposables.push(
    vscode.commands.registerCommand("git-mew.global-config.create", async (item: GitmewTreeItem) => {
      if (!item.filePath) { return; }
      await createGlobalFile(item.filePath);
      provider.refresh();
      const doc = await vscode.workspace.openTextDocument(item.filePath);
      await vscode.window.showTextDocument(doc);
    })
  );

  // Delete file command
  disposables.push(
    vscode.commands.registerCommand("git-mew.global-config.delete", async (item: GitmewTreeItem) => {
      if (!item.filePath) { return; }
      const confirm = await vscode.window.showWarningMessage(
        `Delete global config: ${path.relative(GLOBAL_GITMEW_DIR, item.filePath)}?`,
        { modal: true },
        "Delete"
      );
      if (confirm === "Delete") {
        try {
          await fs.unlink(item.filePath);
          provider.refresh();
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to delete: ${err.message}`);
        }
      }
    })
  );

  // Refresh command
  disposables.push(
    vscode.commands.registerCommand("git-mew.global-config.refresh", () => {
      provider.refresh();
    })
  );

  // Open manage panel command (focuses the tree view)
  disposables.push(
    vscode.commands.registerCommand("git-mew.manage-global-config", async () => {
      await vscode.commands.executeCommand("gitmew-global-config.focus");
    })
  );

  return disposables;
}
