import * as vscode from 'vscode';
import * as path from 'path';
import { DependencyGraphData, DependencyGraphConfig } from './orchestratorTypes';
import { UnifiedDiffFile } from '../contextTypes';

export const DEFAULT_GRAPH_CONFIG: DependencyGraphConfig = {
  maxFiles: 100,
  maxSymbolLookups: 200,
  timeoutMs: 15_000,
  criticalPathThreshold: 3,
};

const EXPORTED_SYMBOL_KINDS = new Set([
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Class,
  vscode.SymbolKind.Interface,
  vscode.SymbolKind.Enum,
  vscode.SymbolKind.Constant,
  vscode.SymbolKind.TypeParameter,
]);

type SymbolType = 'function' | 'class' | 'interface' | 'type' | 'constant' | 'enum';

function symbolKindToType(kind: vscode.SymbolKind): SymbolType {
  switch (kind) {
    case vscode.SymbolKind.Function: return 'function';
    case vscode.SymbolKind.Class: return 'class';
    case vscode.SymbolKind.Interface: return 'interface';
    case vscode.SymbolKind.Enum: return 'enum';
    case vscode.SymbolKind.Constant: return 'constant';
    case vscode.SymbolKind.TypeParameter: return 'type';
    default: return 'function';
  }
}

function flattenSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
  const result: vscode.DocumentSymbol[] = [];
  for (const sym of symbols) {
    result.push(sym);
    if (sym.children?.length) {
      result.push(...flattenSymbols(sym.children));
    }
  }
  return result;
}

export class DependencyGraphIndex {
  constructor(
    private readonly config: DependencyGraphConfig,
    private readonly gitService?: any,
    private readonly compareBranch?: string,
  ) {}

