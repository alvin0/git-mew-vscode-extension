import * as assert from 'assert';
import { queryContextTool } from '../llm-tools/tools/queryContext';
import { SharedContextStoreImpl, ISharedContextStore } from '../services/llm/orchestrator/SharedContextStore';
import { DependencyGraphData } from '../services/llm/orchestrator/orchestratorTypes';
import { ToolOptional, ToolExecuteResponse } from '../llm-tools/toolInterface';

// ─── Helpers ───

/** Create a minimal ToolOptional with a shared store and optional call counter */
function makeOptional(
  store: ISharedContextStore,
  counter?: { value: number },
): ToolOptional {
  return {
    llmAdapter: {} as any,
    sharedStore: store,
    queryContextCallCount: counter ?? { value: 0 },
  };
}

/** Build a simple dependency graph for testing */
function buildTestGraph(): DependencyGraphData {
  return {
    fileDependencies: new Map([
      ['src/a.ts', { imports: ['src/b.ts', 'src/c.ts'], importedBy: ['src/d.ts'] }],
      ['src/b.ts', { imports: ['src/c.ts'], importedBy: ['src/a.ts'] }],
      ['src/c.ts', { imports: [], importedBy: ['src/a.ts', 'src/b.ts'] }],
      ['src/d.ts', { imports: ['src/a.ts'], importedBy: [] }],
    ]),
    symbolMap: new Map([
      ['MyClass', { definedIn: 'src/a.ts', referencedBy: ['src/b.ts', 'src/d.ts'], type: 'class' as const }],
      ['helperFn', { definedIn: 'src/c.ts', referencedBy: [], type: 'function' as const }],
    ]),
    criticalPaths: [
      { files: ['src/a.ts', 'src/b.ts', 'src/c.ts'], changedFileCount: 3, description: 'A → B → C' },
    ],
  };
}

