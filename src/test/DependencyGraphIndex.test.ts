import * as assert from 'assert';
import * as vscode from 'vscode';
import { DependencyGraphIndex, DEFAULT_GRAPH_CONFIG } from '../services/llm/orchestrator/DependencyGraphIndex';
import { DependencyGraphData, DependencyGraphConfig } from '../services/llm/orchestrator/orchestratorTypes';
import { UnifiedDiffFile } from '../services/llm/contextTypes';

// ─── Helpers ───

function createDiffFile(filePath: string, overrides?: Partial<UnifiedDiffFile>): UnifiedDiffFile {
  return {
    filePath,
    relativePath: filePath,
    diff: '@@ -1 +1 @@\n-old\n+new',
    status: 0,
    statusLabel: 'Modified',
    isDeleted: false,
    isBinary: false,
    ...overrides,
  };
}

/** Plain object matching DocumentLink shape — avoids VS Code constructor validation issues */
function createDocLink(targetPath: string): any {
  return {
    range: new vscode.Range(0, 0, 0, 10),
    target: vscode.Uri.file(targetPath),
  };
}

function createDocSymbol(
  name: string,
  kind: vscode.SymbolKind,
  children: vscode.DocumentSymbol[] = []
): vscode.DocumentSymbol {
  const range = new vscode.Range(0, 0, 1, 0);
  const selRange = new vscode.Range(0, 0, 0, name.length);
  const sym = new vscode.DocumentSymbol(name, '', kind, range, selRange);
  sym.children = children;
  return sym;
}

function createLocation(filePath: string, line: number = 0): vscode.Location {
  return new vscode.Location(vscode.Uri.file(filePath), new vscode.Position(line, 0));
}

/** Convert a raw path to the platform-specific fsPath via vscode.Uri.file */
function fp(rawPath: string): string {
  return vscode.Uri.file(rawPath).fsPath;
}

// ─── Stub infrastructure ───

type CommandStub = (command: string, ...args: unknown[]) => unknown;

let originalExecuteCommand: typeof vscode.commands.executeCommand;
let originalOpenTextDocument: typeof vscode.workspace.openTextDocument;

function stubExecuteCommand(fn: CommandStub): void {
  (vscode.commands as any).executeCommand = fn;
}

function stubOpenTextDocument(fn: (uri: vscode.Uri) => unknown): void {
  (vscode.workspace as any).openTextDocument = fn;
}

function restoreStubs(): void {
  (vscode.commands as any).executeCommand = originalExecuteCommand;
  (vscode.workspace as any).openTextDocument = originalOpenTextDocument;
}

function fakeTextDocument(filePath: string, symbolNames: string[]): any {
  const text = symbolNames.join('\n');
  return {
    uri: vscode.Uri.file(filePath),
    getText: () => text,
    positionAt: (offset: number) => {
      let line = 0;
      let col = 0;
      for (let i = 0; i < offset; i++) {
        if (text[i] === '\n') { line++; col = 0; } else { col++; }
      }
      return new vscode.Position(line, col);
    },
  };
}

/**
 * Standard mock setup: configures executeCommand and openTextDocument
 * to return controlled results based on a linkMap, symbolMap, and refMap.
 * Keys in all maps use raw paths; lookup normalizes via vscode.Uri.file().
 */
