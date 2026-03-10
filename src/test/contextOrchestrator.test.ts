import * as assert from 'assert';
import {
  ContextOrchestratorService,
  GenerationCancelledError,
} from '../services/llm/ContextOrchestratorService';
import { UnifiedDiffFile } from '../services/llm/contextTypes';
import { GenerateOptions, GenerateResponse, ILLMAdapter, LLMAdapterConfig } from '../llm-adapter';

class FakeAdapter implements ILLMAdapter {
  public workerCalls = 0;
  public reducerCalls = 0;
  public finalCalls = 0;
  private config: LLMAdapterConfig | null = null;

  constructor(private readonly delayMs: number = 0) {}

  async initialize(config: LLMAdapterConfig): Promise<void> {
    this.config = config;
  }

  async generateText(prompt: string, options?: GenerateOptions): Promise<GenerateResponse> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    const systemMessage = options?.systemMessage || '';

    if (systemMessage.includes('summarize git diff chunks')) {
      this.workerCalls += 1;
      return {
        text: JSON.stringify({
          files: ['src/example.ts'],
          intent: [
            'Expand feature coverage with a deliberately long summary item for reduction testing that repeats important intent details across multiple modules and boundary conditions.',
            'Add another long intent item to increase prompt size during coordination while still being realistic enough for summarization and coordination layers.',
            'Document integration-facing behavior changes with a third summary line so the coordinator payload becomes large enough to force reduction.',
          ],
          risks: [
            'Potential regression around edge cases in merged paths, fallback handling, and pagination boundaries after refactoring shared control flow.',
            'Risk of missing review coverage in call sites that now depend on summarized behavior instead of raw diff traversal.',
          ],
          breakingChanges: [],
          testImpact: [
            'Update integration tests for new merged behavior, regression scenarios, and service-level orchestration cancellation cases.',
            'Revisit snapshot expectations for coordinator-driven summaries and large diff chunk boundaries.',
          ],
          notableSymbols: [
            'ExampleService',
            'buildContextSummary',
            'ChunkReducer',
            'ReviewCoordinator',
            'CommitCoordinator',
          ],
        }),
        model: this.getModel(),
      };
    }

    if (systemMessage.includes('combine multiple git diff summaries')) {
      this.reducerCalls += 1;
      return {
        text: JSON.stringify({
          files: ['src/example.ts'],
          intent: ['Condensed change summary'],
          risks: ['Condensed risk'],
          breakingChanges: [],
          testImpact: ['Condensed test impact'],
          notableSymbols: ['ExampleService'],
        }),
        model: this.getModel(),
      };
    }

    this.finalCalls += 1;
    return {
      text: prompt.includes('Hierarchical Chunk Summaries')
        ? 'final-from-hierarchical'
        : 'final-from-direct',
      model: this.getModel(),
    };
  }

  isReady(): boolean {
    return true;
  }

  getModel(): string {
    return this.config?.model || 'unit-test-model';
  }

  getProvider(): string {
    return 'openai';
  }

  getContextWindow(): number {
    return this.config?.contextWindow || 128000;
  }

  getMaxOutputTokens(): number {
    return this.config?.maxOutputTokens || 16384;
  }

  async testConnection(): Promise<boolean> {
    return true;
  }
}

function createDiffFile(relativePath: string, diff: string): UnifiedDiffFile {
  return {
    filePath: `/workspace/${relativePath}`,
    relativePath,
    diff,
    status: 0,
    statusLabel: 'Modified',
    isDeleted: false,
    isBinary: false,
  };
}

