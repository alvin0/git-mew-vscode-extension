import * as vscode from 'vscode';
import { FunctionCall, ToolExecuteResponse, ToolOptional } from '../toolInterface';
import { formatFileContentResponse } from '../utils';

/**
 * Tool to get symbol definition (function, variable, class, constant)
 * Helps LLM understand context when encountering unknown symbols
 */
export const getSymbolDefinitionTool: FunctionCall = {
  id: 'get_symbol_definition',
  functionCalling: {
    type: 'function',
    function: {
      name: 'get_symbol_definition',
      description: 'Get the definition of a symbol (function, variable, class, or constant). Use this when you encounter an unknown symbol and need to understand its type, parameters, or implementation.',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'The name of the symbol to find (e.g., function name, variable name, class name, constant name)',
          },
        },
        required: ['symbol'],
        additionalProperties: false,
      },
    },
  },
  execute: async (
    args: { symbol: string },
    optional?: ToolOptional
  ): Promise<ToolExecuteResponse> => {
    try {
      const { symbol } = args;

      if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
        return {
          error: 'Invalid symbol name provided',
          description: 'Symbol name must be a non-empty string',
          contentType: 'text',
        };
      }

      // Get the active text editor
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return {
          error: 'No active editor',
          description: 'Please open a file in the editor to search for symbol definitions',
          contentType: 'text',
        };
      }

      const document = editor.document;
      const text = document.getText();

      // Search for the symbol in the current document
      const symbolRegex = new RegExp(
        `\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        'g'
      );
      const matches: { line: number; column: number; position: vscode.Position }[] = [];

      let match;
      while ((match = symbolRegex.exec(text)) !== null) {
        const position = document.positionAt(match.index);
        matches.push({
          line: position.line,
          column: position.character,
          position,
        });
      }

      if (matches.length === 0) {
        return {
          description: `Symbol "${symbol}" not found in the current file. Try searching in other files or check the spelling.`,
          contentType: 'text',
        };
      }

      // Try to get definition for the first match
      const firstMatch = matches[0];
      const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeDefinitionProvider',
        document.uri,
        firstMatch.position
      );

      if (!definitions || definitions.length === 0) {
        // If no definition found via LSP, try to extract context from current file
        const startLine = Math.max(0, firstMatch.line - 2);
        const endLine = Math.min(document.lineCount - 1, firstMatch.line + 2);
        
        let contextLines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
          contextLines.push(document.lineAt(i).text);
        }

        const relativePath = vscode.workspace.asRelativePath(document.uri);
        const contentStartLine = startLine + 1;
        const contentEndLine = endLine + 1;
        
        const resultDescription = formatFileContentResponse(
          [{
            path: relativePath,
            startLine: contentStartLine,
            endLine: contentEndLine,
            lines: contextLines,
            note: 'Could not find definition via language server. This might be a local variable or the language server is not available.'
          }],
          'get_symbol_definition',
          symbol
        );

        return {
          description: resultDescription,
          contentType: 'text',
        };
      }

      // Process all definitions found
      const fileInfos: Array<{
        path: string;
        startLine: number;
        endLine: number;
        lines: string[];
      }> = [];
      
      for (const definition of definitions) {
        const defDocument = await vscode.workspace.openTextDocument(definition.uri);
        const defRange = definition.range;
        
        // Get surrounding context (5 lines before and after)
        const startLine = Math.max(0, defRange.start.line - 5);
        const endLine = Math.min(defDocument.lineCount - 1, defRange.end.line + 5);
        
        let codeLines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
          codeLines.push(defDocument.lineAt(i).text);
        }

        const relativePath = vscode.workspace.asRelativePath(definition.uri);
        const contentStartLine = startLine + 1;
        const contentEndLine = endLine + 1;
        
        fileInfos.push({
          path: relativePath,
          startLine: contentStartLine,
          endLine: contentEndLine,
          lines: codeLines
        });
      }

      const resultDescription = formatFileContentResponse(
        fileInfos,
        'get_symbol_definition',
        symbol
      );

      return {
        description: resultDescription,
        contentType: 'text',
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        description: `Failed to get symbol definition: ${error instanceof Error ? error.message : String(error)}`,
        contentType: 'text',
      };
    }
  },
};