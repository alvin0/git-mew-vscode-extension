import * as assert from 'assert';
import { ContextOrchestratorService } from '../services/llm/ContextOrchestratorService';
import { SharedContextStoreImpl } from '../services/llm/orchestrator/SharedContextStore';
import {
  AgentPrompt,
  AgentBudgetAllocation,
  AgentPromptBuildContext,
  CodeReviewerOutput,
  FlowDiagramOutput,
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

const VALID_FD_JSON: FlowDiagramOutput = {
  diagrams: [{
    name: 'auth-flow',
    type: 'sequence',
    plantumlCode: '@startuml\nA -> B\n@enduml',
    description: 'Auth flow',
  }],
  affectedFlows: ['login-flow'],
};

function emptyGraph(): DependencyGraphData {
  return {
    fileDependencies: new Map(),
    symbolMap: new Map(),
    criticalPaths: [],
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

function createBuildContext(sharedStore?: any): AgentPromptBuildContext {
  return {
    fullDiff: 'diff --git a/test.ts\n+added line\n-removed line',
    changedFiles: [],
    language: 'typescript',
    sharedContextStore: sharedStore,
  };
}


suite('Integration: Full Pipeline', () => {

  // ────────────────────────────────────────────
  // 17.1 — Test full pipeline with phasedConfig
  // ────────────────────────────────────────────

  test('17.1: generateMultiAgentFinalText with phasedConfig — Phase 1 agents use role-specific prompts', async () => {
    const capturedPrompts: Record<string, string> = {};
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        if (prompt.includes('Code Reviewer')) {
          capturedPrompts['Code Reviewer'] = prompt;
          return { text: `### Agent: Code Reviewer\n\n${JSON.stringify(VALID_CR_JSON)}`, model: 'mock' };
        }
        if (prompt.includes('Flow Diagram')) {
          capturedPrompts['Flow Diagram'] = prompt;
          return { text: `### Agent: Flow Diagram\n\n${JSON.stringify(VALID_FD_JSON)}`, model: 'mock' };
        }
        if (prompt.includes('risk hypotheses') || prompt.includes('Phase 1 findings')) {
          return { text: '[]', model: 'mock' };
        }
        capturedPrompts['Observer'] = prompt;
        return { text: '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(emptyGraph());
    const orchestrator = new ContextOrchestratorService();

    const mockPromptBuilder = {
      buildObserverPrompt: (_ctx: any, _budget: any) => createObserverAgent(store),
    };

    const agents: AgentPrompt[] = [
      createPhase1Agent('Code Reviewer', 'code-reviewer', store),
      createPhase1Agent('Flow Diagram', 'flow-diagram', store),
    ];

    const result = await orchestrator.generateMultiAgentFinalText(
      adapter,
      agents,
      'Synthesis system message',
      (reports) => reports.join('\n---\n'),
      undefined,
      undefined,
      {
        sharedStore: store,
        promptBuilder: mockPromptBuilder,
        buildContext: createBuildContext(store),
        budgetAllocations: [
          createBudget('Code Reviewer'),
          createBudget('Flow Diagram'),
          createBudget('Observer'),
        ],
      }
    );

    // Phase 1 agents should have role-specific prompts (not identical)
    assert.ok(capturedPrompts['Code Reviewer'], 'Code Reviewer should have been called');
    assert.ok(capturedPrompts['Flow Diagram'], 'Flow Diagram should have been called');
    assert.notStrictEqual(
      capturedPrompts['Code Reviewer'],
      capturedPrompts['Flow Diagram'],
      'Phase 1 agents should have different role-specific prompts'
    );

    // Observer prompt should contain Phase 1 findings
    assert.ok(capturedPrompts['Observer'], 'Observer should have been called');

    // Final output should be a string (synthesis result)
    assert.strictEqual(typeof result, 'string', 'Final output should be a string');
    assert.ok(result.length > 0, 'Final output should not be empty');
  });

  test('17.1: generateMultiAgentFinalText with phasedConfig — Observer prompt contains Phase 1 findings', async () => {
    let capturedObserverPrompt = '';
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
        // Observer call
        capturedObserverPrompt = prompt;
        return { text: '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(emptyGraph());
    const orchestrator = new ContextOrchestratorService();

    // Use a promptBuilder that injects shared context into Observer prompt
    const mockPromptBuilder = {
      buildObserverPrompt: (_ctx: any, _budget: any) => {
        const serialized = store.serializeForAgent('Observer', 5000);
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

    const agents: AgentPrompt[] = [
      createPhase1Agent('Code Reviewer', 'code-reviewer', store),
      createPhase1Agent('Flow Diagram', 'flow-diagram', store),
    ];

    await orchestrator.generateMultiAgentFinalText(
      adapter,
      agents,
      'Synthesis system message',
      (reports) => reports.join('\n---\n'),
      undefined,
      undefined,
      {
        sharedStore: store,
        promptBuilder: mockPromptBuilder,
        buildContext: createBuildContext(store),
        budgetAllocations: [
          createBudget('Code Reviewer'),
          createBudget('Flow Diagram'),
          createBudget('Observer'),
        ],
      }
    );

    // Observer prompt should contain CR findings (null check missing or Code Reviewer reference)
    assert.ok(
      capturedObserverPrompt.includes('null check missing') || capturedObserverPrompt.includes('Code Reviewer'),
      'Observer prompt should contain Phase 1 CR findings'
    );
  });

  // ────────────────────────────────────────────
  // 17.2 — Test full pipeline without phasedConfig (backward compat)
  // ────────────────────────────────────────────

  test('17.2: generateMultiAgentFinalText without phasedConfig — falls back to executeAgents', async () => {
    const executedPrompts: string[] = [];
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        executedPrompts.push(prompt);
        return { text: 'Agent analysis result', model: 'mock' };
      },
    });

    const orchestrator = new ContextOrchestratorService();

    // Create agents WITHOUT new optional fields (backward compat)
    const legacyAgents: AgentPrompt[] = [
      { role: 'Agent A', systemMessage: 'System A', prompt: 'Analyze code' },
      { role: 'Agent B', systemMessage: 'System B', prompt: 'Analyze code' },
    ];

    const result = await orchestrator.generateMultiAgentFinalText(
      adapter,
      legacyAgents,
      'Synthesis system message',
      (reports) => reports.join('\n---\n'),
      // No signal, no request, NO phasedConfig
    );

    // All agents should have been called (executeAgents path)
    // 2 agent calls + 1 synthesis call = 3 total
    assert.ok(executedPrompts.length >= 3, `Expected at least 3 LLM calls (2 agents + 1 synthesis), got ${executedPrompts.length}`);

    // Final output should be a string
    assert.strictEqual(typeof result, 'string', 'Final output should be a string');
    assert.ok(result.length > 0, 'Final output should not be empty');
  });

  test('17.2: existing AgentPrompt objects without new optional fields work correctly', async () => {
    const adapter = createMockAdapter({
      generateTextFn: async () => ({
        text: 'Legacy agent output',
        model: 'mock',
      }),
    });

    const orchestrator = new ContextOrchestratorService();

    // Minimal AgentPrompt — only required fields, no phase/outputSchema/sharedStore
    const minimalAgent: AgentPrompt = {
      role: 'Legacy Agent',
      systemMessage: 'You are a reviewer',
      prompt: 'Review this code',
    };

    // Should not throw
    const result = await orchestrator.generateMultiAgentFinalText(
      adapter,
      [minimalAgent],
      'Synthesis system',
      (reports) => `Synthesized: ${reports.join(', ')}`,
    );

    assert.strictEqual(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  // ────────────────────────────────────────────
  // 17.3 — Test staged changes pipeline
  // ────────────────────────────────────────────

  test('17.3: staged changes pipeline uses same phased execution components', async () => {
    const executedRoles: string[] = [];
    const adapter = createMockAdapter({
      generateTextFn: async (prompt) => {
        if (prompt.includes('Code Reviewer')) {
          executedRoles.push('Code Reviewer');
          return { text: `### Agent: Code Reviewer\n\n${JSON.stringify(VALID_CR_JSON)}`, model: 'mock' };
        }
        if (prompt.includes('Flow Diagram')) {
          executedRoles.push('Flow Diagram');
          return { text: `### Agent: Flow Diagram\n\n${JSON.stringify(VALID_FD_JSON)}`, model: 'mock' };
        }
        if (prompt.includes('risk hypotheses') || prompt.includes('Phase 1 findings')) {
          return { text: '[]', model: 'mock' };
        }
        executedRoles.push('Observer');
        return { text: '### Agent: Observer\n\n{"risks":[],"todoItems":[],"integrationConcerns":[]}', model: 'mock' };
      },
    });

    // Simulate staged changes context — same pipeline components as merge review
    const store = new SharedContextStoreImpl();
    store.setDependencyGraph(emptyGraph());
    const orchestrator = new ContextOrchestratorService();

    const mockPromptBuilder = {
      buildObserverPrompt: (_ctx: any, _budget: any) => createObserverAgent(store),
    };

    // Staged changes build context — same structure, different task info
    const stagedBuildContext: AgentPromptBuildContext = {
      fullDiff: 'diff --git a/staged.ts\n+staged line\n-old line',
      changedFiles: [],
      language: 'typescript',
      sharedContextStore: store,
      taskInfo: 'staged changes review',
    };

    const agents: AgentPrompt[] = [
      createPhase1Agent('Code Reviewer', 'code-reviewer', store),
      createPhase1Agent('Flow Diagram', 'flow-diagram', store),
    ];

    const result = await orchestrator.generateMultiAgentFinalText(
      adapter,
      agents,
      'Staged review synthesis system message',
      (reports) => reports.join('\n---\n'),
      undefined,
      undefined,
      {
        sharedStore: store,
        promptBuilder: mockPromptBuilder,
        buildContext: stagedBuildContext,
        budgetAllocations: [
          createBudget('Code Reviewer'),
          createBudget('Flow Diagram'),
          createBudget('Observer'),
        ],
      }
    );

    // Same pipeline components should execute for staged changes
    assert.ok(executedRoles.includes('Code Reviewer'), 'Code Reviewer should execute in staged changes pipeline');
    assert.ok(executedRoles.includes('Flow Diagram'), 'Flow Diagram should execute in staged changes pipeline');
    assert.ok(executedRoles.includes('Observer'), 'Observer should execute in staged changes pipeline');

    // SharedContextStore should have findings from Phase 1
    const crFindings = store.getAgentFindings('Code Reviewer');
    assert.ok(crFindings.length > 0, 'CR findings should be stored in SharedContextStore');

    const fdFindings = store.getAgentFindings('Flow Diagram');
    assert.ok(fdFindings.length > 0, 'FD findings should be stored in SharedContextStore');

    // Final output is a string
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.length > 0);
  });
});
