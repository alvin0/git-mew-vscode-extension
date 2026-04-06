import {
  RiskHypothesis,
  CodeReviewerOutput,
  FlowDiagramOutput,
  DependencyGraphData,
  SecurityAnalystOutput,
} from "./orchestratorTypes";
import { TokenEstimatorService } from "../TokenEstimatorService";
import { ILLMAdapter } from "../../../llm-adapter/adapterInterface";
import { trackEvent } from "../../posthog";

const MAX_HYPOTHESES = 10;
const MAX_LLM_HYPOTHESES = 4;

const CONFIG_PATTERNS = [
  /\.config\./i,
  /\.env/i,
  /^package\.json$/i,
];

const SCHEMA_KEYWORDS = [
  "migration",
  "schema",
  "model",
  "entity",
  "dto",
];

export class RiskHypothesisGenerator {
  constructor(private readonly tokenEstimator: TokenEstimatorService) {}

  async generate(
    codeReviewerOutput: CodeReviewerOutput,
    flowDiagramOutput: FlowDiagramOutput,
    dependencyGraph: DependencyGraphData,
    adapter: ILLMAdapter,
    signal?: AbortSignal,
    securityOutput?: SecurityAnalystOutput,
  ): Promise<RiskHypothesis[]> {
    const heuristics = this.generateHeuristicHypotheses(
      codeReviewerOutput,
      flowDiagramOutput,
      dependencyGraph,
      securityOutput,
    );

    let combined = [...heuristics];

    if (heuristics.length < MAX_HYPOTHESES) {
      try {
        const summaries = this.buildSummaries(codeReviewerOutput, flowDiagramOutput, securityOutput);
        const llmHypotheses = await this.generateLLMHypotheses(
          heuristics,
          summaries,
          adapter,
          signal,
        );
        combined = [...heuristics, ...llmHypotheses];
      } catch {
        // Fallback to heuristics only
      }
    }

    return this.deduplicateByQuestion(combined).slice(0, MAX_HYPOTHESES);
  }

