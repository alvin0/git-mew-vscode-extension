import * as vscode from 'vscode';
import { FunctionCall, ToolExecuteResponse, ToolOptional } from '../toolInterface';

export const getDiagnosticsTool: FunctionCall = {
  id: 'get_diagnostics',
  functionCalling: {
    type: 'function',
    function: {
      name: 'get_diagnostics',
      description: 'Get diagnostic information (errors, warnings) for a specific file or the entire workspace. Use this to find type errors or syntax issues.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Optional. The relative path to the file to get diagnostics for. If omitted, returns diagnostics for all files with errors.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  execute: async (
    args: { path?: string },
    optional?: ToolOptional
  ): Promise<ToolExecuteResponse> => {
    try {
      const { path } = args;
      const allDiagnostics = vscode.languages.getDiagnostics();
      
      let filteredDiagnostics = allDiagnostics;
      
      if (path) {
        filteredDiagnostics = allDiagnostics.filter(([uri]) => {
          return vscode.workspace.asRelativePath(uri) === path;
        });
      }

      const report: string[] = [];

      for (const [uri, fileDiagnostics] of filteredDiagnostics) {
        if (fileDiagnostics.length === 0) {
          continue;
        }
        
        const relativePath = vscode.workspace.asRelativePath(uri);
        report.push(`File: ${relativePath}`);
        
        for (const diag of fileDiagnostics) {
          const severityStr = vscode.DiagnosticSeverity[diag.severity];
          const line = diag.range.start.line + 1; // 1-indexed
          const char = diag.range.start.character + 1;
          report.push(`  [${severityStr}] Line ${line}, Char ${char}: ${diag.message}`);
        }
        report.push('');
      }

      if (report.length === 0) {
        return {
          description: path 
            ? `No problems found in ${path}.`
            : "No problems found in the workspace.",
          contentType: 'text',
        };
      }

      return {
        description: `[get_diagnostics] Result:\n\n${report.join('\n')}`,
        contentType: 'text',
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        description: `Failed to get diagnostics: ${error instanceof Error ? error.message : String(error)}`,
        contentType: 'text',
      };
    }
  },
};
