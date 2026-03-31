import * as assert from 'assert';
import { functionCallExecute } from '../llm-tools/utils';
import { FunctionCall, ToolCallResult, ToolExecuteResponse, ToolOptional } from '../llm-tools/toolInterface';
import { SharedContextStoreImpl } from '../services/llm/orchestrator/SharedContextStore';
import { GenerateOptions, GenerateResponse, ILLMAdapter, LLMAdapterConfig } from '../llm-adapter';

// ── Helpers ──

class FakeAdapter implements ILLMAdapter {
  async initialize(_config: LLMAdapterConfig): Promise<void> {}
  async generateText(_prompt: string, _options?: GenerateOptions): Promise<GenerateResponse> {
    return { text: '', model: 'fake' };
  }
  isReady(): boolean { return true; }
  getModel(): string { return 'fake'; }
  getProvider(): string { return 'fake'; }
  getContextWindow(): number { return 128000; }
  getMaxOutputTokens(): number { return 4096; }
  async testConnection(): Promise<boolean> { return true; }
}

function makeFunctionCall(
  id: string,
  executeFn: (args: any, optional?: ToolOptional) => Promise<ToolExecuteResponse>,
): FunctionCall {
  return {
    id,
    functionCalling: {
      type: 'function',
      function: {
        name: id,
        description: '',
        parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      },
    },
    execute: executeFn,
  };
}

function makeToolCall(name: string, args: Record<string, unknown> = {}): ToolCallResult {
  return {
    id: `call_${name}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  };
}

suite('functionCallExecute caching', () => {

  const fakeAdapter = new FakeAdapter();

  // ── Test without sharedStore: behavior identical to current ──

  test('without sharedStore: all tools execute normally', async () => {
    let executeCalled = false;
    const result: ToolExecuteResponse = { description: 'file content' };

    const fnCall = makeFunctionCall('read_file', async () => {
      executeCalled = true;
      return result;
    });

    const results = await functionCallExecute({
      functionCalls: [fnCall],
      llmAdapter: fakeAdapter,
      toolCalls: [makeToolCall('read_file', { path: 'foo.ts' })],
      // no sharedStore
    });

    assert.strictEqual(executeCalled, true, 'Tool should have been executed');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].result, result);
  });

  // ── Test with sharedStore, cache miss: tool executes, result cached ──

  test('with sharedStore, cache miss: tool executes and result is cached via setToolResult()', async () => {
    const store = new SharedContextStoreImpl();
    let executeCalled = false;
    const result: ToolExecuteResponse = { description: 'found references' };

    const fnCall = makeFunctionCall('find_references', async () => {
      executeCalled = true;
      return result;
    });

    const args = { symbol: 'MyClass' };
    const results = await functionCallExecute({
      functionCalls: [fnCall],
      llmAdapter: fakeAdapter,
      toolCalls: [makeToolCall('find_references', args)],
      sharedStore: store,
    });

    assert.strictEqual(executeCalled, true, 'Tool should execute on cache miss');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].result, result);

    // Verify result was cached in the store
    const cached = store.getToolResult('find_references', args);
    assert.strictEqual(cached, result, 'Result should be cached in store');
  });

  // ── Test with sharedStore, cache hit: tool does NOT execute ──

  test('with sharedStore, cache hit: tool does NOT execute, cached result returned', async () => {
    const store = new SharedContextStoreImpl();
    let executeCount = 0;
    const cachedResult: ToolExecuteResponse = { description: 'cached data' };

    // Pre-populate cache
    store.setToolResult('read_file', { path: 'bar.ts' }, cachedResult);

    const fnCall = makeFunctionCall('read_file', async () => {
      executeCount++;
      return { description: 'fresh data' };
    });

    const results = await functionCallExecute({
      functionCalls: [fnCall],
      llmAdapter: fakeAdapter,
      toolCalls: [makeToolCall('read_file', { path: 'bar.ts' })],
      sharedStore: store,
    });

    assert.strictEqual(executeCount, 0, 'Tool should NOT execute on cache hit');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].result, cachedResult, 'Should return cached result');
  });

  // ── Test with sharedStore, tool returns error: error NOT cached ──

  test('with sharedStore, tool returns error: error result NOT cached', async () => {
    const store = new SharedContextStoreImpl();
    const errorResult: ToolExecuteResponse = { description: 'failed', error: 'File not found' };

    const fnCall = makeFunctionCall('read_file', async () => {
      return errorResult;
    });

    const args = { path: 'missing.ts' };
    await functionCallExecute({
      functionCalls: [fnCall],
      llmAdapter: fakeAdapter,
      toolCalls: [makeToolCall('read_file', args)],
      sharedStore: store,
    });

    // Verify error result was NOT cached
    const cached = store.getToolResult('read_file', args);
    assert.strictEqual(cached, undefined, 'Error results should NOT be cached');
  });

  // ── Test query_context tool NOT cached ──

  test('query_context calls always execute, never check cache, never cache result', async () => {
    const store = new SharedContextStoreImpl();
    let executeCount = 0;
    const result: ToolExecuteResponse = { description: 'context data' };

    // Pre-populate cache for query_context (should be ignored)
    store.setToolResult('query_context', { query_type: 'imports_of', target: 'X' }, { description: 'stale' });

    const fnCall = makeFunctionCall('query_context', async () => {
      executeCount++;
      return result;
    });

    const args = { query_type: 'imports_of', target: 'X' };

    // Call twice
    await functionCallExecute({
      functionCalls: [fnCall],
      llmAdapter: fakeAdapter,
      toolCalls: [makeToolCall('query_context', args)],
      sharedStore: store,
    });
    await functionCallExecute({
      functionCalls: [fnCall],
      llmAdapter: fakeAdapter,
      toolCalls: [makeToolCall('query_context', args)],
      sharedStore: store,
    });

    assert.strictEqual(executeCount, 2, 'query_context should always execute (never use cache)');
  });

  // ── Test queryContextCallCount passed through ──

  test('queryContextCallCount is passed through to tool execute function', async () => {
    let receivedOptional: ToolOptional | undefined;
    const callCount = { value: 3 };

    const fnCall = makeFunctionCall('read_file', async (_args, optional) => {
      receivedOptional = optional;
      return { description: 'ok' };
    });

    await functionCallExecute({
      functionCalls: [fnCall],
      llmAdapter: fakeAdapter,
      toolCalls: [makeToolCall('read_file', { path: 'test.ts' })],
      queryContextCallCount: callCount,
    });

    assert.ok(receivedOptional, 'optional should be passed to execute');
    assert.strictEqual(receivedOptional!.queryContextCallCount, callCount);
    assert.strictEqual(receivedOptional!.queryContextCallCount!.value, 3);
  });

  // ── Test sharedStore passed through ──

  test('sharedStore is passed through to tool execute function via optional', async () => {
    const store = new SharedContextStoreImpl();
    let receivedOptional: ToolOptional | undefined;

    const fnCall = makeFunctionCall('search_code', async (_args, optional) => {
      receivedOptional = optional;
      return { description: 'results' };
    });

    await functionCallExecute({
      functionCalls: [fnCall],
      llmAdapter: fakeAdapter,
      toolCalls: [makeToolCall('search_code', { query: 'foo' })],
      sharedStore: store,
    });

    assert.ok(receivedOptional, 'optional should be passed to execute');
    assert.strictEqual(receivedOptional!.sharedStore, store, 'sharedStore should be the same instance');
  });
});