  private generateHeuristicHypotheses(
    crOutput: CodeReviewerOutput,
    fdOutput: FlowDiagramOutput,
    graph: DependencyGraphData,
    securityOutput?: SecurityAnalystOutput,
  ): RiskHypothesis[] {
    const hypotheses: RiskHypothesis[] = [];
    const crIssues = crOutput?.issues ?? [];
    const changedFiles = new Set(crIssues.map((i) => i.file));

    // Rule 1 (API change): symbols with >= 2 references whose file is changed
    for (const [symbolName, info] of graph.symbolMap) {
      if (info.referencedBy.length >= 2 && changedFiles.has(info.definedIn)) {
        hypotheses.push({
          question: `Symbol "${symbolName}" changed in ${info.definedIn}. Are all ${info.referencedBy.length} consumers (${info.referencedBy.slice(0, 3).join(", ")}) updated?`,
          affectedFiles: [info.definedIn, ...info.referencedBy],
          evidenceNeeded: "Check each consumer file for compatibility with the changed symbol.",
          severityEstimate: "high",
          source: "heuristic",
          category: "integration",
        });
      }
    }

    // Rule 2 (Cross-file chain): critical paths with >= 3 changed files
    for (const path of graph.criticalPaths) {
      if (path.changedFileCount >= 3) {
        hypotheses.push({
          question: `Files ${path.files.slice(0, 3).join(", ")} form a dependency chain and all changed. Is the data flow consistent?`,
          affectedFiles: path.files,
          evidenceNeeded: "Trace data flow through the chain to verify consistency.",
          severityEstimate: "high",
          source: "heuristic",
          category: "integration",
        });
      }
    }

    // Rule 3 (Deleted export): CR issues with severity 'critical' or 'major'
    const severeIssues = crIssues.filter(
      (i) => i.severity === "critical" || i.severity === "major",
    );
    for (const issue of severeIssues) {
      const consumers = this.getConsumersForFile(issue.file, graph);
      if (consumers.length > 0) {
        hypotheses.push({
          question: `Critical issue in ${issue.file}: "${issue.description}". Are ${consumers.length} consumers handling this?`,
          affectedFiles: [issue.file, ...consumers],
          evidenceNeeded: "Verify consumers are not broken by the critical change.",
          severityEstimate: "high",
          source: "heuristic",
          category: "correctness",
        });
        break; // One hypothesis per rule to avoid flooding
      }
    }

    // Rule 4 (New dependency): CR issues mentioning 'import' or 'dependency'
    const importIssues = crIssues.filter(
      (i) =>
        (i.description ?? '').toLowerCase().includes("import") ||
        (i.description ?? '').toLowerCase().includes("dependency"),
    );
    if (importIssues.length > 0) {
      const files = [...new Set(importIssues.map((i) => i.file))];
      hypotheses.push({
        question: `New dependencies detected in ${files.slice(0, 3).join(", ")}. Could this introduce circular dependencies?`,
        affectedFiles: files,
        evidenceNeeded: "Check import graph for cycles involving the new dependencies.",
        severityEstimate: "medium",
        source: "heuristic",
        category: "correctness",
      });
    }

    // Rule 5 (Error handling): CR issues with category 'correctness'
    const correctnessIssues = crIssues.filter(
      (i) => i.category === "correctness",
    );
    if (correctnessIssues.length > 0) {
      const files = [...new Set(correctnessIssues.map((i) => i.file))];
      hypotheses.push({
        question: `Correctness issues found in ${files.slice(0, 3).join(", ")}. Are callers prepared for changed behavior?`,
        affectedFiles: files,
        evidenceNeeded: "Review callers of affected functions for error handling adequacy.",
        severityEstimate: "high",
        source: "heuristic",
        category: "correctness",
      });
    }

    // Rule 6 (Config change): affected files matching config patterns
    const allAffectedFiles = this.getAllAffectedFiles(crOutput, graph);
    const configFiles = allAffectedFiles.filter((f) =>
      CONFIG_PATTERNS.some((p) => p.test(this.basename(f))),
    );
    if (configFiles.length > 0) {
      hypotheses.push({
        question: `Configuration files changed: ${configFiles.join(", ")}. Are all environments (dev/staging/prod) compatible?`,
        affectedFiles: configFiles,
        evidenceNeeded: "Verify environment-specific configurations are consistent.",
        severityEstimate: "medium",
        source: "heuristic",
        category: "integration",
      });
    }

    // Rule 7 (Test gap): CR issues with category 'testing'
    const testingIssues = crIssues.filter(
      (i) => i.category === "testing",
    );
    if (testingIssues.length > 0) {
      const files = [...new Set(testingIssues.map((i) => i.file))];
      hypotheses.push({
        question: `Testing concerns in ${files.slice(0, 3).join(", ")}. Is test coverage adequate for the changes?`,
        affectedFiles: files,
        evidenceNeeded: "Check if corresponding test files cover the changed functionality.",
        severityEstimate: "medium",
        source: "heuristic",
        category: "correctness",
      });
    }

    // Rule 8 (Schema change): files or issues mentioning schema/migration/model keywords
    const schemaFiles = allAffectedFiles.filter((f) =>
      SCHEMA_KEYWORDS.some((kw) => f.toLowerCase().includes(kw)),
    );
    const schemaIssues = crIssues.filter((i) =>
      SCHEMA_KEYWORDS.some(
        (kw) =>
          (i.description ?? '').toLowerCase().includes(kw) ||
          (i.file ?? '').toLowerCase().includes(kw),
      ),
    );
    const schemaAffected = [
      ...new Set([
        ...schemaFiles,
        ...schemaIssues.map((i) => i.file),
      ]),
    ];
    if (schemaAffected.length > 0) {
      hypotheses.push({
        question: `Schema/model changes detected in ${schemaAffected.slice(0, 3).join(", ")}. Are all queries and DTOs updated?`,
        affectedFiles: schemaAffected,
        evidenceNeeded: "Verify database queries and data transfer objects match the new schema.",
        severityEstimate: "high",
        source: "heuristic",
        category: "correctness",
      });
    }

    if (securityOutput?.vulnerabilities?.length) {
      for (const vulnerability of securityOutput.vulnerabilities) {
        if (vulnerability.taintSource) {
          hypotheses.push({
            question: `Tainted data from "${vulnerability.taintSource}" flows to "${vulnerability.taintSink ?? 'unknown sink'}" in ${vulnerability.file}. Are there other sinks not covered by the diff?`,
            affectedFiles: [vulnerability.file, ...this.getConsumersForFile(vulnerability.file, graph)],
            evidenceNeeded: "Check other files that import from this module for similar sink patterns.",
            severityEstimate: "high",
            source: "heuristic",
            category: "security",
          });
        }

        const consumers = this.getConsumersForFile(vulnerability.file, graph);
        if (consumers.length >= 3) {
          hypotheses.push({
            question: `Security vulnerability in ${vulnerability.file} (${vulnerability.cweId}). ${consumers.length} consumers may be affected.`,
            affectedFiles: [vulnerability.file, ...consumers],
            evidenceNeeded: "Verify consumers handle tainted data safely.",
            severityEstimate: "high",
            source: "heuristic",
            category: "security",
          });
        }
      }
    }

    if (securityOutput?.authFlowConcerns?.length) {
      for (const concern of securityOutput.authFlowConcerns) {
        hypotheses.push({
          question: `Auth flow concern: "${concern.description}". Are there bypass paths through other endpoints?`,
          affectedFiles: concern.affectedEndpoints,
          evidenceNeeded: "Check auth middleware usage across all endpoints.",
          severityEstimate: "high",
          source: "heuristic",
          category: "security",
        });
      }
    }

    return hypotheses;
  }

