import * as path from 'path';
import * as vscode from 'vscode';
import { FileTypeDetector } from '../../services/utils/fileTypeDetector';
import { FunctionCall, ToolExecuteResponse, ToolOptional } from '../toolInterface';

/**
 * Tool to get files related to a given file through imports and dependencies
 * Uses VS Code's built-in capabilities to work with any programming language
 */
export const getRelatedFilesTool: FunctionCall = {
  id: 'get_related_files',
  functionCalling: {
    type: 'function',
    function: {
      name: 'get_related_files',
      description: 'Get a list of files that are logically related to the specified file through imports or dependencies. Works with any programming language supported by VS Code. Use this when you see imports from other files and need to read those files to understand the processing flow.',
      parameters: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'The path of the file to find related files for (relative to workspace root or absolute path)',
          },
        },
        required: ['filename'],
        additionalProperties: false,
      },
    },
  },
  execute: async (
    args: { filename: string },
    optional?: ToolOptional
  ): Promise<ToolExecuteResponse> => {
    try {
      const { filename } = args;

      if (!filename || typeof filename !== 'string' || filename.trim() === '') {
        return {
          error: 'Invalid filename provided',
          description: 'Filename must be a non-empty string',
          contentType: 'text',
        };
      }

      // Get workspace folder
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return {
          error: 'No workspace folder',
          description: 'Please open a workspace folder to search for related files',
          contentType: 'text',
        };
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      // Resolve the target file path
      let targetFilePath: string;
      if (path.isAbsolute(filename)) {
        targetFilePath = filename;
      } else {
        targetFilePath = path.join(workspaceRoot, filename);
      }

      // Check if file exists
      let targetDocument: vscode.TextDocument;
      try {
        targetDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(targetFilePath));
      } catch (error) {
        return {
          error: 'File not found',
          description: `Could not open file: ${filename}. Please check the file path.`,
          contentType: 'text',
        };
      }

      const relatedFiles: Set<string> = new Set();

      // Method 1: Use VS Code's document link provider to find imports
      const importedFiles = await findImportsUsingDocumentLinks(targetDocument);
      importedFiles.forEach(file => relatedFiles.add(file));

      // Method 2: Use text-based search to find files that reference this file
      const referencingFiles = await findReferencingFiles(targetFilePath, workspaceRoot);
      referencingFiles.forEach(file => relatedFiles.add(file));

      // Method 3: Use VS Code's reference provider if available
      const referenceFiles = await findFilesUsingReferences(targetDocument);
      referenceFiles.forEach(file => relatedFiles.add(file));

      if (relatedFiles.size === 0) {
        return {
          description: `No related files found for "${filename}". The file might not have any imports or might not be imported by other files.`,
          contentType: 'text',
        };
      }

      // Format the result
      const relativeTargetPath = path.relative(workspaceRoot, targetFilePath);
      const relatedFilesList = Array.from(relatedFiles)
        .map(file => path.relative(workspaceRoot, file))
        .filter(file => file !== relativeTargetPath) // Exclude the target file itself
        .sort();

      const resultDescription = formatRelatedFilesResponse(
        relativeTargetPath,
        relatedFilesList
      );

      return {
        description: resultDescription,
        contentType: 'text',
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        description: `Failed to get related files: ${error instanceof Error ? error.message : String(error)}`,
        contentType: 'text',
      };
    }
  },
};

/**
 * Find imports using VS Code's document link provider
 * This works for any language that has a document link provider registered
 */
async function findImportsUsingDocumentLinks(document: vscode.TextDocument): Promise<Set<string>> {
  const imports = new Set<string>();

  try {
    // Get document links (these include imports in many languages)
    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      'vscode.executeLinkProvider',
      document.uri
    );

    if (links && links.length > 0) {
      for (const link of links) {
        if (link.target) {
          // Only include file:// URIs (local files)
          if (link.target.scheme === 'file') {
            imports.add(link.target.fsPath);
          }
        }
      }
    }
  } catch (error) {
    // Document link provider might not be available for this language
    // This is fine, we'll use other methods
  }

  return imports;
}

