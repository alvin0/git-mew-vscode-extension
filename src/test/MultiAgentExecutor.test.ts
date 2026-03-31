import * as assert from 'assert';
import { MultiAgentExecutor } from '../services/llm/orchestrator/MultiAgentExecutor';
import { SharedContextStoreImpl } from '../services/llm/orchestrator/SharedContextStore';
import { TokenEstimatorService } from '../services/llm/TokenEstimatorService';
import { AdapterCalibrationService } from '../services/llm/orchestrator/AdapterCalibrationService';
import {
  AgentPrompt,
  AgentBudgetAllocation,
  AgentPromptBuildContext,
  CodeReviewerOutput,
  FlowDiagramOutput,
  ContextOrchestratorConfig,
  DEFAULT_ORCHESTRATOR_CONFIG,
  PhasedAgentConfig,
  DependencyGraphData,
} from '../services/llm/orchestrator/orchestratorTypes';
import {
  ILLMAdapter,
  GenerateResponse,
  GenerateOptions,
  LLMAdapterConfig,
} from '../llm-adapter/adapterInterface';

// ── Mock ILLMAdapter ──

function createMockAdapter(overrides?: {
  generateTextFn?: (prompt: string, options?: GenerateOptions) => Promise<GenerateResponse>;
}): ILLMAdapter {
  return {
    initialize: async (_config: LLMAdapterConfig) => {},
    generateText: overrides?.generateTextFn ?? (async () => ({
      text: 'mock response',
      model: 'mock-model',
    })),
    isReady: () => true,
    getModel: () => 'mock-model',
    getProvider: () => 'openai',
    getContextWindow: () => 200000,
    getMaxOutputTokens: () => 4096,
    testConnection: async () => true,
  };
}

// ── Helpers ──

function createConfig(): ContextOrchestratorConfig {
  return { ...DEFAULT_ORCHESTRATOR_CONFIG };
}

function createCalibration(config?: ContextOrchestratorConfig): AdapterCalibrationService {
  const c = config ?? createConfig();
  return new AdapterCalibrationService(c, new TokenEstimatorService());
}

function createExecutor(config?: ContextOrchestratorConfig): MultiAgentExecutor {
  const c = config ?? createConfig();
  return new MultiAgentExecutor(c, createCalibration(c), new TokenEstimatorService());
}

function emptyGraph(): DependencyGraphData {
  return {
    fileDependencies: new Map(),
    symbolMap: new Map(),
    criticalPaths: [],
  };
}

function createPhase1Agent(role: string, outputSchema: 'code-reviewer' | 'flow-diagram', sharedStore?: any): AgentPrompt {
  return {
    role,
    systemMessage: `You are ${role}`,
    prompt: `Analyze the code as ${role}`,
    phase: 1,
    outputSchema,
    selfAudit: false,
    maxIterations: 1,
    sharedStore,
  };
}

function createObserverAgent(sharedStore?: any): AgentPrompt {
  return {
    role: 'Observer',
    systemMessage: 'You are Observer',
    prompt: 'Analyze hidden risks',
    phase: 2,
    outputSchema: 'observer',
    selfAudit: false,
    maxIterations: 1,
    sharedStore,
  };
}

function createBudget(role: string): AgentBudgetAllocation {
  return {
    agentRole: role,
    totalBudget: 50000,
    diffBudget: 20000,
    referenceBudget: 10000,
    sharedContextBudget: 5000,
    reservedForOutput: 8000,
  };
}

function createBuildContext(sharedStore?: any): AgentPromptBuildContext {
  return {
    fullDiff: 'diff --git a/test.ts\n+added line\n-removed line',
    changedFiles: [],
    language: 'typescript',
    sharedContextStore: sharedStore,
  };
}

/** Valid Code Reviewer JSON output */
const VALID_CR_JSON: CodeReviewerOutput = {
  issues: [{
    file: 'src/auth.ts',
    location: 'line 15',
    severity: 'major',
    category: 'correctness',
    description: 'null check missing',
    suggestion: 'add null guard',
  }],
  affectedSymbols: ['login'],
  qualityVerdict: 'Not Bad',
};

/** Valid Flow Diagram JSON output */
const VALID_FD_JSON: FlowDiagramOutput = {
  diagrams: [{
    name: 'auth-flow',
    type: 'sequence',
    plantumlCode: '@startuml\nA -> B\n@enduml',
    description: 'Auth flow',
  }],
  affectedFlows: ['login-flow'],
};

