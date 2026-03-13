import * as vscode from 'vscode';
import * as path from 'path';
import { FunctionCall, ToolExecuteResponse, ToolOptional } from '../toolInterface';
import { formatFileContentResponse } from '../utils';

/**
 * Tool to read content from a specific file
 * Helps LLM understand the full context of a file
 */
export const readFileTool: FunctionCall = {
  id: 'read_file',
  functionCalling: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the content of a specific file. Use this to understand the full context of a file you discovered via other tools or imports.',
      parameters: {
        type: 'object',
        properties: {
          filename: {
            type: 'string',
            description: 'The path of the file to read (relative to workspace root or absolute path)',
          },
          startLine: {
            type: 'number',
            description: 'The starting line number to read (1-indexed, inclusive). Default is 1.',
          },
          endLine: {
            type: 'number',
            description: 'The ending line number to read (1-indexed, inclusive). Default is the end of the file.',
          },
        },
        required: ['filename'],
        additionalProperties: false,
      },
    },
  },
  execute: async (
    args: { filename: string; startLine?: number; endLine?: number },
    optional?: ToolOptional
  ): Promise<ToolExecuteResponse> => {
    try {
      const { filename, startLine = 1, endLine } = args;

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
          description: 'Please open a workspace folder to read files',
          contentType: 'text',
        };
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      // Resolve the file path
      let filePath: string;
      if (path.isAbsolute(filename)) {
        filePath = filename;
      } else {
        filePath = path.join(workspaceRoot, filename);
      }

      // Check if file exists
      let document: vscode.TextDocument;
      try {
        document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      } catch (error) {
        return {
          error: 'File not found',
          description: `Could not open file: ${filename}. Please check the file path.`,
          contentType: 'text',
        };
      }

      const totalLines = document.lineCount;
      const actualStartLine = Math.max(1, startLine);
      const actualEndLine = endLine ? Math.min(totalLines, endLine) : totalLines;

      if (actualStartLine > actualEndLine) {
        return {
          error: 'Invalid line range',
          description: `Start line (${actualStartLine}) cannot be greater than end line (${actualEndLine})`,
          contentType: 'text',
        };
      }

      const lines: string[] = [];
      for (let i = actualStartLine - 1; i < actualEndLine; i++) {
        lines.push(document.lineAt(i).text);
      }

      const relativePath = vscode.workspace.asRelativePath(document.uri);
      
      const resultDescription = formatFileContentResponse(
        [{
          path: relativePath,
          startLine: actualStartLine,
          endLine: actualEndLine,
          lines: lines
        }],
        'read_file'
      );

      return {
        description: resultDescription,
        contentType: 'text',
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        description: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        contentType: 'text',
      };
    }
  },
};