/**
 * Find files that reference the target file using VS Code's reference provider
 */
async function findFilesUsingReferences(document: vscode.TextDocument): Promise<Set<string>> {
  const referencingFiles = new Set<string>();

  try {
    // Try to find references to the file itself
    // This works for languages with good LSP support
    const position = new vscode.Position(0, 0);
    const references = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      document.uri,
      position
    );

    if (references && references.length > 0) {
      for (const ref of references) {
        if (ref.uri.fsPath !== document.uri.fsPath) {
          referencingFiles.add(ref.uri.fsPath);
        }
      }
    }
  } catch (error) {
    // Reference provider might not be available
  }

  return referencingFiles;
}

/**
 * Find files that reference the target file using text search
 * This is a fallback method that works for any language
 */
async function findReferencingFiles(targetFilePath: string, workspaceRoot: string): Promise<Set<string>> {
  const referencingFiles = new Set<string>();
  
  // Get the filename and various path representations
  const targetFileName = path.basename(targetFilePath);
  const targetFileNameWithoutExt = path.basename(targetFilePath, path.extname(targetFilePath));
  const relativeFromRoot = path.relative(workspaceRoot, targetFilePath);
  
  try {
    // Find all source files in the workspace
    const files = await vscode.workspace.findFiles(
      '**/*',
      '{**/node_modules/**,**/dist/**,**/build/**,**/.git/**,**/vendor/**,**/target/**,**/*.{png,jpg,jpeg,gif,svg,ico,pdf,zip,tar,gz,exe,dll,so,dylib}}'
    );

    // Build search patterns to look for
    const searchPatterns: RegExp[] = [
      // Match the filename (with or without extension)
      new RegExp(`['"\`].*${escapeRegex(targetFileNameWithoutExt)}(?:\\.[^'"\`]*)?['"\`]`, 'g'),
      // Match relative paths
      new RegExp(`['"\`].*${escapeRegex(targetFileName)}['"\`]`, 'g'),
    ];

    // Check each file for references
    for (const fileUri of files) {
      // Skip the target file itself
      if (fileUri.fsPath === targetFilePath) {
        continue;
      }

      try {
        // Check if file is binary before reading content
        const isBinary = await isFileBinary(fileUri.fsPath);
        if (isBinary) {
          continue; // Skip binary files
        }

        const document = await vscode.workspace.openTextDocument(fileUri);
        const content = document.getText();

        // Check if any pattern matches
        let hasMatch = false;
        for (const pattern of searchPatterns) {
          pattern.lastIndex = 0; // Reset regex
          if (pattern.test(content)) {
            hasMatch = true;
            break;
          }
        }

        if (hasMatch) {
          referencingFiles.add(fileUri.fsPath);
        }
      } catch {
        // Skip files that can't be read
        continue;
      }
    }
  } catch (error) {
    // Search might fail, but we have other methods
  }

  return referencingFiles;
}

/**
 * Check if a file is binary using FileTypeDetector
 */
async function isFileBinary(filePath: string): Promise<boolean> {
  try {
    const fs = require('fs');
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
    
    const result = FileTypeDetector.detectFromBuffer(
      arrayBuffer,
      path.basename(filePath)
    );
    
    return result.isBinary;
  } catch {
    // If we can't detect, assume it's text to be safe
    return false;
  }
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format the related files response
 */
function formatRelatedFilesResponse(
  targetFile: string,
  relatedFiles: string[]
): string {
  let result = `[get_related_files] Related files for '${targetFile}':\n\n`;
  
  result += `<summary>\n`;
  result += `Total related files: ${relatedFiles.length}\n`;
  result += `</summary>\n\n`;

  if (relatedFiles.length > 0) {
    result += `<related_files>\n`;
    for (const file of relatedFiles) {
      result += `  <file>${file}</file>\n`;
    }
    result += `</related_files>\n\n`;
    result += `Use the read_file tool to examine the content of any of these files for more context.`;
  } else {
    result += `No related files found. The file might be standalone or the language server might not be available.`;
  }

  return result;
}