  async build(changedFiles: UnifiedDiffFile[]): Promise<DependencyGraphData> {
    const fileDependencies: DependencyGraphData['fileDependencies'] = new Map();
    const symbolMap: DependencyGraphData['symbolMap'] = new Map();
    let filesScanned = 0;
    let symbolLookups = 0;

    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), this.config.timeoutMs);

    try {
      // Phase A — Scan changed files (priority)
      // For changed files, prefer reading from compareBranch (git show) since
      // working tree may be on a different branch
      const changedFilePaths = new Set<string>();
      for (const file of changedFiles) {
        if (abortController.signal.aborted) { break; }
        if (file.isBinary || file.isDeleted) { continue; }
        if (filesScanned >= this.config.maxFiles) { break; }

        changedFilePaths.add(file.filePath);
        try {
          // Try branch-aware import scanning first (from diff content or git show)
          let imports: string[];
          let symbols: Array<{ name: string; type: string; range: vscode.Range }>;

          if (this.gitService && this.compareBranch) {
            // Read file from the compare branch — this is the accurate version
            const content = await this.gitService.showFileFromRef(this.compareBranch, file.relativePath);
            if (content) {
              imports = this.parseImportsFromContent(content, file.filePath);
              symbols = this.parseSymbolsFromContent(content);
            } else {
              // File doesn't exist on compareBranch, try LSP fallback
              imports = await this.scanImports(file.filePath);
              symbols = await this.extractSymbols(file.filePath);
            }
          } else {
            // No branch context — use LSP (original behavior)
            imports = await this.scanImports(file.filePath);
            symbols = await this.extractSymbols(file.filePath);
          }

          fileDependencies.set(file.filePath, { imports, importedBy: [] });
          for (const sym of symbols) {
            symbolMap.set(sym.name, {
              definedIn: file.filePath,
              referencedBy: [],
              type: sym.type as SymbolType,
            });
          }
          filesScanned++;
        } catch {
          // Skip files that fail to scan
        }
      }

      // Phase B — Scan direct neighbors
      const allImports = new Set<string>();
      for (const [, deps] of fileDependencies) {
        for (const imp of deps.imports) {
          allImports.add(imp);
        }
      }

      for (const neighborPath of allImports) {
        if (abortController.signal.aborted) { break; }
        if (filesScanned >= this.config.maxFiles) { break; }
        if (fileDependencies.has(neighborPath)) { continue; }

        try {
          const imports = await this.scanImports(neighborPath);
          fileDependencies.set(neighborPath, { imports, importedBy: [] });
          filesScanned++;
        } catch {
          // Skip neighbors that fail to scan
        }
      }

      // Build importedBy reverse map
      for (const [filePath, deps] of fileDependencies) {
        for (const imp of deps.imports) {
          const entry = fileDependencies.get(imp);
          if (entry) {
            entry.importedBy.push(filePath);
          }
        }
      }

      // Phase C — Find references
      for (const [symbolName, symbolInfo] of symbolMap) {
        if (abortController.signal.aborted) { break; }
        if (symbolLookups >= this.config.maxSymbolLookups) { break; }

        try {
          const uri = vscode.Uri.file(symbolInfo.definedIn);
          const doc = await vscode.workspace.openTextDocument(uri);
          // Find the symbol position in the document
          const text = doc.getText();
          const idx = text.indexOf(symbolName);
          if (idx >= 0) {
            const position = doc.positionAt(idx);
            const referencedBy = await this.findSymbolReferences(uri, position);
            symbolInfo.referencedBy = referencedBy;
          }
          symbolLookups++;
        } catch {
          symbolLookups++;
        }
      }

      // Phase D — Compute critical paths
      const criticalPaths = this.computeCriticalPaths(fileDependencies, changedFilePaths);

      return { fileDependencies, symbolMap, criticalPaths };
    } catch {
      // Return partial results on timeout/error
      const criticalPaths = this.computeCriticalPaths(fileDependencies, new Set(
        changedFiles.filter(f => !f.isBinary && !f.isDeleted).map(f => f.filePath)
      ));
      return { fileDependencies, symbolMap, criticalPaths };
    } finally {
      clearTimeout(timer);
    }
  }

  private async scanImports(filePath: string): Promise<string[]> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
      'vscode.executeLinkProvider',
      doc.uri
    );
    if (!links) { return []; }
    return links
      .filter(link => link.target?.scheme === 'file')
      .map(link => link.target!.fsPath);
  }

  private async extractSymbols(filePath: string): Promise<Array<{
    name: string;
    type: string;
    range: vscode.Range;
  }>> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      doc.uri
    );
    if (!symbols) { return []; }

    const flat = flattenSymbols(symbols);
    return flat
      .filter(sym => EXPORTED_SYMBOL_KINDS.has(sym.kind))
      .map(sym => ({
        name: sym.name,
        type: symbolKindToType(sym.kind),
        range: sym.range,
      }));
  }

  private async findSymbolReferences(
    uri: vscode.Uri,
    position: vscode.Position
  ): Promise<string[]> {
    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      uri,
      position
    );
    if (!locations) { return []; }

    const definitionPath = uri.fsPath;
    const uniquePaths = new Set<string>();
    for (const loc of locations) {
      const locPath = loc.uri.fsPath;
      if (locPath !== definitionPath) {
        uniquePaths.add(locPath);
      }
    }
    return [...uniquePaths];
  }

  private computeCriticalPaths(
    fileDeps: Map<string, { imports: string[]; importedBy: string[] }>,
    changedFilePaths: Set<string>
  ): DependencyGraphData['criticalPaths'] {
    if (changedFilePaths.size === 0) { return []; }

    // Union-Find: group changed files connected by dependency edges
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    function find(x: string): string {
      let root = x;
      while (parent.get(root) !== root) {
        root = parent.get(root)!;
      }
      // Path compression
      let current = x;
      while (current !== root) {
        const next = parent.get(current)!;
        parent.set(current, root);
        current = next;
      }
      return root;
    }

    function union(a: string, b: string): void {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA === rootB) { return; }
      const rankA = rank.get(rootA) ?? 0;
      const rankB = rank.get(rootB) ?? 0;
      if (rankA < rankB) {
        parent.set(rootA, rootB);
      } else if (rankA > rankB) {
        parent.set(rootB, rootA);
      } else {
        parent.set(rootB, rootA);
        rank.set(rootA, rankA + 1);
      }
    }

    // Initialize each changed file as its own set
    for (const fp of changedFilePaths) {
      parent.set(fp, fp);
      rank.set(fp, 0);
    }

    // BFS forward + backward for each changed file, union with other changed files reachable via deps
    for (const changedFile of changedFilePaths) {
      const deps = fileDeps.get(changedFile);
      if (!deps) { continue; }

      // Forward: imports that are also changed
      for (const imp of deps.imports) {
        if (changedFilePaths.has(imp)) {
          union(changedFile, imp);
        }
      }
      // Backward: importedBy that are also changed
      for (const importer of deps.importedBy) {
        if (changedFilePaths.has(importer)) {
          union(changedFile, importer);
        }
      }
    }

    // Group into connected components
    const components = new Map<string, string[]>();
    for (const fp of changedFilePaths) {
      const root = find(fp);
      if (!components.has(root)) {
        components.set(root, []);
      }
      components.get(root)!.push(fp);
    }

    // Filter by threshold, sort descending, generate descriptions
    const criticalPaths: DependencyGraphData['criticalPaths'] = [];
    for (const [, files] of components) {
      if (files.length >= this.config.criticalPathThreshold) {
        // Build a chain description by ordering files along dependency edges
        const ordered = this.orderFilesAlongDeps(files, fileDeps);
        criticalPaths.push({
          files: ordered,
          changedFileCount: files.length,
          description: `Chain: ${ordered.map(f => this.basename(f)).join(' → ')} (${files.length} changed files)`,
        });
      }
    }

    // Sort by changedFileCount descending
    criticalPaths.sort((a, b) => b.changedFileCount - a.changedFileCount);
    return criticalPaths;
  }

  /** Order files along dependency edges for readable chain description */
  private orderFilesAlongDeps(
    files: string[],
    fileDeps: Map<string, { imports: string[]; importedBy: string[] }>
  ): string[] {
    if (files.length <= 1) { return files; }

    const fileSet = new Set(files);
    const inDegree = new Map<string, number>();
    for (const f of files) { inDegree.set(f, 0); }

    for (const f of files) {
      const deps = fileDeps.get(f);
      if (!deps) { continue; }
      for (const imp of deps.imports) {
        if (fileSet.has(imp)) {
          inDegree.set(imp, (inDegree.get(imp) ?? 0) + 1);
        }
      }
    }

    // Topological sort (Kahn's algorithm)
    const queue: string[] = [];
    for (const [f, deg] of inDegree) {
      if (deg === 0) { queue.push(f); }
    }

    const ordered: string[] = [];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) { continue; }
      visited.add(current);
      ordered.push(current);

      const deps = fileDeps.get(current);
      if (!deps) { continue; }
      for (const imp of deps.imports) {
        if (fileSet.has(imp) && !visited.has(imp)) {
          const newDeg = (inDegree.get(imp) ?? 1) - 1;
          inDegree.set(imp, newDeg);
          if (newDeg <= 0) { queue.push(imp); }
        }
      }
    }

    // Add any remaining files not reached (circular deps)
    for (const f of files) {
      if (!visited.has(f)) { ordered.push(f); }
    }

    return ordered;
  }

  private basename(filePath: string): string {
    const parts = filePath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || filePath;
  }

  static serializeForPrompt(
    data: DependencyGraphData,
    filter: 'full' | 'critical-paths' | 'summary'
  ): string {
    const lines: string[] = ['## Dependency Graph', ''];

    if (filter === 'summary') {
      lines.push(`Files analyzed: ${data.fileDependencies.size}`);
      lines.push(`Symbols tracked: ${data.symbolMap.size}`);
      lines.push(`Critical paths: ${data.criticalPaths.length}`);
      lines.push('');
      if (data.criticalPaths.length > 0) {
        lines.push('### Critical Paths', '');
        for (const cp of data.criticalPaths) {
          lines.push(`- ${cp.description}`);
        }
        lines.push('');
      }
      return lines.join('\n');
    }

    if (filter === 'critical-paths') {
      // Critical paths
      if (data.criticalPaths.length > 0) {
        lines.push('### Critical Paths', '');
        for (const cp of data.criticalPaths) {
          lines.push(`- ${cp.description}`);
          lines.push(`  Files: ${cp.files.join(', ')}`);
        }
 
        lines.push('');
      }

      // Symbol map entries referenced in critical paths
      const criticalFiles = new Set<string>();
      for (const cp of data.criticalPaths) {
        for (const f of cp.files) { criticalFiles.add(f); }
      }

      const relevantSymbols: Array<[string, { definedIn: string; referencedBy: string[]; type: string }]> = [];
      for (const [name, info] of data.symbolMap) {
        if (criticalFiles.has(info.definedIn) ||
            info.referencedBy.some(r => criticalFiles.has(r))) {
          relevantSymbols.push([name, info]);
        }
      }

      if (relevantSymbols.length > 0) {
        lines.push('### Symbol Map', '');
        for (const [name, info] of relevantSymbols) {
          lines.push(`- \`${name}\` (${info.type}) defined in ${info.definedIn}`);
          if (info.referencedBy.length > 0) {
            lines.push(`  Referenced by: ${info.referencedBy.join(', ')}`);
          }
        }
        lines.push('');
      }

      return lines.join('\n');
    }

    // filter === 'full'
    // File dependencies
    if (data.fileDependencies.size > 0) {
      lines.push('### File Dependencies', '');
      for (const [filePath, deps] of data.fileDependencies) {
        lines.push(`- ${filePath}`);
        if (deps.imports.length > 0) {
          lines.push(`  Imports: ${deps.imports.join(', ')}`);
        }
        if (deps.importedBy.length > 0) {
          lines.push(`  Imported by: ${deps.importedBy.join(', ')}`);
        }
      }
      lines.push('');
    }

    // Critical paths
    if (data.criticalPaths.length > 0) {
      lines.push('### Critical Paths', '');
      for (const cp of data.criticalPaths) {
        lines.push(`- ${cp.description}`);
        lines.push(`  Files: ${cp.files.join(', ')}`);
      }
      lines.push('');
    }

    // Symbol map — top 20 by reference count
    if (data.symbolMap.size > 0) {
      const sorted = [...data.symbolMap.entries()]
        .sort((a, b) => b[1].referencedBy.length - a[1].referencedBy.length)
        .slice(0, 20);

      lines.push('### Symbol Map', '');
      for (const [name, info] of sorted) {
        lines.push(`- \`${name}\` (${info.type}) defined in ${info.definedIn}`);
        if (info.referencedBy.length > 0) {
          lines.push(`  Referenced by: ${info.referencedBy.join(', ')}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  // ── Branch-aware parsing (regex-based, no LSP needed) ──

  /**
   * Parse import paths from file content using regex.
   * Handles: import ... from '...', require('...'), dynamic import('...')
   * Resolves relative paths against the file's directory.
   */
  private parseImportsFromContent(content: string, filePath: string): string[] {
    const imports: string[] = [];
    const fileDir = path.dirname(filePath);

    // ES module imports: import ... from './foo' or import './foo'
    const esImportRegex = /(?:import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
    let match: RegExpExecArray | null;
    while ((match = esImportRegex.exec(content)) !== null) {
      const specifier = match[1] || match[2];
      if (specifier && (specifier.startsWith('.') || specifier.startsWith('/'))) {
        const resolved = this.resolveImportPath(fileDir, specifier);
        if (resolved) { imports.push(resolved); }
      }
    }

    // CommonJS require: require('./foo')
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      const specifier = match[1];
      if (specifier && (specifier.startsWith('.') || specifier.startsWith('/'))) {
        const resolved = this.resolveImportPath(fileDir, specifier);
        if (resolved) { imports.push(resolved); }
      }
    }

    return [...new Set(imports)];
  }

  /**
   * Resolve a relative import specifier to an absolute file path.
   * Since we can't check filesystem (file may not exist on disk when on different branch),
   * we use heuristics: if specifier has no extension, assume .ts (TypeScript project).
   */
  private resolveImportPath(fromDir: string, specifier: string): string | undefined {
    const base = path.resolve(fromDir, specifier);
    const ext = path.extname(specifier);

    if (ext) {
      // Specifier already has extension (e.g., './foo.js', './bar.ts')
      return base;
    }

    // No extension — assume .ts for TypeScript projects
    return base + '.ts';
  }

  /**
   * Parse exported symbols from file content using regex.
   * Extracts: export function, export class, export interface, export type,
   * export const, export enum, export default, export abstract class
   */
  private parseSymbolsFromContent(content: string): Array<{
    name: string;
    type: string;
    range: vscode.Range;
  }> {
    const symbols: Array<{ name: string; type: string; range: vscode.Range }> = [];
    const lines = content.split('\n');

    const exportPatterns: Array<{ regex: RegExp; type: SymbolType }> = [
      { regex: /export\s+(?:async\s+)?function\s+(\w+)/,       type: 'function' },
      { regex: /export\s+(?:abstract\s+)?class\s+(\w+)/,       type: 'class' },
      { regex: /export\s+interface\s+(\w+)/,                    type: 'interface' },
      { regex: /export\s+type\s+(\w+)/,                         type: 'type' },
      { regex: /export\s+const\s+(\w+)/,                        type: 'constant' },
      { regex: /export\s+enum\s+(\w+)/,                         type: 'enum' },
      { regex: /export\s+default\s+(?:class|function)\s+(\w+)/, type: 'class' },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { regex, type } of exportPatterns) {
        const match = line.match(regex);
        if (match?.[1]) {
          symbols.push({
            name: match[1],
            type,
            range: new vscode.Range(i, 0, i, line.length),
          });
          break; // One match per line
        }
      }
    }

    return symbols;
  }
}
