import * as vscode from 'vscode';
import { FunctionCall, ToolExecuteResponse, ToolOptional } from '../toolInterface';
import { ISharedContextStore } from '../../services/llm/orchestrator/SharedContextStore';
import { DependencyGraphData } from '../../services/llm/orchestrator/orchestratorTypes';

const MAX_RESULT_CHARS = 8000; // ~2000 tokens
const MAX_CALLS_PER_ITERATION = 5;
const MAX_BFS_DEPTH = 5;

/**
 * Lightweight meta-tool that queries the shared context store
 * instead of making expensive VS Code API calls.
 * Supports 4 query types: imports_of, dependency_chain, references_of, cached_result.
 */
export const queryContextTool: FunctionCall = {
  id: 'query_context',
  functionCalling: {
    type: 'function',
    function: {
      name: 'query_context',
      description:
        'Query the shared context store for cached data. Supports 4 query types: ' +
        '"imports_of" — find what imports a symbol or file; ' +
        '"dependency_chain" — BFS dependency chain from a file; ' +
        '"references_of" — find all references to a symbol (cached or live); ' +
        '"cached_result" — retrieve a previously cached file read result.',
      parameters: {
        type: 'object',
        properties: {
          query_type: {
            type: 'string',
            description:
              'The type of query: "imports_of", "dependency_chain", "references_of", or "cached_result".',
          },
          target: {
            type: 'string',
            description:
              'The target symbol name or file path to query for.',
          },
        },
        required: ['query_type', 'target'],
        additionalProperties: false,
      },
    },
  },
  execute: async (
    args: { query_type: string; target: string },
    optional?: ToolOptional,
  ): Promise<ToolExecuteResponse> => {
    try {
      const store = optional?.sharedStore as ISharedContextStore | undefined;
      if (!store) {
        return {
          description: '[query_context] Error: Shared context store not available. This tool requires a shared context store.',
          contentType: 'text',
        };
      }

      // Enforce per-iteration call limit
      const counter = optional?.queryContextCallCount;
      if (counter) {
        counter.value++;
        if (counter.value > MAX_CALLS_PER_ITERATION) {
          return {
            description: '[query_context] Call limit reached. Maximum ' + MAX_CALLS_PER_ITERATION + ' calls per iteration. Use other tools for additional queries.',
            contentType: 'text',
          };
        }
      }

      const { query_type, target } = args;
      let result: string;

      switch (query_type) {
        case 'imports_of':
          result = await handleImportsOf(target, store);
          break;
        case 'dependency_chain':
          result = handleDependencyChain(target, store);
          break;
        case 'references_of':
          result = await handleReferencesOf(target, store);
          break;
        case 'cached_result':
          result = handleCachedResult(target, store);
          break;
        default:
          return {
            description: '[query_context] Error: Invalid query_type "' + query_type + '". Valid types: imports_of, dependency_chain, references_of, cached_result.',
            contentType: 'text',
          };
      }

      // Truncate if result exceeds ~2000 tokens
      if (result.length > MAX_RESULT_CHARS) {
        result = result.slice(0, MAX_RESULT_CHARS) + '\n[truncated to 2000 token limit]';
      }

      return {
        description: '[query_context] ' + result,
        contentType: 'text',
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        description: '[query_context] Failed: ' + (error instanceof Error ? error.message : String(error)),
        contentType: 'text',
      };
    }
  },
};

// ── Query Handlers ──

async function handleImportsOf(target: string, store: ISharedContextStore): Promise<string> {
  const graph = store.getDependencyGraph();
  if (!graph) {
    return 'No dependency graph available for "' + target + '".';
  }

  // Check symbolMap first
  const symbolInfo = graph.symbolMap.get(target);
  if (symbolInfo) {
    const refs = symbolInfo.referencedBy;
    if (refs.length > 0) {
      return 'Symbol "' + target + '" (defined in ' + symbolInfo.definedIn + ') is referenced by:\n' +
        refs.map(r => '  - ' + r).join('\n');
    }
    return 'Symbol "' + target + '" is defined in ' + symbolInfo.definedIn + ' but has no known references.';
  }

  // Fallback to fileDependencies
  const fileDeps = graph.fileDependencies.get(target);
  if (fileDeps) {
    if (fileDeps.importedBy.length > 0) {
      return 'File "' + target + '" is imported by:\n' +
        fileDeps.importedBy.map(f => '  - ' + f).join('\n');
    }
    return 'File "' + target + '" has no known importers.';
  }

  // Fallback to VS Code API
  try {
    const references = await fetchAndCacheReferences(target, store);
    return references;
  } catch {
    return 'No import information found for "' + target + '".';
  }
}