  private async generateLLMHypotheses(
    heuristics: RiskHypothesis[],
    summaries: string,
    adapter: ILLMAdapter,
    signal?: AbortSignal,
  ): Promise<RiskHypothesis[]> {
    const existingQuestions = heuristics
      .map((h) => `- ${h.question}`)
      .join("\n");

    const prompt = `Given these Phase 1 findings:
${summaries}

Existing risk hypotheses:
${existingQuestions || "(none)"}

Generate additional risk hypotheses NOT covered by the existing ones. Each hypothesis should identify a potential risk that needs investigation.

Output a JSON array of objects with these fields:
- question: string (the risk question to investigate)
- affectedFiles: string[] (files that may be affected)
- evidenceNeeded: string (what evidence would confirm/refute this risk)
- severityEstimate: "high" | "medium" | "low"

Max ${MAX_LLM_HYPOTHESES} additional hypotheses. Return ONLY the JSON array, no markdown fences.`;

    const response = await adapter.generateText(prompt, {
      systemMessage:
        "You are a code review risk analyst. Generate risk hypotheses as a JSON array. Return ONLY valid JSON.",
      maxTokens: 2000,
      signal,
    });

    trackEvent('llm_request', {
      provider: adapter.getProvider(),
      model: adapter.getModel(),
      stage: 'risk-hypothesis',
      ...(response.promptTokens !== undefined && { prompt_tokens: response.promptTokens }),
      ...(response.completionTokens !== undefined && { completion_tokens: response.completionTokens }),
      ...(response.totalTokens !== undefined && { total_tokens: response.totalTokens }),
    });

    return this.parseLLMResponse(response.text);
  }

