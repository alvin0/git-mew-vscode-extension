import * as assert from 'assert';
import { SharedContextStoreImpl } from '../services/llm/orchestrator/SharedContextStore';
import {
  AgentFinding,
  DependencyGraphData,
  RiskHypothesis,
} from '../services/llm/orchestrator/orchestratorTypes';
import { ToolExecuteResponse } from '../llm-tools/toolInterface';

suite('SharedContextStore', () => {

  // ── normalizeKey ──

  test('normalizeKey: objects with different key order produce same cache key', () => {
    const store = new SharedContextStoreImpl();
    const result: ToolExecuteResponse = { description: 'file content' };

    // Set with {b, a} order
    store.setToolResult('read_file', { b: 2, a: 1 }, result);

    // Get with {a, b} order — should hit cache
    const cached = store.getToolResult('read_file', { a: 1, b: 2 });
    assert.strictEqual(cached, result);
    assert.strictEqual(store.getStats().toolCacheHits, 1);
  });

  // ── Tool Result Cache ──

  test('getToolResult: cache miss returns undefined and increments toolCacheMisses', () => {
    const store = new SharedContextStoreImpl();

    const result = store.getToolResult('read_file', { path: 'foo.ts' });
    assert.strictEqual(result, undefined);
    assert.strictEqual(store.getStats().toolCacheMisses, 1);
  });

  test('setToolResult then getToolResult: returns exact same result object and increments toolCacheHits', () => {
    const store = new SharedContextStoreImpl();
    const result: ToolExecuteResponse = { description: 'hello world' };

    store.setToolResult('read_file', { path: 'foo.ts' }, result);
    const cached = store.getToolResult('read_file', { path: 'foo.ts' });

    assert.strictEqual(cached, result); // same reference
    assert.strictEqual(store.getStats().toolCacheHits, 1);
    assert.strictEqual(store.getStats().toolCacheMisses, 0);
  });

  test('getToolResult: different tool name with same args returns undefined (no cross-tool collision)', () => {
    const store = new SharedContextStoreImpl();
    const result: ToolExecuteResponse = { description: 'data' };

    store.setToolResult('read_file', { path: 'foo.ts' }, result);

    const cached = store.getToolResult('find_references', { path: 'foo.ts' });
    assert.strictEqual(cached, undefined);
    assert.strictEqual(store.getStats().toolCacheMisses, 1);
  });

  // ── Agent Findings ──

  test('addAgentFindings + getAgentFindings: findings retrievable by role', () => {
    const store = new SharedContextStoreImpl();

    const crFindings: AgentFinding[] = [
      { agentRole: 'Code Reviewer', type: 'issue', data: { severity: 'major' }, timestamp: 1 },
    ];
    const fdFindings: AgentFinding[] = [
      { agentRole: 'Flow Diagram', type: 'flow', data: { name: 'auth-flow' }, timestamp: 2 },
    ];

    store.addAgentFindings('Code Reviewer', crFindings);
    store.addAgentFindings('Flow Diagram', fdFindings);

    const crResult = store.getAgentFindings('Code Reviewer');
    assert.strictEqual(crResult.length, 1);
    assert.strictEqual(crResult[0].agentRole, 'Code Reviewer');

    const fdResult = store.getAgentFindings('Flow Diagram');
    assert.strictEqual(fdResult.length, 1);
    assert.strictEqual(fdResult[0].agentRole, 'Flow Diagram');
  });

  test('getAgentFindings without role filter: returns all findings from all agents', () => {
    const store = new SharedContextStoreImpl();

    store.addAgentFindings('Code Reviewer', [
      { agentRole: 'Code Reviewer', type: 'issue', data: {}, timestamp: 1 },
    ]);
    store.addAgentFindings('Flow Diagram', [
      { agentRole: 'Flow Diagram', type: 'flow', data: {}, timestamp: 2 },
    ]);
    store.addAgentFindings('Observer', [
      { agentRole: 'Observer', type: 'risk', data: {}, timestamp: 3 },
    ]);

    const all = store.getAgentFindings();
    assert.strictEqual(all.length, 3);
  });

  // ── Dependency Graph ──

  test('setDependencyGraph + getDependencyGraph: round-trip', () => {
    const store = new SharedContextStoreImpl();

    const graph: DependencyGraphData = {
      fileDependencies: new Map([
        ['src/a.ts', { imports: ['src/b.ts'], importedBy: [] }],
      ]),
      symbolMap: new Map([
        ['MyClass', { definedIn: 'src/a.ts', referencedBy: ['src/c.ts'], type: 'class' }],
      ]),
      criticalPaths: [
        { files: ['src/a.ts', 'src/b.ts'], changedFileCount: 2, description: 'A → B' },
      ],
    };

    store.setDependencyGraph(graph);
    const retrieved = store.getDependencyGraph();

    assert.strictEqual(retrieved, graph);
    assert.strictEqual(retrieved!.fileDependencies.get('src/a.ts')!.imports[0], 'src/b.ts');
    assert.strictEqual(retrieved!.symbolMap.get('MyClass')!.definedIn, 'src/a.ts');
    assert.strictEqual(retrieved!.criticalPaths.length, 1);
  });

  // ── updateDependencyGraph ──

  test('updateDependencyGraph: merges fileDependencies with deduplication', () => {
    const store = new SharedContextStoreImpl();

    const initial: DependencyGraphData = {
      fileDependencies: new Map([
        ['src/a.ts', { imports: ['src/b.ts'], importedBy: ['src/c.ts'] }],
      ]),
      symbolMap: new Map(),
      criticalPaths: [],
    };
    store.setDependencyGraph(initial);

    // Patch: add duplicate + new import for src/a.ts, add new file src/d.ts
    const patch: Partial<DependencyGraphData> = {
      fileDependencies: new Map([
        ['src/a.ts', { imports: ['src/b.ts', 'src/e.ts'], importedBy: ['src/c.ts', 'src/f.ts'] }],
        ['src/d.ts', { imports: ['src/a.ts'], importedBy: [] }],
      ]),
    };
    store.updateDependencyGraph(patch);

    const graph = store.getDependencyGraph()!;
    const aEntry = graph.fileDependencies.get('src/a.ts')!;

    // imports should be deduplicated: ['src/b.ts', 'src/e.ts']
    assert.strictEqual(aEntry.imports.length, 2);
    assert.ok(aEntry.imports.includes('src/b.ts'));
    assert.ok(aEntry.imports.includes('src/e.ts'));

    // importedBy should be deduplicated: ['src/c.ts', 'src/f.ts']
    assert.strictEqual(aEntry.importedBy.length, 2);
    assert.ok(aEntry.importedBy.includes('src/c.ts'));
    assert.ok(aEntry.importedBy.includes('src/f.ts'));

    // New file should be added
    const dEntry = graph.fileDependencies.get('src/d.ts')!;
    assert.strictEqual(dEntry.imports[0], 'src/a.ts');
  });

  test('updateDependencyGraph: merges symbolMap with referencedBy deduplication and adds new symbols', () => {
    const store = new SharedContextStoreImpl();

    const initial: DependencyGraphData = {
      fileDependencies: new Map(),
      symbolMap: new Map([
        ['MyClass', { definedIn: 'src/a.ts', referencedBy: ['src/b.ts'], type: 'class' }],
      ]),
      criticalPaths: [],
    };
    store.setDependencyGraph(initial);

    const patch: Partial<DependencyGraphData> = {
      symbolMap: new Map([
        // Existing symbol: add duplicate + new reference
        ['MyClass', { definedIn: 'src/a.ts', referencedBy: ['src/b.ts', 'src/c.ts'], type: 'class' }],
        // New symbol
        ['helperFn', { definedIn: 'src/utils.ts', referencedBy: ['src/d.ts'], type: 'function' }],
      ]),
    };
    store.updateDependencyGraph(patch);

    const graph = store.getDependencyGraph()!;

    // Existing symbol: referencedBy deduplicated
    const myClass = graph.symbolMap.get('MyClass')!;
    assert.strictEqual(myClass.referencedBy.length, 2);
    assert.ok(myClass.referencedBy.includes('src/b.ts'));
    assert.ok(myClass.referencedBy.includes('src/c.ts'));

    // New symbol added
    const helperFn = graph.symbolMap.get('helperFn')!;
    assert.strictEqual(helperFn.definedIn, 'src/utils.ts');
    assert.strictEqual(helperFn.referencedBy[0], 'src/d.ts');
  });


  // ── serializeForAgent ──

  test('serializeForAgent Code Reviewer: output contains dependency graph as full filter', () => {
    const store = new SharedContextStoreImpl();

    const graph: DependencyGraphData = {
      fileDependencies: new Map([
        ['src/a.ts', { imports: ['src/b.ts'], importedBy: ['src/c.ts'] }],
      ]),
      symbolMap: new Map([
        ['MyClass', { definedIn: 'src/a.ts', referencedBy: ['src/b.ts', 'src/c.ts'], type: 'class' }],
      ]),
      criticalPaths: [
        { files: ['src/a.ts', 'src/b.ts', 'src/c.ts'], changedFileCount: 3, description: 'A → B → C' },
      ],
    };
    store.setDependencyGraph(graph);

    const output = store.serializeForAgent('Code Reviewer', 10000);

    // 'full' filter includes File Dependencies section and Symbol Map
    assert.ok(output.includes('File Dependencies'), 'Should contain File Dependencies section');
    assert.ok(output.includes('src/a.ts'), 'Should contain file path');
    assert.ok(output.includes('MyClass'), 'Should contain symbol name');
    assert.ok(output.includes('Critical Paths'), 'Should contain Critical Paths section');
  });

  test('serializeForAgent Observer: output contains agent findings, risk hypotheses, and graph as summary', () => {
    const store = new SharedContextStoreImpl();

    // Add findings from other agents (not Observer)
    store.addAgentFindings('Code Reviewer', [
      {
        agentRole: 'Code Reviewer',
        type: 'issue',
        data: { issues: [{ file: 'src/a.ts', location: '10', severity: 'major', category: 'correctness', description: 'null check missing', suggestion: 'add null check' }], affectedSymbols: ['foo'], qualityVerdict: 'Not Bad' },
        timestamp: 1,
      },
    ]);

    // Set risk hypotheses
    const hypotheses: RiskHypothesis[] = [
      { question: 'Does API change break consumers?', affectedFiles: ['src/api.ts'], evidenceNeeded: 'check callers', severityEstimate: 'high', source: 'heuristic' },
    ];
    store.setRiskHypotheses(hypotheses);

    // Set dependency graph
    const graph: DependencyGraphData = {
      fileDependencies: new Map([
        ['src/a.ts', { imports: ['src/b.ts'], importedBy: [] }],
      ]),
      symbolMap: new Map(),
      criticalPaths: [],
    };
    store.setDependencyGraph(graph);

    const output = store.serializeForAgent('Observer', 10000);

    // Should contain agent findings from Code Reviewer (other agent)
    assert.ok(output.includes('Agent Findings'), 'Should contain Agent Findings section');
    assert.ok(output.includes('Code Reviewer'), 'Should contain Code Reviewer findings');

    // Should contain risk hypotheses (Observer gets priority 2 hypotheses)
    assert.ok(output.includes('Risk Hypotheses'), 'Should contain Risk Hypotheses section');
    assert.ok(output.includes('Does API change break consumers?'), 'Should contain hypothesis question');

    // Should contain dependency graph as 'summary' (file count, symbol count)
    assert.ok(output.includes('Dependency Graph'), 'Should contain Dependency Graph section');
    assert.ok(output.includes('Files: 1'), 'Should contain summary file count');
  });

  test('serializeForAgent with very small tokenBudget (200): highest priority included, lowest truncated/omitted', () => {
    const store = new SharedContextStoreImpl();

    // Add findings (priority 1 — highest)
    store.addAgentFindings('Code Reviewer', [
      {
        agentRole: 'Code Reviewer',
        type: 'issue',
        data: { issues: [{ file: 'src/a.ts', location: '10', severity: 'major', category: 'correctness', description: 'bug found', suggestion: 'fix it' }], affectedSymbols: ['foo'], qualityVerdict: 'Not Bad' },
        timestamp: 1,
      },
    ]);

    // Set hypotheses (priority 2)
    store.setRiskHypotheses([
      { question: 'Risk question?', affectedFiles: ['src/x.ts'], evidenceNeeded: 'evidence', severityEstimate: 'high', source: 'heuristic' },
    ]);

    // Set graph (priority 3)
    store.setDependencyGraph({
      fileDependencies: new Map([['src/a.ts', { imports: ['src/b.ts'], importedBy: [] }]]),
      symbolMap: new Map(),
      criticalPaths: [],
    });

    // Set a tool result (priority 4 — lowest)
    store.setToolResult('read_file', { path: 'src/a.ts' }, { description: 'file content here' });

    // Very small budget — should include highest priority, truncate/omit lowest
    const output = store.serializeForAgent('Observer', 200);

    // Priority 1 (Agent Findings) should be present
    assert.ok(output.includes('Agent Findings'), 'Highest priority section should be included');

    // The output should be constrained — not everything fits
    // Priority 4 (Cached Tool Results) should likely be omitted or truncated
    const totalLength = output.length;
    assert.ok(totalLength > 0, 'Output should not be empty');
    // With 200 token budget (~800 chars), not all sections can fit
    assert.ok(totalLength <= 1200, 'Output should be constrained by budget');
  });

  test('serializeForAgent with empty store: returns empty string', () => {
    const store = new SharedContextStoreImpl();
    const output = store.serializeForAgent('Code Reviewer', 10000);
    assert.strictEqual(output, '');
  });

  // ── getStats ──

  test('getStats: toolCacheHits and toolCacheMisses counts accurate after multiple operations', () => {
    const store = new SharedContextStoreImpl();
    const result: ToolExecuteResponse = { description: 'data' };

    // 2 misses
    store.getToolResult('read_file', { path: 'a.ts' });
    store.getToolResult('read_file', { path: 'b.ts' });

    // Set 2 entries
    store.setToolResult('read_file', { path: 'a.ts' }, result);
    store.setToolResult('read_file', { path: 'b.ts' }, result);

    // 3 hits
    store.getToolResult('read_file', { path: 'a.ts' });
    store.getToolResult('read_file', { path: 'b.ts' });
    store.getToolResult('read_file', { path: 'a.ts' });

    // 1 more miss
    store.getToolResult('search_code', { query: 'foo' });

    const stats = store.getStats();
    assert.strictEqual(stats.toolCacheMisses, 3);
    assert.strictEqual(stats.toolCacheHits, 3);

    // Also verify totalFindings
    store.addAgentFindings('Code Reviewer', [
      { agentRole: 'Code Reviewer', type: 'issue', data: {}, timestamp: 1 },
      { agentRole: 'Code Reviewer', type: 'issue', data: {}, timestamp: 2 },
    ]);
    assert.strictEqual(store.getStats().totalFindings, 2);
  });
});
