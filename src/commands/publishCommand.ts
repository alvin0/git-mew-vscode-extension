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

    // Use URI for cross-platform compatibility
    const projectRoot = workspaceFolders[0].uri.fsPath;
    const sourceDir = path.join(context.extensionPath, "publish-files");
    const destDir = path.join(projectRoot, ".gitmew");

    try {
      // Verify source directory exists
      if (!fs.existsSync(sourceDir)) {
        vscode.window.showErrorMessage(`Source directory not found: ${sourceDir}`);
        return;
      }

      // Read directory with error handling
      const allPossibleFiles = fs.readdirSync(sourceDir).filter(file => {
        const filePath = path.join(sourceDir, file);
        const stat = fs.statSync(filePath);
        return stat.isFile(); // Only include files, not directories
      });

      if (allPossibleFiles.length === 0) {
        vscode.window.showInformationMessage("No files available to publish.");
        return;
      }

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

      // Ensure destination directory exists with proper error handling
      try {
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
      } catch (mkdirError: any) {
        vscode.window.showErrorMessage(`Failed to create .gitmew directory: ${mkdirError.message}`);
        return;
      }

      let publishedCount = 0;
      const failedFiles: string[] = [];

      for (const file of filesToCopy) {
        const sourceFile = path.join(sourceDir, file);
        const destFile = path.join(destDir, file);

        try {
          // Verify source file exists before copying
          if (!fs.existsSync(sourceFile)) {
            failedFiles.push(`${file} (source not found)`);
            continue;
          }

          // Use fs.promises for better async handling, but keep sync for simplicity
          // Set proper file permissions on copy
          fs.copyFileSync(sourceFile, destFile);
          
          // Verify the copy was successful
          if (fs.existsSync(destFile)) {
            publishedCount++;
          } else {
            failedFiles.push(`${file} (copy verification failed)`);
          }
        } catch (copyError: any) {
          failedFiles.push(`${file} (${copyError.message})`);
        }
      }

      // Show detailed results
      if (publishedCount > 0) {
        const message = failedFiles.length > 0
          ? `Successfully published ${publishedCount} file(s) to .gitmew. Failed: ${failedFiles.length}`
          : `Successfully published ${publishedCount} file(s) to .gitmew.`;
        
        vscode.window.showInformationMessage(message);
        
        if (failedFiles.length > 0) {
          vscode.window.showWarningMessage(
            `Failed to publish: ${failedFiles.join(", ")}`
          );
        }
      } else if (failedFiles.length > 0) {
        vscode.window.showErrorMessage(
          `Failed to publish all files: ${failedFiles.join(", ")}`
        );
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to publish files: ${error.message}`
      );
    }
  });
}