  private parseLLMResponse(text: string): RiskHypothesis[] {
    try {
      // Try to extract JSON array from the response
      let jsonStr = text.trim();

      // Strip markdown fences if present
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        jsonStr = fenceMatch[1].trim();
      }

      // Try to find array brackets
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonStr = arrayMatch[0];
      }

      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter(
          (h: any) =>
            typeof h.question === "string" &&
            h.question.length > 0 &&
            Array.isArray(h.affectedFiles) &&
            typeof h.evidenceNeeded === "string" &&
            ["high", "medium", "low"].includes(h.severityEstimate),
        )
        .slice(0, MAX_LLM_HYPOTHESES)
        .map((h: any) => ({
          question: h.question,
          affectedFiles: h.affectedFiles.filter(
            (f: any) => typeof f === "string",
          ),
          evidenceNeeded: h.evidenceNeeded,
          severityEstimate: h.severityEstimate as "high" | "medium" | "low",
          source: "llm" as const,
          category: "integration" as const,
        }));
    } catch {
      return [];
    }
  }

  private buildSummaries(
    crOutput: CodeReviewerOutput,
    fdOutput: FlowDiagramOutput,
    securityOutput?: SecurityAnalystOutput,
  ): string {
    const parts: string[] = [];
    const crIssues = crOutput?.issues ?? [];
    const fdFlows = fdOutput?.affectedFlows ?? [];
    const fdDiagrams = fdOutput?.diagrams ?? [];

    if (crIssues.length > 0) {
      parts.push("Code Review Issues:");
      for (const issue of crIssues.slice(0, 10)) {
        parts.push(
          `- [${issue.severity}] ${issue.file}:${issue.location} — ${issue.description}`,
        );
      }
      parts.push(`Quality verdict: ${crOutput.qualityVerdict}`);
    }

    if (fdFlows.length > 0) {
      parts.push("\nAffected Flows:");
      for (const flow of fdFlows) {
        parts.push(`- ${flow}`);
      }
    }

    if (fdDiagrams.length > 0) {
      parts.push("\nDiagrams:");
      for (const d of fdDiagrams) {
        parts.push(`- ${d.name} (${d.type}): ${d.description}`);
      }
    }

    if (securityOutput?.vulnerabilities?.length) {
      parts.push("\nSecurity Findings:");
      for (const vulnerability of securityOutput.vulnerabilities.slice(0, 10)) {
        parts.push(
          `- [${vulnerability.severity}] ${vulnerability.file}:${vulnerability.location} — ${vulnerability.cweId}: ${vulnerability.description}`,
        );
      }
    }

    return parts.join("\n");
  }

  private deduplicateByQuestion(hypotheses: RiskHypothesis[]): RiskHypothesis[] {
    const result: RiskHypothesis[] = [];
    for (const h of hypotheses) {
      const isDuplicate = result.some(
        (existing) => this.wordOverlapRatio(existing.question, h.question) > 0.6,
      );
      if (!isDuplicate) {
        result.push(h);
      }
    }
    return result;
  }

  private wordOverlapRatio(a: string, b: string): number {
    const toWords = (s: string) =>
      new Set(
        s
          .split(/\s+/)
          .map((w) => w.toLowerCase())
          .filter((w) => w.length > 3),
      );

    const setA = toWords(a);
    const setB = toWords(b);

    if (setA.size === 0 || setB.size === 0) {
      return 0;
    }

    let intersectionSize = 0;
    for (const word of setA) {
      if (setB.has(word)) {
        intersectionSize++;
      }
    }

    return intersectionSize / Math.min(setA.size, setB.size);
  }

  private getConsumersForFile(
    filePath: string,
    graph: DependencyGraphData,
  ): string[] {
    const dep = graph.fileDependencies.get(filePath);
    return dep?.importedBy ?? [];
  }

  private getAllAffectedFiles(
    crOutput: CodeReviewerOutput,
    graph: DependencyGraphData,
  ): string[] {
    const files = new Set<string>();
    for (const issue of crOutput?.issues ?? []) {
      files.add(issue.file);
    }
    for (const [file] of graph.fileDependencies) {
      files.add(file);
    }
    return [...files];
  }

  private basename(filePath: string): string {
    const parts = filePath.split("/");
    return parts[parts.length - 1] || filePath;
  }
}