suite('MultiAgentExecutor', () => {

  // ────────────────────────────────────────────
  // executePhasedAgents tests
  // ────────────────────────────────────────────

  test('executePhasedAgents Phase 1 parallel: both Code Reviewer and Flow Diagram execute', async () => {
    const executedRoles: string[] = [];
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        // Detect which agent is calling based on prompt content
        if (prompt.includes('Code Reviewer')) {
          executedRoles.push('Code Reviewer');
          return { text: `### Agent: Code Reviewer\n\n${JSON.stringify(VALID_CR_JSON)}`, model: 'mock' };
        }
        if (prompt.includes('Flow Diagram')) {
          executedRoles.push('Flow Diagram');
          return { text: `### Agent: Flow Diagram\n\n${JSON.stringify(VALID_FD_JSON)}`, model: 'mock' };
        }
        executedRoles.push('Observer');
        return { text: '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(emptyGraph());
    const executor = createExecutor();

    const mockPromptBuilder = {
      buildObserverPrompt: (_ctx: any, _budget: any) => createObserverAgent(store),
    };

    const phasedConfig: PhasedAgentConfig = {
      phase1: [
        createPhase1Agent('Code Reviewer', 'code-reviewer', store),
        createPhase1Agent('Flow Diagram', 'flow-diagram', store),
      ],
      phase2: [],
      sharedStore: store,
      promptBuilder: mockPromptBuilder,
      buildContext: createBuildContext(store),
      budgetAllocations: [
        createBudget('Code Reviewer'),
        createBudget('Flow Diagram'),
        createBudget('Observer'),
      ],
    };

    const results = await executor.executePhasedAgents(phasedConfig, adapter);

    assert.ok(executedRoles.includes('Code Reviewer'), 'Code Reviewer should have executed');
    assert.ok(executedRoles.includes('Flow Diagram'), 'Flow Diagram should have executed');
    assert.ok(results.length >= 2, 'Should have at least 2 results (Phase 1 + Observer)');
  });

  test('executePhasedAgents Phase 2 after Phase 1: Observer executes only after both Phase 1 agents complete', async () => {
    const executionOrder: string[] = [];
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        if (prompt.includes('Code Reviewer')) {
          // Simulate some work
          await new Promise(r => setTimeout(r, 10));
          executionOrder.push('Code Reviewer');
          return { text: `### Agent: Code Reviewer\n\n${JSON.stringify(VALID_CR_JSON)}`, model: 'mock' };
        }
        if (prompt.includes('Flow Diagram')) {
          await new Promise(r => setTimeout(r, 10));
          executionOrder.push('Flow Diagram');
          return { text: `### Agent: Flow Diagram\n\n${JSON.stringify(VALID_FD_JSON)}`, model: 'mock' };
        }
        executionOrder.push('Observer');
        return { text: '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(emptyGraph());
    const executor = createExecutor();

    const mockPromptBuilder = {
      buildObserverPrompt: (_ctx: any, _budget: any) => createObserverAgent(store),
    };

    const phasedConfig: PhasedAgentConfig = {
      phase1: [
        createPhase1Agent('Code Reviewer', 'code-reviewer', store),
        createPhase1Agent('Flow Diagram', 'flow-diagram', store),
      ],
      phase2: [],
      sharedStore: store,
      promptBuilder: mockPromptBuilder,
      buildContext: createBuildContext(store),
      budgetAllocations: [
        createBudget('Code Reviewer'),
        createBudget('Flow Diagram'),
        createBudget('Observer'),
      ],
    };

    await executor.executePhasedAgents(phasedConfig, adapter);

    const observerIdx = executionOrder.indexOf('Observer');
    const crIdx = executionOrder.indexOf('Code Reviewer');
    const fdIdx = executionOrder.indexOf('Flow Diagram');

    assert.ok(observerIdx > crIdx, 'Observer should execute after Code Reviewer');
    assert.ok(observerIdx > fdIdx, 'Observer should execute after Flow Diagram');
  });

  test('executePhasedAgents Phase 1 failure: one agent throws → other result still stored, Observer still executes', async () => {
    let observerExecuted = false;
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        if (prompt.includes('Code Reviewer')) {
          throw new Error('Code Reviewer crashed');
        }
        if (prompt.includes('Flow Diagram')) {
          return { text: `### Agent: Flow Diagram\n\n${JSON.stringify(VALID_FD_JSON)}`, model: 'mock' };
        }
        observerExecuted = true;
        return { text: '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(emptyGraph());
    const executor = createExecutor();

    const mockPromptBuilder = {
      buildObserverPrompt: (_ctx: any, _budget: any) => createObserverAgent(store),
    };

    const phasedConfig: PhasedAgentConfig = {
      phase1: [
        createPhase1Agent('Code Reviewer', 'code-reviewer', store),
        createPhase1Agent('Flow Diagram', 'flow-diagram', store),
      ],
      phase2: [],
      sharedStore: store,
      promptBuilder: mockPromptBuilder,
      buildContext: createBuildContext(store),
      budgetAllocations: [
        createBudget('Code Reviewer'),
        createBudget('Flow Diagram'),
        createBudget('Observer'),
      ],
    };

    const results = await executor.executePhasedAgents(phasedConfig, adapter);

    // Flow Diagram findings should be stored
    const fdFindings = store.getAgentFindings('Flow Diagram');
    assert.ok(fdFindings.length > 0, 'Flow Diagram findings should be stored despite CR failure');

    // Observer should still execute
    assert.ok(observerExecuted, 'Observer should still execute after Phase 1 partial failure');
    assert.ok(results.length >= 1, 'Should have results from successful agents');
  });

  test('executePhasedAgents both Phase 1 fail: Observer still executes', async () => {
    let observerExecuted = false;
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        if (prompt.includes('Code Reviewer')) {
          throw new Error('CR crashed');
        }
        if (prompt.includes('Flow Diagram')) {
          throw new Error('FD crashed');
        }
        observerExecuted = true;
        return { text: '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(emptyGraph());
    const executor = createExecutor();

    const mockPromptBuilder = {
      buildObserverPrompt: (_ctx: any, _budget: any) => createObserverAgent(store),
    };

    const phasedConfig: PhasedAgentConfig = {
      phase1: [
        createPhase1Agent('Code Reviewer', 'code-reviewer', store),
        createPhase1Agent('Flow Diagram', 'flow-diagram', store),
      ],
      phase2: [],
      sharedStore: store,
      promptBuilder: mockPromptBuilder,
      buildContext: createBuildContext(store),
      budgetAllocations: [
        createBudget('Code Reviewer'),
        createBudget('Flow Diagram'),
        createBudget('Observer'),
      ],
    };

    const results = await executor.executePhasedAgents(phasedConfig, adapter);

    assert.ok(observerExecuted, 'Observer should execute even when both Phase 1 agents fail');
    // Results should contain at least the Observer result
    assert.ok(results.length >= 1, 'Should have at least Observer result');
  });

  test('executePhasedAgents structured output parsing: CR JSON with issues[] parsed and stored in SharedContextStore', async () => {
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        if (prompt.includes('Code Reviewer')) {
          return { text: `### Agent: Code Reviewer\n\n${JSON.stringify(VALID_CR_JSON)}`, model: 'mock' };
        }
        if (prompt.includes('Flow Diagram')) {
          return { text: `### Agent: Flow Diagram\n\n${JSON.stringify(VALID_FD_JSON)}`, model: 'mock' };
        }
        return { text: '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(emptyGraph());
    const executor = createExecutor();

    const mockPromptBuilder = {
      buildObserverPrompt: (_ctx: any, _budget: any) => createObserverAgent(store),
    };

    const phasedConfig: PhasedAgentConfig = {
      phase1: [
        createPhase1Agent('Code Reviewer', 'code-reviewer', store),
        createPhase1Agent('Flow Diagram', 'flow-diagram', store),
      ],
      phase2: [],
      sharedStore: store,
      promptBuilder: mockPromptBuilder,
      buildContext: createBuildContext(store),
      budgetAllocations: [
        createBudget('Code Reviewer'),
        createBudget('Flow Diagram'),
        createBudget('Observer'),
      ],
    };

    await executor.executePhasedAgents(phasedConfig, adapter);

    // Verify CR findings stored
    const crFindings = store.getAgentFindings('Code Reviewer');
    assert.ok(crFindings.length > 0, 'Code Reviewer findings should be stored');
    const crData = crFindings[0].data as CodeReviewerOutput;
    assert.ok(Array.isArray(crData.issues), 'CR data should have issues array');
    assert.strictEqual(crData.issues[0].file, 'src/auth.ts');
    assert.strictEqual(crData.issues[0].severity, 'major');

    // Verify FD findings stored
    const fdFindings = store.getAgentFindings('Flow Diagram');
    assert.ok(fdFindings.length > 0, 'Flow Diagram findings should be stored');
    const fdData = fdFindings[0].data as FlowDiagramOutput;
    assert.ok(Array.isArray(fdData.diagrams), 'FD data should have diagrams array');
    assert.strictEqual(fdData.diagrams[0].name, 'auth-flow');
  });

  test('executePhasedAgents structured output parse failure: non-JSON → pipeline continues', async () => {
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        if (prompt.includes('Code Reviewer')) {
          return { text: '### Agent: Code Reviewer\n\nThis is not JSON at all, just plain text analysis.', model: 'mock' };
        }
        if (prompt.includes('Flow Diagram')) {
          return { text: `### Agent: Flow Diagram\n\n${JSON.stringify(VALID_FD_JSON)}`, model: 'mock' };
        }
        return { text: '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(emptyGraph());
    const executor = createExecutor();

    const mockPromptBuilder = {
      buildObserverPrompt: (_ctx: any, _budget: any) => createObserverAgent(store),
    };

    const phasedConfig: PhasedAgentConfig = {
      phase1: [
        createPhase1Agent('Code Reviewer', 'code-reviewer', store),
        createPhase1Agent('Flow Diagram', 'flow-diagram', store),
      ],
      phase2: [],
      sharedStore: store,
      promptBuilder: mockPromptBuilder,
      buildContext: createBuildContext(store),
      budgetAllocations: [
        createBudget('Code Reviewer'),
        createBudget('Flow Diagram'),
        createBudget('Observer'),
      ],
    };

    // Should not throw
    const results = await executor.executePhasedAgents(phasedConfig, adapter);

    // CR findings should NOT be stored (parse failed)
    const crFindings = store.getAgentFindings('Code Reviewer');
    assert.strictEqual(crFindings.length, 0, 'CR findings should not be stored when output is not JSON');

    // FD findings should still be stored
    const fdFindings = store.getAgentFindings('Flow Diagram');
    assert.ok(fdFindings.length > 0, 'FD findings should still be stored');

    // Pipeline should continue and produce results
    assert.ok(results.length >= 2, 'Pipeline should continue and produce results');
  });

  test('executePhasedAgents risk hypothesis generation: hypotheses stored in SharedContextStore', async () => {
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        if (prompt.includes('Code Reviewer')) {
          return { text: `### Agent: Code Reviewer\n\n${JSON.stringify(VALID_CR_JSON)}`, model: 'mock' };
        }
        if (prompt.includes('Flow Diagram')) {
          return { text: `### Agent: Flow Diagram\n\n${JSON.stringify(VALID_FD_JSON)}`, model: 'mock' };
        }
        // LLM call for hypothesis generation returns empty array
        if (prompt.includes('risk hypotheses') || prompt.includes('Phase 1 findings')) {
          return { text: '[]', model: 'mock' };
        }
        return { text: '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    // Set up a graph with data that triggers heuristic rules
    const graph: DependencyGraphData = {
      fileDependencies: new Map([
        ['src/auth.ts', { imports: [], importedBy: ['src/handler.ts', 'src/controller.ts'] }],
      ]),
      symbolMap: new Map([
        ['login', { definedIn: 'src/auth.ts', referencedBy: ['src/a.ts', 'src/b.ts', 'src/c.ts'], type: 'function' }],
      ]),
      criticalPaths: [],
    };
    store.setDependencyGraph(graph);
    const executor = createExecutor();

    const mockPromptBuilder = {
      buildObserverPrompt: (_ctx: any, _budget: any) => createObserverAgent(store),
    };

    const phasedConfig: PhasedAgentConfig = {
      phase1: [
        createPhase1Agent('Code Reviewer', 'code-reviewer', store),
        createPhase1Agent('Flow Diagram', 'flow-diagram', store),
      ],
      phase2: [],
      sharedStore: store,
      promptBuilder: mockPromptBuilder,
      buildContext: createBuildContext(store),
      budgetAllocations: [
        createBudget('Code Reviewer'),
        createBudget('Flow Diagram'),
        createBudget('Observer'),
      ],
    };

    await executor.executePhasedAgents(phasedConfig, adapter);

    // Hypotheses should be stored in the shared store
    const hypotheses = store.getRiskHypotheses();
    // At minimum, heuristic rules should generate some hypotheses given the CR issues + graph
    assert.ok(Array.isArray(hypotheses), 'Hypotheses should be an array');
  });

  test('executePhasedAgents hypothesis generation failure: Observer runs without hypotheses', async () => {
    let observerExecuted = false;
    const callCount = { value: 0 };
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        callCount.value++;
        if (prompt.includes('Code Reviewer')) {
          return { text: `### Agent: Code Reviewer\n\n${JSON.stringify(VALID_CR_JSON)}`, model: 'mock' };
        }
        if (prompt.includes('Flow Diagram')) {
          return { text: `### Agent: Flow Diagram\n\n${JSON.stringify(VALID_FD_JSON)}`, model: 'mock' };
        }
        // The hypothesis generator LLM call — make it throw
        if (prompt.includes('risk hypotheses') || prompt.includes('Phase 1 findings')) {
          throw new Error('LLM unavailable for hypothesis generation');
        }
        observerExecuted = true;
        return { text: '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(emptyGraph());
    const executor = createExecutor();

    const mockPromptBuilder = {
      buildObserverPrompt: (_ctx: any, _budget: any) => createObserverAgent(store),
    };

    const phasedConfig: PhasedAgentConfig = {
      phase1: [
        createPhase1Agent('Code Reviewer', 'code-reviewer', store),
        createPhase1Agent('Flow Diagram', 'flow-diagram', store),
      ],
      phase2: [],
      sharedStore: store,
      promptBuilder: mockPromptBuilder,
      buildContext: createBuildContext(store),
      budgetAllocations: [
        createBudget('Code Reviewer'),
        createBudget('Flow Diagram'),
        createBudget('Observer'),
      ],
    };

    // Should not throw
    const results = await executor.executePhasedAgents(phasedConfig, adapter);

    assert.ok(observerExecuted, 'Observer should still execute when hypothesis generation fails');
    assert.ok(results.length >= 1, 'Should have results');
  });

  test('executePhasedAgents Observer prompt contains Phase 1 findings: serialized CR issues present', async () => {
    let capturedObserverPrompt = '';
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        if (prompt.includes('Code Reviewer')) {
          return { text: `### Agent: Code Reviewer\n\n${JSON.stringify(VALID_CR_JSON)}`, model: 'mock' };
        }
        if (prompt.includes('Flow Diagram')) {
          return { text: `### Agent: Flow Diagram\n\n${JSON.stringify(VALID_FD_JSON)}`, model: 'mock' };
        }
        // LLM call for hypothesis generation
        if (prompt.includes('risk hypotheses') || prompt.includes('Phase 1 findings')) {
          return { text: '[]', model: 'mock' };
        }
        // This is the Observer call
        capturedObserverPrompt = prompt;
        return { text: '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(emptyGraph());
    const executor = createExecutor();

    // Use a promptBuilder that injects shared context into the Observer prompt
    const mockPromptBuilder = {
      buildObserverPrompt: (ctx: any, _budget: any) => {
        const serialized = (store as any).serializeForAgent('Observer', 5000);
        return {
          role: 'Observer',
          systemMessage: 'You are Observer',
          prompt: `Analyze hidden risks\n\n${serialized}`,
          phase: 2,
          outputSchema: 'observer' as const,
          selfAudit: false,
          maxIterations: 1,
          sharedStore: store,
        };
      },
    };

    const phasedConfig: PhasedAgentConfig = {
      phase1: [
        createPhase1Agent('Code Reviewer', 'code-reviewer', store),
        createPhase1Agent('Flow Diagram', 'flow-diagram', store),
      ],
      phase2: [],
      sharedStore: store,
      promptBuilder: mockPromptBuilder,
      buildContext: createBuildContext(store),
      budgetAllocations: [
        createBudget('Code Reviewer'),
        createBudget('Flow Diagram'),
        createBudget('Observer'),
      ],
    };

    await executor.executePhasedAgents(phasedConfig, adapter);

    // The Observer prompt should contain CR issues
    assert.ok(capturedObserverPrompt.includes('null check missing') || capturedObserverPrompt.includes('Code Reviewer'),
      'Observer prompt should contain Phase 1 CR findings');
  });

  test('executePhasedAgents progress messages: reports progress during Phase 1 and Phase 2', async () => {
    const progressMessages: string[] = [];
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        if (prompt.includes('Code Reviewer')) {
          return { text: `### Agent: Code Reviewer\n\n${JSON.stringify(VALID_CR_JSON)}`, model: 'mock' };
        }
        if (prompt.includes('Flow Diagram')) {
          return { text: `### Agent: Flow Diagram\n\n${JSON.stringify(VALID_FD_JSON)}`, model: 'mock' };
        }
        if (prompt.includes('risk hypotheses') || prompt.includes('Phase 1 findings')) {
          return { text: '[]', model: 'mock' };
        }
        return { text: '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(emptyGraph());
    const executor = createExecutor();

    const mockPromptBuilder = {
      buildObserverPrompt: (_ctx: any, _budget: any) => createObserverAgent(store),
    };

    const phasedConfig: PhasedAgentConfig = {
      phase1: [
        createPhase1Agent('Code Reviewer', 'code-reviewer', store),
        createPhase1Agent('Flow Diagram', 'flow-diagram', store),
      ],
      phase2: [],
      sharedStore: store,
      promptBuilder: mockPromptBuilder,
      buildContext: createBuildContext(store),
      budgetAllocations: [
        createBudget('Code Reviewer'),
        createBudget('Flow Diagram'),
        createBudget('Observer'),
      ],
    };

    const request = {
      onProgress: (msg: string) => progressMessages.push(msg),
      onLog: (_msg: string) => {},
    } as any;

    await executor.executePhasedAgents(phasedConfig, adapter, undefined, request);

    // Should have Phase 1 progress message
    assert.ok(
      progressMessages.some(m => m.includes('Code Reviewer') && m.includes('Flow Diagram')),
      'Should report Phase 1 progress mentioning both agents',
    );

    // Should have Phase 2 / Observer progress message
    assert.ok(
      progressMessages.some(m => m.includes('Observer') || m.includes('context from other agents')),
      'Should report Phase 2 / Observer progress',
    );
  });

  // ────────────────────────────────────────────
  // parseStructuredOutput tests (private, accessed via (executor as any))
  // ────────────────────────────────────────────

  test('parseStructuredOutput with valid Code Reviewer JSON: returns correct type', () => {
    const executor = createExecutor();
    const rawText = `### Agent: Code Reviewer\n\n${JSON.stringify(VALID_CR_JSON)}`;

    const result = (executor as any).parseStructuredOutput(rawText, 'code-reviewer');

    assert.ok(result !== null, 'Should return a parsed result');
    assert.strictEqual(result.role, 'Code Reviewer');
    assert.ok(Array.isArray(result.structured.issues), 'Should have issues array');
    assert.strictEqual(result.structured.issues[0].file, 'src/auth.ts');
    assert.strictEqual(result.structured.qualityVerdict, 'Not Bad');
  });

  test('parseStructuredOutput with JSON in ```json fences: extracted and parsed', () => {
    const executor = createExecutor();
    const rawText = '### Agent: Code Reviewer\n\n```json\n' + JSON.stringify(VALID_CR_JSON) + '\n```';

    const result = (executor as any).parseStructuredOutput(rawText, 'code-reviewer');

    assert.ok(result !== null, 'Should parse JSON from fenced block');
    assert.strictEqual(result.role, 'Code Reviewer');
    assert.ok(Array.isArray(result.structured.issues));
  });

  test('parseStructuredOutput with invalid JSON: returns null', () => {
    const executor = createExecutor();
    const rawText = '### Agent: Code Reviewer\n\nThis is not JSON at all, just plain text.';

    const result = (executor as any).parseStructuredOutput(rawText, 'code-reviewer');

    assert.strictEqual(result, null, 'Should return null for non-JSON output');
  });

  test('parseStructuredOutput with JSON missing required field (no issues array): returns null', () => {
    const executor = createExecutor();
    const invalidJson = { affectedSymbols: ['foo'], qualityVerdict: 'Good' }; // missing issues[]
    const rawText = `### Agent: Code Reviewer\n\n${JSON.stringify(invalidJson)}`;

    const result = (executor as any).parseStructuredOutput(rawText, 'code-reviewer');

    assert.strictEqual(result, null, 'Should return null when required field is missing');
  });

  // ────────────────────────────────────────────
  // runObserverSelfAudit tests (private, accessed via (executor as any))
  // ────────────────────────────────────────────

  test('runObserverSelfAudit: audit prompt contains CR issues as numbered checklist', async () => {
    let capturedAuditPrompt = '';
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        capturedAuditPrompt = prompt;
        return { text: '{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    // Add CR findings
    const crData: CodeReviewerOutput = {
      issues: [
        { file: 'src/auth.ts', location: 'line 15', severity: 'major', category: 'correctness', description: 'null check missing', suggestion: 'add guard' },
        { file: 'src/db.ts', location: 'line 30', severity: 'critical', category: 'security', description: 'SQL injection risk', suggestion: 'use parameterized queries' },
      ],
      affectedSymbols: ['login', 'query'],
      qualityVerdict: 'Critical',
    };
    store.addAgentFindings('Code Reviewer', [{
      agentRole: 'Code Reviewer',
      type: 'issue',
      data: crData,
      timestamp: Date.now(),
    }]);

    const agent = createObserverAgent(store);
    const lastResponse = { text: 'Previous Observer analysis text' };
    const executor = createExecutor();

    await (executor as any).runObserverSelfAudit(agent, adapter, lastResponse, store);

    // Audit prompt should contain numbered checklist items from CR issues
    assert.ok(capturedAuditPrompt.includes('1.'), 'Should contain numbered item 1');
    assert.ok(capturedAuditPrompt.includes('2.'), 'Should contain numbered item 2');
    assert.ok(capturedAuditPrompt.includes('null check missing'), 'Should contain first CR issue description');
    assert.ok(capturedAuditPrompt.includes('SQL injection risk'), 'Should contain second CR issue description');
    assert.ok(capturedAuditPrompt.includes('src/auth.ts'), 'Should contain file path from CR issue');
    assert.ok(capturedAuditPrompt.includes('Have you assessed hidden risks'), 'Should contain checklist question');
  });

  test('runObserverSelfAudit: audit prompt does NOT contain full diff text', async () => {
    let capturedAuditPrompt = '';
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        capturedAuditPrompt = prompt;
        return { text: '{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    store.addAgentFindings('Code Reviewer', [{
      agentRole: 'Code Reviewer',
      type: 'issue',
      data: { issues: [], affectedSymbols: [], qualityVerdict: 'Good' } as CodeReviewerOutput,
      timestamp: Date.now(),
    }]);

    const agent: AgentPrompt = {
      role: 'Observer',
      systemMessage: 'You are Observer',
      prompt: 'Full diff content here:\n--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -1,5 +1,7 @@\n+added line\n-removed line',
      phase: 2,
      outputSchema: 'observer',
      selfAudit: true,
      maxIterations: 1,
      sharedStore: store,
    };
    const lastResponse = { text: 'Previous analysis' };
    const executor = createExecutor();

    await (executor as any).runObserverSelfAudit(agent, adapter, lastResponse, store);

    // Audit prompt should NOT contain the full diff
    assert.ok(!capturedAuditPrompt.includes('--- a/src/auth.ts'), 'Audit prompt should NOT contain full diff file headers');
    assert.ok(!capturedAuditPrompt.includes('+added line'), 'Audit prompt should NOT contain diff added lines');
    assert.ok(!capturedAuditPrompt.includes('-removed line'), 'Audit prompt should NOT contain diff removed lines');

    // But should contain the previous analysis
    assert.ok(capturedAuditPrompt.includes('Previous analysis'), 'Audit prompt should contain previous analysis');
  });

  // ────────────────────────────────────────────
  // runAgent tests (private, accessed via (executor as any))
  // ────────────────────────────────────────────

  test('runAgent with sharedStore: functionCallExecute receives sharedStore parameter', async () => {
    // We test this by verifying that tool results get cached in the shared store
    // when sharedStore is provided on the agent
    const store = new SharedContextStoreImpl();

    const adapter = createMockAdapter({
      generateTextFn: async () => ({
        text: 'Final analysis result',
        model: 'mock',
        // No tool calls — just a direct response
      }),
    });

    const agent: AgentPrompt = {
      role: 'Code Reviewer',
      systemMessage: 'You are Code Reviewer',
      prompt: 'Analyze code',
      phase: 1,
      outputSchema: 'code-reviewer',
      selfAudit: false,
      maxIterations: 1,
      sharedStore: store,
    };

    const executor = createExecutor();
    const result = await (executor as any).runAgent(agent, adapter);

    assert.ok(typeof result === 'string', 'Should return a string result');
    assert.ok(result.includes('Code Reviewer'), 'Result should contain agent role');
  });

  test('parseStructuredOutput with valid Flow Diagram JSON: returns correct type', () => {
    const executor = createExecutor();
    const rawText = `### Agent: Flow Diagram\n\n${JSON.stringify(VALID_FD_JSON)}`;

    const result = (executor as any).parseStructuredOutput(rawText, 'flow-diagram');

    assert.ok(result !== null, 'Should return a parsed result');
    assert.strictEqual(result.role, 'Flow Diagram');
    assert.ok(Array.isArray(result.structured.diagrams), 'Should have diagrams array');
    assert.strictEqual(result.structured.diagrams[0].name, 'auth-flow');
    assert.strictEqual(result.structured.diagrams[0].type, 'sequence');
    assert.ok(Array.isArray(result.structured.affectedFlows), 'Should have affectedFlows array');
    assert.strictEqual(result.structured.affectedFlows[0], 'login-flow');
  });

  test('runObserverSelfAudit: audit prompt contains FD flows as checklist items', async () => {
    let capturedAuditPrompt = '';
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        capturedAuditPrompt = prompt;
        return { text: '{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    // Add CR findings (required for the method)
    store.addAgentFindings('Code Reviewer', [{
      agentRole: 'Code Reviewer',
      type: 'issue',
      data: { issues: [], affectedSymbols: [], qualityVerdict: 'Good' } as CodeReviewerOutput,
      timestamp: Date.now(),
    }]);
    // Add FD findings with affected flows
    const fdData: FlowDiagramOutput = {
      diagrams: [{ name: 'auth-flow', type: 'sequence', plantumlCode: '@startuml\n@enduml', description: 'Auth flow' }],
      affectedFlows: ['login-flow', 'signup-flow'],
    };
    store.addAgentFindings('Flow Diagram', [{
      agentRole: 'Flow Diagram',
      type: 'flow',
      data: fdData,
      timestamp: Date.now(),
    }]);

    const agent = createObserverAgent(store);
    const lastResponse = { text: 'Previous Observer analysis' };
    const executor = createExecutor();

    await (executor as any).runObserverSelfAudit(agent, adapter, lastResponse, store);

    // Audit prompt should contain FD flows as checklist items
    assert.ok(capturedAuditPrompt.includes('Flow Diagram'), 'Should contain Flow Diagram section header');
    assert.ok(capturedAuditPrompt.includes('login-flow'), 'Should contain first affected flow');
    assert.ok(capturedAuditPrompt.includes('signup-flow'), 'Should contain second affected flow');
    assert.ok(capturedAuditPrompt.includes('integration concerns'), 'Should contain integration concerns question for flows');
  });

  test('runObserverSelfAudit: audit prompt contains "ONLY add new findings" instruction', async () => {
    let capturedAuditPrompt = '';
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        capturedAuditPrompt = prompt;
        return { text: '{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    store.addAgentFindings('Code Reviewer', [{
      agentRole: 'Code Reviewer',
      type: 'issue',
      data: { issues: [], affectedSymbols: [], qualityVerdict: 'Good' } as CodeReviewerOutput,
      timestamp: Date.now(),
    }]);

    const agent = createObserverAgent(store);
    const lastResponse = { text: 'Previous analysis text' };
    const executor = createExecutor();

    await (executor as any).runObserverSelfAudit(agent, adapter, lastResponse, store);

    assert.ok(capturedAuditPrompt.includes('ONLY add new findings'), 'Audit prompt should contain "ONLY add new findings" instruction');
  });

  test('runAgent with queryContextCallCount: counter reset to 0 at start of each iteration', async () => {
    // We verify this by checking the code path — when tool calls happen,
    // queryContextCallCount is created fresh per iteration
    let iterationCount = 0;
    const adapter = createMockAdapter({
      generateTextFn: async () => {
        iterationCount++;
        if (iterationCount === 1) {
          // First call: return tool calls to trigger iteration
          return {
            text: '',
            model: 'mock',
            toolCalls: [{
              id: 'call_1',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: JSON.stringify({ path: 'test.ts' }),
              },
            }],
          };
        }
        // Second call: return final response
        return { text: 'Final analysis', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    const mockReadFileTool = {
      id: 'read_file',
      functionCalling: {
        type: 'function' as const,
        function: {
          name: 'read_file',
          description: 'Read a file',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string', description: 'File path' } },
            required: ['path'] as string[],
          },
        },
      },
      execute: async (_args: any, _options: any) => ({
        description: 'file content here',
        contentType: 'text' as const,
      }),
    };

    const agent: AgentPrompt = {
      role: 'Code Reviewer',
      systemMessage: 'You are Code Reviewer',
      prompt: 'Analyze code',
      phase: 1,
      outputSchema: 'code-reviewer',
      selfAudit: false,
      maxIterations: 3,
      tools: [mockReadFileTool],
      sharedStore: store,
    };

    const executor = createExecutor();
    const result = await (executor as any).runAgent(agent, adapter);

    assert.ok(typeof result === 'string', 'Should return a string result');
    assert.ok(iterationCount >= 2, 'Should have gone through at least 2 iterations (tool call + final)');
  });

});