function setupMocks(opts: {
  linkMap?: Map<string, string[]>;
  symbolMap?: Map<string, vscode.DocumentSymbol[]>;
  refMap?: Map<string, vscode.Location[]>;
}): void {
  const { linkMap = new Map(), symbolMap = new Map(), refMap = new Map() } = opts;

  function findInMap<T>(map: Map<string, T>, fsPath: string): T | undefined {
    if (map.has(fsPath)) { return map.get(fsPath); }
    for (const [key, value] of map) {
      if (vscode.Uri.file(key).fsPath === fsPath) { return value; }
    }
    return undefined;
  }

  stubOpenTextDocument((uri: vscode.Uri) => {
    const syms = findInMap(symbolMap, uri.fsPath) ?? [];
    const names = syms.map((s: vscode.DocumentSymbol) => s.name);
    return Promise.resolve(fakeTextDocument(uri.fsPath, names));
  });

  stubExecuteCommand((command: string, ...args: unknown[]) => {
    if (command === 'vscode.executeLinkProvider') {
      const uri = args[0] as vscode.Uri;
      const targets = findInMap(linkMap, uri.fsPath) ?? [];
      return Promise.resolve(targets.map((t: string) => createDocLink(t)));
    }
    if (command === 'vscode.executeDocumentSymbolProvider') {
      const uri = args[0] as vscode.Uri;
      return Promise.resolve(findInMap(symbolMap, uri.fsPath) ?? []);
    }
    if (command === 'vscode.executeReferenceProvider') {
      const uri = args[0] as vscode.Uri;
      return Promise.resolve(findInMap(refMap, uri.fsPath) ?? []);
    }
    return Promise.resolve(undefined);
  });
}

