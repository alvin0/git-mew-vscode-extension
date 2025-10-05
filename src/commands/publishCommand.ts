import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export function createPublishCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand("git-mew.publish", async () => {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder is open.");
      return;
    }

    const projectRoot = workspaceFolders[0].uri.fsPath;
    const sourceDir = path.join(context.extensionPath, "src", "publish-files");
    const destDir = path.join(projectRoot, ".gitmew");

    try {
      const allPossibleFiles = fs.readdirSync(sourceDir);

      const selectedFiles = await vscode.window.showQuickPick(
        allPossibleFiles.map((file) => ({ label: file, picked: true })),
        {
          canPickMany: true,
          placeHolder: "Select files to publish to .gitmew",
        }
      );

      if (!selectedFiles || selectedFiles.length === 0) {
        vscode.window.showInformationMessage("No files selected for publishing.");
        return;
      }

      const filesToCopy = selectedFiles.map(item => item.label);
      const existingFiles = filesToCopy.filter(file => fs.existsSync(path.join(destDir, file)));

      if (existingFiles.length > 0) {
        const overwriteConfirmation = await vscode.window.showWarningMessage(
          `The following files already exist in .gitmew: ${existingFiles.join(", ")}. Do you want to overwrite them?`,
          { modal: true },
          "Overwrite All"
        );

        if (overwriteConfirmation !== "Overwrite All") {
            vscode.window.showInformationMessage("Publish operation cancelled.");
            return;
        }
      }

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      let publishedCount = 0;
      for (const file of filesToCopy) {
        const sourceFile = path.join(sourceDir, file);
        const destFile = path.join(destDir, file);

        try {
          fs.copyFileSync(sourceFile, destFile);
          publishedCount++;
        } catch (copyError: any) {
            vscode.window.showErrorMessage(`Failed to copy ${file}: ${copyError.message}`);
        }
      }

      if (publishedCount > 0) {
        vscode.window.showInformationMessage(
            `Successfully published ${publishedCount} file(s) to .gitmew.`
        );
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to publish files: ${error.message}`
      );
    }
  });
}