suite('queryContext Tool', () => {

  // ── No shared store ──

  test('execute() without sharedStore: returns error description', async () => {
    const result = await queryContextTool.execute(
      { query_type: 'imports_of', target: 'MyClass' },
      { llmAdapter: {} as any }, // no sharedStore
    );
    assert.ok(result.description.includes('Shared context store not available'));
  });

  // ── imports_of: symbol in symbolMap ──

  test('execute() imports_of with symbol in symbolMap: returns definedIn + referencedBy', async () => {
    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(buildTestGraph());

    const result = await queryContextTool.execute(
      { query_type: 'imports_of', target: 'MyClass' },
      makeOptional(store),
    );

    assert.ok(result.description.includes('src/a.ts'), 'Should contain definedIn path');
    assert.ok(result.description.includes('src/b.ts'), 'Should contain first reference');
    assert.ok(result.description.includes('src/d.ts'), 'Should contain second reference');
  });

  // ── imports_of: file in fileDependencies ──

  test('execute() imports_of with file in fileDependencies: returns importedBy list', async () => {
    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(buildTestGraph());

    // 'src/c.ts' is not a symbol name, so symbolMap lookup fails → falls back to fileDependencies
    const result = await queryContextTool.execute(
      { query_type: 'imports_of', target: 'src/c.ts' },
      makeOptional(store),
    );

    assert.ok(result.description.includes('src/a.ts'), 'Should list src/a.ts as importer');
    assert.ok(result.description.includes('src/b.ts'), 'Should list src/b.ts as importer');
  });

  // ── dependency_chain: BFS output format ──

  test('execute() dependency_chain: verify BFS chain output format', async () => {
    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(buildTestGraph());

    const result = await queryContextTool.execute(
      { query_type: 'dependency_chain', target: 'src/a.ts' },
      makeOptional(store),
    );

    // BFS from src/a.ts: should show src/a.ts at depth 0, then its imports src/b.ts, src/c.ts
    assert.ok(result.description.includes('src/a.ts'), 'Should contain root file');
    assert.ok(result.description.includes('src/b.ts'), 'Should contain first import');
    assert.ok(result.description.includes('src/c.ts'), 'Should contain second import');
    // Verify the format includes the arrow prefix for deeper levels
    assert.ok(result.description.includes('→'), 'Should contain BFS arrow prefix for imports');
  });

  // ── references_of: cached result ──

  test('execute() references_of with cached result: returns cached without API call', async () => {
    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(buildTestGraph());

    // Pre-populate the cache with a find_references result
    const cachedResponse: ToolExecuteResponse = {
      description: 'Found 3 references across 2 files:\n  src/b.ts: lines 5, 10\n  src/d.ts: lines 1',
      contentType: 'text',
    };
    store.setToolResult('find_references', { symbol: 'MyClass' }, cachedResponse);

    const result = await queryContextTool.execute(
      { query_type: 'references_of', target: 'MyClass' },
      makeOptional(store),
    );

    // Should return cached result (contains "(cached)" marker)
    assert.ok(result.description.includes('cached'), 'Should indicate result is cached');
    assert.ok(result.description.includes('Found 3 references'), 'Should contain cached description');
  });

  // ── cached_result: existing cache ──

  test('execute() cached_result with existing cache: returns cached read_file result', async () => {
    const store = new SharedContextStoreImpl();

    // Pre-populate with a read_file result
    const cachedResponse: ToolExecuteResponse = {
      description: 'export class MyClass { ... }',
      contentType: 'text',
    };
    store.setToolResult('read_file', { filename: 'src/a.ts' }, cachedResponse);

    const result = await queryContextTool.execute(
      { query_type: 'cached_result', target: 'src/a.ts' },
      makeOptional(store),
    );

    assert.ok(result.description.includes('export class MyClass'), 'Should contain cached file content');
  });

  // ── cached_result: no cache ──

  test('execute() cached_result with no cache: returns "No cached result" message', async () => {
    const store = new SharedContextStoreImpl();

    const result = await queryContextTool.execute(
      { query_type: 'cached_result', target: 'src/nonexistent.ts' },
      makeOptional(store),
    );

    assert.ok(result.description.includes('No cached result'), 'Should indicate no cached result');
  });

  // ── Invalid query_type ──

  test('execute() with invalid query_type: returns error with valid types list', async () => {
    const store = new SharedContextStoreImpl();

    const result = await queryContextTool.execute(
      { query_type: 'invalid_type', target: 'anything' },
      makeOptional(store),
    );

    assert.ok(result.description.includes('Invalid query_type'), 'Should indicate invalid query type');
    assert.ok(result.description.includes('imports_of'), 'Should list valid type: imports_of');
    assert.ok(result.description.includes('dependency_chain'), 'Should list valid type: dependency_chain');
    assert.ok(result.description.includes('references_of'), 'Should list valid type: references_of');
    assert.ok(result.description.includes('cached_result'), 'Should list valid type: cached_result');
  });

  // ── Call count limit ──

  test('call count limit: 5 calls succeed, 6th returns "Call limit reached"', async () => {
    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(buildTestGraph());
    const counter = { value: 0 };
    const optional = makeOptional(store, counter);

    // First 5 calls should succeed
    for (let i = 0; i < 5; i++) {
      const result = await queryContextTool.execute(
        { query_type: 'dependency_chain', target: 'src/a.ts' },
        optional,
      );
      assert.ok(
        !result.description.includes('Call limit reached'),
        `Call ${i + 1} should succeed`,
      );
    }

    // 6th call should hit the limit
    const result6 = await queryContextTool.execute(
      { query_type: 'dependency_chain', target: 'src/a.ts' },
      optional,
    );
    assert.ok(
      result6.description.includes('Call limit reached'),
      '6th call should return call limit error',
    );
  });


  // ── Token truncation ──

  test('token truncation: large result is truncated with "[truncated to 2000 token limit]"', async () => {
    const store = new SharedContextStoreImpl();

    // Pre-populate cache with a very large read_file result (> 8000 chars)
    const largeContent = 'x'.repeat(10000);
    const cachedResponse: ToolExecuteResponse = {
      description: largeContent,
      contentType: 'text',
    };
    store.setToolResult('read_file', { filename: 'src/big.ts' }, cachedResponse);

    const result = await queryContextTool.execute(
      { query_type: 'cached_result', target: 'src/big.ts' },
      makeOptional(store),
    );

    assert.ok(
      result.description.includes('[truncated to 2000 token limit]'),
      'Should contain truncation marker',
    );
    // The total result should be truncated (prefix "[query_context] Cached result for..." + 8000 chars + truncation marker)
    // It should NOT contain the full 10000 char content
    assert.ok(
      result.description.length < 10000,
      'Result should be shorter than the original large content',
    );
  });

  // ── Call count reset ──

  test('call count reset: new counter allows calls to succeed again', async () => {
    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(buildTestGraph());

    // First iteration: exhaust the counter
    const counter1 = { value: 0 };
    const optional1 = makeOptional(store, counter1);
    for (let i = 0; i < 5; i++) {
      await queryContextTool.execute(
        { query_type: 'dependency_chain', target: 'src/a.ts' },
        optional1,
      );
    }
    // 6th call fails
    const failResult = await queryContextTool.execute(
      { query_type: 'dependency_chain', target: 'src/a.ts' },
      optional1,
    );
    assert.ok(failResult.description.includes('Call limit reached'), 'Should be limited on old counter');

    // New iteration: fresh counter
    const counter2 = { value: 0 };
    const optional2 = makeOptional(store, counter2);
    const freshResult = await queryContextTool.execute(
      { query_type: 'dependency_chain', target: 'src/a.ts' },
      optional2,
    );
    assert.ok(
      !freshResult.description.includes('Call limit reached'),
      'New counter should allow calls again',
    );
  });

  // ── imports_of: symbol with no references ──

  test('execute() imports_of with symbol that has no references: returns "no known references"', async () => {
    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(buildTestGraph());

    const result = await queryContextTool.execute(
      { query_type: 'imports_of', target: 'helperFn' },
      makeOptional(store),
    );

    assert.ok(result.description.includes('no known references'), 'Should indicate no references');
    assert.ok(result.description.includes('src/c.ts'), 'Should still show definedIn');
  });

  // ── dependency_chain: no graph available ──

  test('execute() dependency_chain without dependency graph: returns "No dependency graph" message', async () => {
    const store = new SharedContextStoreImpl();
    // No graph set

    const result = await queryContextTool.execute(
      { query_type: 'dependency_chain', target: 'src/a.ts' },
      makeOptional(store),
    );

    assert.ok(result.description.includes('No dependency graph'), 'Should indicate no graph available');
  });
});