function handleDependencyChain(target: string, store: ISharedContextStore): string {
  const graph = store.getDependencyGraph();
  if (!graph) {
    return 'No dependency graph available for dependency chain of "' + target + '".';
  }
  return buildDependencyChain(target, graph);
}

async function handleReferencesOf(target: string, store: ISharedContextStore): Promise<string> {
  // Check cache first
  const cached = store.getToolResult('find_references', { symbol: target });
  if (cached) {
    return 'References of "' + target + '" (cached):\n' + cached.description;
  }

  // Cache miss — execute VS Code API and cache
  try {
    const result = await fetchAndCacheReferences(target, store);
    return result;
  } catch {
    return 'No references found for "' + target + '".';
  }
}

function handleCachedResult(target: string, store: ISharedContextStore): string {
  const cached = store.getToolResult('read_file', { filename: target });
  if (cached) {
    return 'Cached result for "' + target + '":\n' + cached.description;
  }
  return 'No cached result for "' + target + '".';
}

// ── Helpers ──

/**
 * Execute vscode.executeReferenceProvider for the target, format the result,
 * cache it in the shared store, and return the formatted string.
 */
async function fetchAndCacheReferences(target: string, store: ISharedContextStore): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return 'No workspace folder available to resolve "' + target + '".';
  }

  const files = await vscode.workspace.findFiles(target, '**/node_modules/**', 1);
  if (files.length === 0) {
    return 'Could not find file for "' + target + '" in workspace.';
  }

  const uri = files[0];
  const position = new vscode.Position(0, 0);

  const locations = await vscode.commands.executeCommand<vscode.Location[]>(
    'vscode.executeReferenceProvider',
    uri,
    position,
  );

  if (!locations || locations.length === 0) {
    const noRefsResult = 'No references found for "' + target + '".';
    store.setToolResult('find_references', { symbol: target }, {
      description: noRefsResult,
      contentType: 'text',
    });
    return noRefsResult;
  }

  // Group by file
  const grouped = new Map<string, number[]>();
  for (const loc of locations) {
    const locPath = vscode.workspace.asRelativePath(loc.uri);
    if (!grouped.has(locPath)) {
      grouped.set(locPath, []);
    }
    grouped.get(locPath)!.push(loc.range.start.line + 1);
  }

  const lines: string[] = ['Found ' + locations.length + ' references across ' + grouped.size + ' files:'];
  for (const [filePath, lineNums] of grouped) {
    lines.push('  ' + filePath + ': lines ' + lineNums.slice(0, 10).join(', ') +
      (lineNums.length > 10 ? ' (and ' + (lineNums.length - 10) + ' more)' : ''));
  }

  const formatted = lines.join('\n');

  // Cache the result
  store.setToolResult('find_references', { symbol: target }, {
    description: formatted,
    contentType: 'text',
  });

  return formatted;
}

/**
 * BFS from target file using fileDependencies, returning a formatted dependency chain.
 * Max depth of 5 to prevent excessive output.
 */
function buildDependencyChain(target: string, graph: DependencyGraphData): string {
  const fileDeps = graph.fileDependencies;
  const visited = new Set<string>();
  const lines: string[] = [];

  interface QueueItem {
    file: string;
    depth: number;
  }

  const queue: QueueItem[] = [{ file: target, depth: 0 }];
  visited.add(target);

  while (queue.length > 0) {
    const { file, depth } = queue.shift()!;
    if (depth > MAX_BFS_DEPTH) {
      continue;
    }

    const deps = fileDeps.get(file);
    const imports = deps?.imports ?? [];

    const prefix = depth === 0 ? 'File: ' : '→ ';
    const indent = '  '.repeat(depth);
    lines.push(indent + prefix + file + (imports.length > 0 ? ' imports: ' + imports.join(', ') : ''));

    for (const imp of imports) {
      if (!visited.has(imp)) {
        visited.add(imp);
        queue.push({ file: imp, depth: depth + 1 });
      }
    }
  }

  if (lines.length === 0) {
    return 'No dependency information found for "' + target + '".';
  }

  return lines.join('\n');
}
