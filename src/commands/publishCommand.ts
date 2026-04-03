import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Mapping from new subfolder paths to their legacy flat-file equivalents.
 * Used to clean up old files after publishing new ones.
 */
const LEGACY_FILE_MAP: Record<string, string> = {
  "review/system-prompt.md": "system-prompt.review-merge.md",
  "review/agent-rules.md": "agent-rule.review-merge.md",
  "review/code-rules.md": "code-rule.review-merge.md",
  "description/system-prompt.md": "system-prompt.description-merge.md",
  "commit/rules.md": "commit-rule.generate-commit.md",
};

/**
 * Recursively collect all files under a directory, returning paths relative to baseDir.
 */
function collectFiles(baseDir: string, currentDir: string = baseDir): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(baseDir, fullPath));
    } else if (entry.isFile()) {
      results.push(path.relative(baseDir, fullPath).replace(/\\/g, "/"));
    }
  }
  return results;
}

/**
 * Publish selected files to a destination .gitmew directory.
 * Cleans up legacy flat-file names when publishing to project scope.
 */
async function publishFiles(
  sourceDir: string,
  destDir: string,
  scopeLabel: string,
  cleanupLegacy: boolean
): Promise<void> {
  const allPossibleFiles = collectFiles(sourceDir);

  if (allPossibleFiles.length === 0) {
    vscode.window.showInformationMessage("No files available to publish.");
    return;
  }

  const selectedFiles = await vscode.window.showQuickPick(
    allPossibleFiles.map((file) => ({ label: file, picked: true })),
    {
      canPickMany: true,
      placeHolder: `Select files to publish to ${scopeLabel}`,
    }
  );

  if (!selectedFiles || selectedFiles.length === 0) {
    vscode.window.showInformationMessage("No files selected for publishing.");
    return;
  }

  const filesToCopy = selectedFiles.map(item => item.label);
  const existingFiles = filesToCopy.filter(file =>
    fs.existsSync(path.join(destDir, file))
  );

  if (existingFiles.length > 0) {
    const overwriteConfirmation = await vscode.window.showWarningMessage(
      `The following files already exist in ${scopeLabel}: ${existingFiles.join(", ")}. Do you want to overwrite them?`,
      { modal: true },
      "Overwrite All"
    );

    if (overwriteConfirmation !== "Overwrite All") {
      vscode.window.showInformationMessage("Publish operation cancelled.");
      return;
    }
  }

  let publishedCount = 0;
  const failedFiles: string[] = [];

  for (const file of filesToCopy) {
    const sourceFile = path.join(sourceDir, file);
    const destFile = path.join(destDir, file);

    try {
      if (!fs.existsSync(sourceFile)) {
        failedFiles.push(`${file} (source not found)`);
        continue;
      }

      const destFileDir = path.dirname(destFile);
      if (!fs.existsSync(destFileDir)) {
        fs.mkdirSync(destFileDir, { recursive: true });
      }

      fs.copyFileSync(sourceFile, destFile);

      if (fs.existsSync(destFile)) {
        publishedCount++;
      } else {
        failedFiles.push(`${file} (copy verification failed)`);
      }
    } catch (copyError: any) {
      failedFiles.push(`${file} (${copyError.message})`);
    }
  }

  if (publishedCount > 0) {
    // Clean up legacy flat files only for project-level publish
    let cleanedCount = 0;
    if (cleanupLegacy) {
      for (const file of filesToCopy) {
        const legacyName = LEGACY_FILE_MAP[file];
        if (legacyName) {
          const legacyPath = path.join(destDir, legacyName);
          if (fs.existsSync(legacyPath)) {
            try {
              fs.unlinkSync(legacyPath);
              cleanedCount++;
            } catch (cleanupError) {
              console.error(`Failed to remove legacy file ${legacyName}:`, cleanupError);
            }
          }
        }
      }
    }

    const message = failedFiles.length > 0
      ? `Published ${publishedCount} file(s) to ${scopeLabel}. Failed: ${failedFiles.length}`
      : `Published ${publishedCount} file(s) to ${scopeLabel}.`;

    vscode.window.showInformationMessage(message);

    if (cleanedCount > 0) {
      vscode.window.showInformationMessage(
        `Cleaned up ${cleanedCount} legacy file(s) from ${scopeLabel}.`
      );
    }

    if (failedFiles.length > 0) {
      vscode.window.showWarningMessage(`Failed to publish: ${failedFiles.join(", ")}`);
    }
  } else if (failedFiles.length > 0) {
    vscode.window.showErrorMessage(`Failed to publish all files: ${failedFiles.join(", ")}`);
  }
}

export function createPublishCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand("git-mew.publish", async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder is open.");
      return;
    }

    const sourceDir = path.join(context.extensionPath, "publish-files");
    if (!fs.existsSync(sourceDir)) {
      vscode.window.showErrorMessage(`Source directory not found: ${sourceDir}`);
      return;
    }

    // Ask user to choose publish scope
    const scope = await vscode.window.showQuickPick(
      [
        { label: "Project", description: ".gitmew/ in workspace root", detail: "Applies only to this project (highest priority)" },
        { label: "Global", description: "~/.gitmew/ in home directory", detail: "Applies to all projects (used when no project-level config exists)" },
      ],
      { placeHolder: "Where do you want to publish?" }
    );

    if (!scope) {
      return;
    }

    try {
      if (scope.label === "Project") {
        const projectRoot = workspaceFolders[0].uri.fsPath;
        const destDir = path.join(projectRoot, ".gitmew");
        await publishFiles(sourceDir, destDir, ".gitmew (project)", true);
      } else {
        const destDir = path.join(os.homedir(), ".gitmew");
        await publishFiles(sourceDir, destDir, "~/.gitmew (global)", false);
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to publish files: ${error.message}`);
    }
  });
}
