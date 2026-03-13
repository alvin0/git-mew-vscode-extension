import * as vscode from 'vscode';
import { FunctionCall, ToolExecuteResponse, ToolOptional } from '../toolInterface';

export const findReferencesTool: FunctionCall = {
  id: 'find_references',
  functionCalling: {
    type: 'function',
    function: {
      name: 'find_references',
      description: 'Find all references to a symbol at a specific location in a file. Use this to understand the impact of a change or to find where a function is called.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The relative path of the file containing the symbol.',
          },
          line: {
            type: 'number',
            description: 'The line number (1-indexed) where the symbol is located.',
          },
          character: {
            type: 'number',
            description: 'The character position (1-indexed) within the line where the symbol is located.',
          }
        },
        required: ['path', 'line', 'character'],
        additionalProperties: false,
      },
    },
  },
  execute: async (
    args: { path: string, line: number, character: number },
    optional?: ToolOptional
  ): Promise<ToolExecuteResponse> => {
    try {
      const { path, line, character } = args;
      
      const files = await vscode.workspace.findFiles(path, '**/node_modules/**', 1);
      if (files.length === 0) {
          return {
              error: 'File not found',
              description: `Could not find file: ${path}`,
              contentType: 'text'
          };
      }
      
      const uri = files[0];
      const position = new vscode.Position(line - 1, character - 1);
      
      // Execute the built-in reference provider command
      const locations = await vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeReferenceProvider',
          uri,
          position
      );
      
      if (!locations || locations.length === 0) {
          return {
              description: `No references found for symbol at ${path}:${line}:${character}.`,
              contentType: 'text'
          };
      }
      
      // Group locations by file
      const groupedByFile = new Map<string, vscode.Location[]>();
      for (const loc of locations) {
          const locPath = vscode.workspace.asRelativePath(loc.uri);
          if (!groupedByFile.has(locPath)) {
              groupedByFile.set(locPath, []);
          }
          groupedByFile.get(locPath)!.push(loc);
      }
      
      const report: string[] = [];
      
      for (const [locPath, group] of groupedByFile.entries()) {
          report.push(`File: ${locPath}`);
          // Prevent massive payloads by limiting references per file if needed, though usually fine.
          const sample = group.slice(0, 10);
          for (const loc of sample) {
              report.push(`  - Line ${loc.range.start.line + 1}`);
          }
          if (group.length > 10) {
              report.push(`  ... and ${group.length - 10} more references in this file.`);
          }
          report.push('');
      }

      return {
        description: `[find_references] Found ${locations.length} total references across ${groupedByFile.size} files:\n\n${report.join('\n')}`,
        contentType: 'text',
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        description: `Failed to find references: ${error instanceof Error ? error.message : String(error)}`,
        contentType: 'text',
      };
    }
  },
};
