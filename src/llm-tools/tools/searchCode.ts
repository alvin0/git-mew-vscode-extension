import * as vscode from 'vscode';
import { FunctionCall, ToolExecuteResponse, ToolOptional } from '../toolInterface';

/**
 * Tool to search for a text pattern in the workspace
 * Helps LLM find symbols or patterns across multiple files
 */
export const searchCodeTool: FunctionCall = {
  id: 'search_code',
  functionCalling: {
    type: 'function',
    function: {
      name: 'search_code',
      description: 'Search for a text pattern or symbol across the entire workspace. Use this to find where a specific function, class, or variable is used or defined when you don\'t have a specific file path.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The text pattern or symbol name to search for.',
          },
          include: {
            type: 'string',
            description: 'Optional glob pattern for files to include (e.g., "**/*.ts").',
          },
          exclude: {
            type: 'string',
            description: 'Optional glob pattern for files to exclude (e.g., "**/test/**").',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  execute: async (
    args: { query: string; include?: string; exclude?: string },
    optional?: ToolOptional
  ): Promise<ToolExecuteResponse> => {
    try {
      const { query, include = '**/*', exclude = '{**/node_modules/**,**/dist/**,**/build/**,**/.git/**}' } = args;

      if (!query || typeof query !== 'string' || query.trim() === '') {
        return {
          error: 'Invalid search query',
          description: 'Search query must be a non-empty string',
          contentType: 'text',
        };
      }

      // Find files matching the include/exclude patterns
      const files = await vscode.workspace.findFiles(include, exclude);
      
      const MAX_MATCHING_FILES = 20;
      const MAX_LINES_PER_FILE = 5;
      const matches: Array<{ path: string; line: number; text: string }> = [];

      for (const fileUri of files) {
        if (matches.length >= MAX_MATCHING_FILES * MAX_LINES_PER_FILE) break;

        try {
          const document = await vscode.workspace.openTextDocument(fileUri);
          const content = document.getText();
          const relativePath = vscode.workspace.asRelativePath(fileUri);

          // Simple line-by-line search
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(query)) {
              matches.push({
                path: relativePath,
                line: i + 1,
                text: lines[i].trim()
              });
              
              if (matches.length >= MAX_MATCHING_FILES * MAX_LINES_PER_FILE) break;
            }
          }
        } catch {
          // Skip files that can't be read
          continue;
        }
      }

      if (matches.length === 0) {
        return {
          description: `No matches found for "${query}" in the workspace.`,
          contentType: 'text',
        };
      }

      // Group and format results
      let result = `[search_code] Found ${matches.length} matches for "${query}":\n\n`;
      
      const groupedMatches: Record<string, typeof matches> = {};
      matches.forEach(m => {
        if (!groupedMatches[m.path]) groupedMatches[m.path] = [];
        groupedMatches[m.path].push(m);
      });

      for (const path in groupedMatches) {
        result += `File: ${path}\n`;
        groupedMatches[path].forEach(m => {
          result += `  L${m.line}: ${m.text}\n`;
        });
        result += '\n';
      }

      result += `Use read_file to examine the full content of any of these files.`;

      return {
        description: result,
        contentType: 'text',
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        description: `Failed to search code: ${error instanceof Error ? error.message : String(error)}`,
        contentType: 'text',
      };
    }
  },
};