suite('DependencyGraphIndex', () => {

  suiteSetup(() => {
    originalExecuteCommand = vscode.commands.executeCommand;
    originalOpenTextDocument = vscode.workspace.openTextDocument as any;
  });

  teardown(() => {
    restoreStubs();
  });

  // ── build() with 3 changed files ──

  test('build() with 3 changed files: fileDependencies has entries for all 3 with correct imports/importedBy', async () => {
    const linkMap = new Map<string, string[]>([
      ['/src/a.ts', ['/src/b.ts']],
      ['/src/b.ts', ['/src/c.ts']],
      ['/src/c.ts', []],
    ]);
    setupMocks({ linkMap });

    const index = new DependencyGraphIndex(DEFAULT_GRAPH_CONFIG);
    const result = await index.build([
      createDiffFile(fp('/src/a.ts')),
      createDiffFile(fp('/src/b.ts')),
      createDiffFile(fp('/src/c.ts')),
    ]);

    assert.strictEqual(result.fileDependencies.size, 3);
    assert.ok(result.fileDependencies.has(fp('/src/a.ts')));
    assert.ok(result.fileDependencies.has(fp('/src/b.ts')));
    assert.ok(result.fileDependencies.has(fp('/src/c.ts')));

    const aEntry = result.fileDependencies.get(fp('/src/a.ts'))!;
    assert.ok(aEntry.imports.includes(fp('/src/b.ts')), 'a.ts should import b.ts');

    const bEntry = result.fileDependencies.get(fp('/src/b.ts'))!;
    assert.ok(bEntry.imports.includes(fp('/src/c.ts')), 'b.ts should import c.ts');
    assert.ok(bEntry.importedBy.includes(fp('/src/a.ts')), 'b.ts imported by a.ts');

    const cEntry = result.fileDependencies.get(fp('/src/c.ts'))!;
    assert.ok(cEntry.importedBy.includes(fp('/src/b.ts')), 'c.ts imported by b.ts');
  });

  // ── build() with binary/deleted files ──

  test('build() with binary/deleted files: they are skipped', async () => {
    setupMocks({ linkMap: new Map([['/src/a.ts', []]]) });

    const index = new DependencyGraphIndex(DEFAULT_GRAPH_CONFIG);
    const result = await index.build([
      createDiffFile(fp('/src/a.ts')),
      createDiffFile(fp('/src/binary.png'), { isBinary: true }),
      createDiffFile(fp('/src/deleted.ts'), { isDeleted: true }),
    ]);

    assert.strictEqual(result.fileDependencies.size, 1);
    assert.ok(result.fileDependencies.has(fp('/src/a.ts')));
    assert.ok(!result.fileDependencies.has(fp('/src/binary.png')));
    assert.ok(!result.fileDependencies.has(fp('/src/deleted.ts')));
  });

  // ── build() scans direct neighbors ──

  test('build() scans direct neighbors: imported file B (not changed) appears in fileDependencies', async () => {
    const linkMap = new Map<string, string[]>([
      ['/src/a.ts', ['/src/b.ts']],
      ['/src/b.ts', ['/src/c.ts']],
    ]);
    setupMocks({ linkMap });

    const index = new DependencyGraphIndex(DEFAULT_GRAPH_CONFIG);
    const result = await index.build([createDiffFile(fp('/src/a.ts'))]);

    assert.ok(result.fileDependencies.has(fp('/src/a.ts')), 'changed file should be present');
    assert.ok(result.fileDependencies.has(fp('/src/b.ts')), 'neighbor b.ts should be scanned');
  });

  // ── extractSymbols() ──

  test('extractSymbols: symbolMap has correct entries with type mapping for Function, Class, Interface', async () => {
    const symbols = new Map<string, vscode.DocumentSymbol[]>([
      ['/src/a.ts', [
        createDocSymbol('myFunction', vscode.SymbolKind.Function),
        createDocSymbol('MyClass', vscode.SymbolKind.Class),
        createDocSymbol('IMyInterface', vscode.SymbolKind.Interface),
        createDocSymbol('someVar', vscode.SymbolKind.Variable),
      ]],
    ]);
    setupMocks({ symbolMap: symbols, linkMap: new Map([['/src/a.ts', []]]) });

    const index = new DependencyGraphIndex(DEFAULT_GRAPH_CONFIG);
    const result = await index.build([createDiffFile(fp('/src/a.ts'))]);

    assert.ok(result.symbolMap.has('myFunction'));
    assert.strictEqual(result.symbolMap.get('myFunction')!.type, 'function');
    assert.strictEqual(result.symbolMap.get('myFunction')!.definedIn, fp('/src/a.ts'));

    assert.ok(result.symbolMap.has('MyClass'));
    assert.strictEqual(result.symbolMap.get('MyClass')!.type, 'class');

    assert.ok(result.symbolMap.has('IMyInterface'));
    assert.strictEqual(result.symbolMap.get('IMyInterface')!.type, 'interface');

    // Variable should NOT be in symbolMap
    assert.ok(!result.symbolMap.has('someVar'));
  });

  // ── findSymbolReferences() ──

  test('findSymbolReferences: symbolMap.referencedBy contains files from ReferenceProvider', async () => {
    const symbols = new Map<string, vscode.DocumentSymbol[]>([
      ['/src/a.ts', [createDocSymbol('MyClass', vscode.SymbolKind.Class)]],
    ]);
    const refMap = new Map<string, vscode.Location[]>([
      ['/src/a.ts', [
        createLocation('/src/a.ts', 0),  // definition itself — should be excluded
        createLocation('/src/b.ts', 5),
        createLocation('/src/c.ts', 10),
        createLocation('/src/d.ts', 15),
      ]],
    ]);
    setupMocks({
      linkMap: new Map([['/src/a.ts', []]]),
      symbolMap: symbols,
      refMap,
    });

    const index = new DependencyGraphIndex(DEFAULT_GRAPH_CONFIG);
    const result = await index.build([createDiffFile(fp('/src/a.ts'))]);

    const myClass = result.symbolMap.get('MyClass')!;
    assert.ok(myClass, 'MyClass should exist in symbolMap');
    assert.ok(myClass.referencedBy.includes(fp('/src/b.ts')), 'should reference b.ts');
    assert.ok(myClass.referencedBy.includes(fp('/src/c.ts')), 'should reference c.ts');
    assert.ok(myClass.referencedBy.includes(fp('/src/d.ts')), 'should reference d.ts');
    assert.ok(!myClass.referencedBy.includes(fp('/src/a.ts')), 'should not reference definition file');
  });

  // ── computeCriticalPaths ──

  test('computeCriticalPaths: chain A→B→C all changed → 1 critical path with changedFileCount=3', async () => {
    const linkMap = new Map<string, string[]>([
      ['/src/a.ts', ['/src/b.ts']],
      ['/src/b.ts', ['/src/c.ts']],
      ['/src/c.ts', []],
    ]);
    setupMocks({ linkMap });

    const index = new DependencyGraphIndex(DEFAULT_GRAPH_CONFIG);
    const result = await index.build([
      createDiffFile(fp('/src/a.ts')),
      createDiffFile(fp('/src/b.ts')),
      createDiffFile(fp('/src/c.ts')),
    ]);

    assert.strictEqual(result.criticalPaths.length, 1);
    assert.strictEqual(result.criticalPaths[0].changedFileCount, 3);
    assert.strictEqual(result.criticalPaths[0].files.length, 3);
  });

  test('computeCriticalPaths: chain A→B→C where only A,C changed → no critical path (count<3)', async () => {
    const linkMap = new Map<string, string[]>([
      ['/src/a.ts', ['/src/b.ts']],
      ['/src/b.ts', ['/src/c.ts']],
      ['/src/c.ts', []],
    ]);
    setupMocks({ linkMap });

    const index = new DependencyGraphIndex(DEFAULT_GRAPH_CONFIG);
    const result = await index.build([
      createDiffFile(fp('/src/a.ts')),
      createDiffFile(fp('/src/c.ts')),
    ]);

    const pathsWithThree = result.criticalPaths.filter(p => p.changedFileCount >= 3);
    assert.strictEqual(pathsWithThree.length, 0);
  });

  test('computeCriticalPaths: circular dependency A→B→A → no infinite loop, valid result', async () => {
    const linkMap = new Map<string, string[]>([
      ['/src/a.ts', ['/src/b.ts']],
      ['/src/b.ts', ['/src/a.ts']],
    ]);
    setupMocks({ linkMap });

    const index = new DependencyGraphIndex(DEFAULT_GRAPH_CONFIG);
    const result = await index.build([
      createDiffFile(fp('/src/a.ts')),
      createDiffFile(fp('/src/b.ts')),
    ]);

    assert.ok(result.fileDependencies.has(fp('/src/a.ts')));
    assert.ok(result.fileDependencies.has(fp('/src/b.ts')));
    // 2 changed files < threshold 3, so no critical path
    assert.strictEqual(result.criticalPaths.length, 0);
  });

  // ── build() resource limits ──

  test('build() with > 100 files: filesScanned stops at maxFiles=100', async () => {
    const linkMap = new Map<string, string[]>();
    const files: UnifiedDiffFile[] = [];
    for (let i = 0; i < 120; i++) {
      const path = `/src/file${i}.ts`;
      linkMap.set(path, []);
      files.push(createDiffFile(fp(path)));
    }
    setupMocks({ linkMap });

    const config: DependencyGraphConfig = { ...DEFAULT_GRAPH_CONFIG, maxFiles: 100 };
    const index = new DependencyGraphIndex(config);
    const result = await index.build(files);

    assert.ok(result.fileDependencies.size <= 100, `Expected ≤100, got ${result.fileDependencies.size}`);
  });

  // ── build() timeout ──

  test('build() timeout: mock slow VS Code API → returns partial results without throwing', async () => {
    const config: DependencyGraphConfig = { ...DEFAULT_GRAPH_CONFIG, timeoutMs: 50 };

    let callCount = 0;
    stubOpenTextDocument((uri: vscode.Uri) => {
      callCount++;
      if (callCount > 2) {
        return new Promise(resolve => setTimeout(() => resolve(fakeTextDocument(uri.fsPath, [])), 200));
      }
      return Promise.resolve(fakeTextDocument(uri.fsPath, []));
    });
    stubExecuteCommand((command: string) => {
      if (command === 'vscode.executeLinkProvider') { return Promise.resolve([]); }
      if (command === 'vscode.executeDocumentSymbolProvider') { return Promise.resolve([]); }
      return Promise.resolve(undefined);
    });

    const index = new DependencyGraphIndex(config);
    const files = Array.from({ length: 20 }, (_, i) => createDiffFile(fp(`/src/file${i}.ts`)));

    const result = await index.build(files);
    assert.ok(result.fileDependencies instanceof Map);
    assert.ok(result.symbolMap instanceof Map);
    assert.ok(Array.isArray(result.criticalPaths));
  });

  // ── build() when VS Code API throws ──

  test('build() when VS Code API throws: returns empty graph without throwing', async () => {
    stubOpenTextDocument(() => Promise.reject(new Error('VS Code API unavailable')));
    stubExecuteCommand(() => Promise.reject(new Error('VS Code API unavailable')));

    const index = new DependencyGraphIndex(DEFAULT_GRAPH_CONFIG);
    const result = await index.build([createDiffFile(fp('/src/a.ts'))]);

    assert.ok(result.fileDependencies instanceof Map);
    assert.ok(result.symbolMap instanceof Map);
    assert.ok(Array.isArray(result.criticalPaths));
  });

  // ── serializeForPrompt tests (static method, no mocking needed) ──

  const sampleGraphData: DependencyGraphData = {
    fileDependencies: new Map([
      ['src/a.ts', { imports: ['src/b.ts'], importedBy: ['src/c.ts'] }],
      ['src/b.ts', { imports: [], importedBy: ['src/a.ts'] }],
      ['src/c.ts', { imports: ['src/a.ts'], importedBy: [] }],
    ]),
    symbolMap: new Map([
      ['MyClass', { definedIn: 'src/a.ts', referencedBy: ['src/b.ts', 'src/c.ts'], type: 'class' as const }],
      ['helperFn', { definedIn: 'src/b.ts', referencedBy: ['src/a.ts'], type: 'function' as const }],
      ['IConfig', { definedIn: 'src/c.ts', referencedBy: [], type: 'interface' as const }],
    ]),
    criticalPaths: [{
      files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      changedFileCount: 3,
      description: 'Chain: a.ts → b.ts → c.ts (3 changed files)',
    }],
  };

  test('serializeForPrompt(data, "full"): contains all fileDependencies, symbolMap, criticalPaths', () => {
    const output = DependencyGraphIndex.serializeForPrompt(sampleGraphData, 'full');

    assert.ok(output.includes('File Dependencies'), 'Should contain File Dependencies header');
    assert.ok(output.includes('src/a.ts'), 'Should contain file a.ts');
    assert.ok(output.includes('src/b.ts'), 'Should contain file b.ts');
    assert.ok(output.includes('src/c.ts'), 'Should contain file c.ts');
    assert.ok(output.includes('Imports:'), 'Should contain Imports label');
    assert.ok(output.includes('Imported by:'), 'Should contain Imported by label');
    assert.ok(output.includes('Symbol Map'), 'Should contain Symbol Map header');
    assert.ok(output.includes('MyClass'), 'Should contain MyClass symbol');
    assert.ok(output.includes('helperFn'), 'Should contain helperFn symbol');
    assert.ok(output.includes('(class)'), 'Should contain type annotation');
    assert.ok(output.includes('Critical Paths'), 'Should contain Critical Paths header');
    assert.ok(output.includes('3 changed files'), 'Should contain critical path description');
  });

  test('serializeForPrompt(data, "critical-paths"): contains only criticalPaths and related symbols', () => {
    const output = DependencyGraphIndex.serializeForPrompt(sampleGraphData, 'critical-paths');

    assert.ok(output.includes('Critical Paths'), 'Should contain Critical Paths header');
    assert.ok(output.includes('3 changed files'), 'Should contain critical path description');
    assert.ok(output.includes('src/a.ts'), 'Should contain files in critical path');
    assert.ok(output.includes('Symbol Map'), 'Should contain Symbol Map for related symbols');
    assert.ok(output.includes('MyClass'), 'MyClass is defined in critical path file');
    assert.ok(!output.includes('File Dependencies'), 'Should NOT contain File Dependencies section');
  });

  test('serializeForPrompt(data, "summary"): contains counts and critical path descriptions only', () => {
    const output = DependencyGraphIndex.serializeForPrompt(sampleGraphData, 'summary');

    assert.ok(output.includes('Files analyzed: 3'), 'Should contain file count');
    assert.ok(output.includes('Symbols tracked: 3'), 'Should contain symbol count');
    assert.ok(output.includes('Critical paths: 1'), 'Should contain critical path count');
    assert.ok(output.includes('3 changed files'), 'Should contain critical path description');
    assert.ok(!output.includes('File Dependencies'), 'Should NOT contain File Dependencies section');
    assert.ok(!output.includes('Referenced by:'), 'Should NOT contain detailed symbol references');
  });

});