suite('ContextOrchestratorService', () => {
  test('buildChunks splits oversized diffs into smaller segments', () => {
    const orchestrator = new ContextOrchestratorService({
      defaultContextWindow: 1200,
    });
    const hugeDiff = [
      'diff --git a/src/large.ts b/src/large.ts',
      '--- a/src/large.ts',
      '+++ b/src/large.ts',
      '@@ -1,3 +1,200 @@',
      ...Array.from({ length: 160 }, (_, index) => `+const value${index} = ${index};`),
      '@@ -220,3 +380,120 @@',
      ...Array.from({ length: 120 }, (_, index) => `-oldValue${index}();`),
    ].join('\n');

    const chunks = orchestrator.buildChunks(
      [
        createDiffFile('src/small.ts', '@@ -1 +1 @@\n-console.log("old")\n+console.log("new")'),
        createDiffFile('src/large.ts', hugeDiff),
      ],
      120
    );

    assert.ok(chunks.length > 1);
    assert.ok(
      chunks.some((chunk) =>
        chunk.files.some((entry) => Boolean(entry.segmentLabel))
      )
    );
  });

  test('resolveStrategy keeps auto direct for small prompts and hierarchical for large prompts', () => {
    const orchestrator = new ContextOrchestratorService({
      defaultContextWindow: 1200,
      directBudgetRatio: 0.3,
    });

    const directStrategy = orchestrator.resolveStrategy(
      'auto',
      1200,
      'unit-test-model',
      'system prompt',
      'small prompt'
    );
    const hierarchicalStrategy = orchestrator.resolveStrategy(
      'auto',
      1200,
      'unit-test-model',
      'system prompt',
      'x'.repeat(24000)
    );

    assert.strictEqual(directStrategy, 'direct');
    assert.strictEqual(hierarchicalStrategy, 'hierarchical');
    assert.strictEqual(
      orchestrator.resolveStrategy('hierarchical', 1200, 'unit-test-model', 'system prompt', 'small prompt'),
      'hierarchical'
    );
  });

  test('generate performs hierarchical reduction before final coordination when summaries are too large', async () => {
    const orchestrator = new ContextOrchestratorService({
      defaultContextWindow: 1600,
      workerBudgetRatio: 0.18,
      reducerBudgetRatio: 0.18,
      finalBudgetRatio: 0.12,
      changedFilesBudgetRatio: 0.08,
      workerOverheadTokens: 120,
      reducerOverheadTokens: 120,
    });
    const adapter = new FakeAdapter();
    await adapter.initialize({ apiKey: 'test', model: 'unit-test-model' });

    const changes = Array.from({ length: 40 }, (_, index) =>
      createDiffFile(
        `src/file-${index}.ts`,
        [
          '@@ -1,3 +1,120 @@',
          ...Array.from(
            { length: 120 },
            (_, lineIndex) => `+console.log("new-${index}-${lineIndex}")`
          ),
        ].join('\n')
      )
    );

    const result = await orchestrator.generate({
      adapter,
      strategy: 'hierarchical',
      changes,
      task: {
        kind: 'mergeReview',
        label: 'merge request review',
        systemMessage: 'Review system prompt',
        directPrompt: 'Large direct prompt',
        buildCoordinatorPrompt: ({ changedFilesSummary, analysesSummary }) => `## Changed Files\n${changedFilesSummary}\n\n## Hierarchical Chunk Summaries\n${analysesSummary}`,
      },
    });

    assert.strictEqual(result, 'final-from-hierarchical');
    assert.ok(adapter.workerCalls > 1);
    assert.ok(adapter.reducerCalls > 0);
    assert.strictEqual(adapter.finalCalls, 1);
  });

  test('generate stops after cancellation and surfaces GenerationCancelledError', async () => {
    const orchestrator = new ContextOrchestratorService({
      defaultContextWindow: 1200,
      workerBudgetRatio: 0.18,
      workerOverheadTokens: 120,
    });
    const adapter = new FakeAdapter(40);
    await adapter.initialize({ apiKey: 'test', model: 'unit-test-model' });
    const abortController = new AbortController();

    const generation = orchestrator.generate({
      adapter,
      strategy: 'hierarchical',
      changes: [
        createDiffFile('src/a.ts', '@@ -1 +1 @@\n-a\n+b'),
        createDiffFile('src/b.ts', '@@ -1 +1 @@\n-c\n+d'),
      ],
      signal: abortController.signal,
      task: {
        kind: 'stagedReview',
        label: 'staged review',
        systemMessage: 'Review system prompt',
        directPrompt: 'Large direct prompt',
        buildCoordinatorPrompt: ({ analysesSummary }) => analysesSummary,
      },
    });

    setTimeout(() => abortController.abort(), 10);

    await assert.rejects(
      generation,
      (error: unknown) => error instanceof GenerationCancelledError
    );
  });
});
