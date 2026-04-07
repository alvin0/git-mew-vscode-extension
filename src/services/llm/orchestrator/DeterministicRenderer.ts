import { UnifiedDiffFile } from '../contextTypes';
import { SuppressedFinding } from '../reviewMemoryTypes';
import { Finding, Hypothesis } from './executionPlanTypes';
import {
  CodeReviewerOutput,
  FlowDiagramOutput,
  ObserverOutput,
  SecurityAnalystOutput,
  StructuredAgentReport,
} from './orchestratorTypes';
import { isSuppressed, wordOverlapRatio } from './SuppressionFilter';

export const EMPTY_SECTION_MESSAGES: Record<string, Record<string, string>> = {
  noIssues: {
    Vietnamese: 'Không phát hiện vấn đề nào.',
    Japanese: '問題は検出されませんでした。',
    Korean: '발견된 문제가 없습니다.',
    Chinese: '未发现任何问题。',
    French: 'Aucun problème détecté.',
    German: 'Keine Probleme gefunden.',
    Spanish: 'No se detectaron problemas.',
    English: 'No issues found.',
  },
  noDiagram: {
    Vietnamese: 'Không có sơ đồ nào được tạo cho thay đổi này.',
    Japanese: 'この変更に対するダイアグラムは生成されませんでした。',
    Korean: '이 변경 사항에 대한 다이어그램이 생성되지 않았습니다.',
    Chinese: '未为此更改生成图表。',
    French: 'Aucun diagramme généré pour cette modification.',
    German: 'Kein Diagramm für diese Änderung erstellt.',
    Spanish: 'No se generó ningún diagrama para este cambio.',
    English: 'No diagrams generated for this change.',
  },
  noRisks: {
    Vietnamese: 'Không phát hiện rủi ro tiềm ẩn nào.',
    Japanese: '潜在的なリスクは検出されませんでした。',
    Korean: '잠재적 위험이 감지되지 않았습니다.',
    Chinese: '未检测到潜在风险。',
    French: 'Aucun risque potentiel détecté.',
    German: 'Keine potenziellen Risiken erkannt.',
    Spanish: 'No se detectaron riesgos potenciales.',
    English: 'No potential risks detected.',
  },
  noTodo: {
    Vietnamese: 'Không có mục nào cần theo dõi.',
    Japanese: 'フォローアップ項目はありません。',
    Korean: '후속 조치 항목이 없습니다.',
    Chinese: '没有需要跟进的事项。',
    French: 'Aucun élément de suivi.',
    German: 'Keine Nachverfolgungspunkte.',
    Spanish: 'No hay elementos de seguimiento.',
    English: 'No follow-up items.',
  },
};

export interface DeterministicSections {
  changedFiles: string;
  summary: string;
  flowDiagram: string;
  codeQuality: string;
  improvements: string;
  todo: string;
  risks: string;
}

export type MetadataStats = {
  totalFindings: number;
  bySeverity: Record<string, number>;
  byAgent: Record<string, number>;
  crossValidated: number;
  suppressed: number;
};

export function emptyMessage(key: string, language: string): string {
  const messages = EMPTY_SECTION_MESSAGES[key];
  return messages?.[language] ?? messages?.English ?? 'None';
}

export function severityWeight(severity: string): number {
  switch (severity) {
    case 'critical':
    case 'high':
      return 4;
    case 'major':
      return 3;
    case 'medium':
      return 2;
    case 'minor':
    case 'low':
      return 1;
    default:
      return 0;
  }
}

export function getReports(structuredReports: StructuredAgentReport[]): {
  codeReviewer?: CodeReviewerOutput;
  security?: SecurityAnalystOutput;
  observer?: ObserverOutput;
  flow?: FlowDiagramOutput;
} {
  const codeReviewer = structuredReports.find((report) => report.role === 'Code Reviewer')?.structured as
    | CodeReviewerOutput
    | undefined;
  const security = structuredReports.find((report) => report.role === 'Security Analyst')?.structured as
    | SecurityAnalystOutput
    | undefined;
  const observer = structuredReports.find((report) => report.role === 'Observer')?.structured as
    | ObserverOutput
    | undefined;
  const flow = structuredReports.find((report) => report.role === 'Flow Diagram')?.structured as
    | FlowDiagramOutput
    | undefined;
  return { codeReviewer, security, observer, flow };
}

export function renderChangedFiles(changedFiles: UnifiedDiffFile[]): string {
  const lines = changedFiles.length > 0
    ? changedFiles.map((file) => `- \`${file.relativePath}\` — ${file.statusLabel}`)
    : ['None'];
  return `## 1. Changed File Paths\n${lines.join('\n')}`;
}

export function renderSummaryFallback(structuredReports: StructuredAgentReport[]): string {
  const summary = structuredReports.length > 0
    ? `The review covered ${structuredReports.map((report) => report.role).join(', ')} findings for the changed files.`
    : 'None';
  return ['## 2. Summary of Changes', summary].join('\n\n');
}

export function renderSummaryFromFindings(findings: Finding[], changedFiles: UnifiedDiffFile[]): string {
  if (findings.length === 0) {
    return ['## 2. Summary of Changes', changedFiles.length > 0
      ? `The patch changes ${changedFiles.length} file(s) and no actionable findings have been verified yet.`
      : 'None'].join('\n\n');
  }

  const categories = [...new Set(findings.map((finding) => finding.category))];
  const topFiles = [...new Set(findings.map((finding) => finding.file))].slice(0, 5);
  const highestSeverity = findings
    .map((finding) => finding.severity)
    .sort((left, right) => severityWeight(right) - severityWeight(left))[0];

  return [
    '## 2. Summary of Changes',
    `The patch touches ${changedFiles.length} file(s) and produced ${findings.length} renderable finding(s), led by ${highestSeverity} severity concerns.`,
    `Primary categories: ${categories.join(', ') || 'none'}.`,
    `Priority files: ${topFiles.join(', ') || 'none'}.`,
  ].join('\n\n');
}

export function renderFlowDiagram(flow: FlowDiagramOutput | undefined, language: string): string {
  const diagramSection = flow?.diagrams?.length
    ? flow.diagrams
        .map((diagram) =>
          `### Diagram: ${diagram.name}\n${diagram.description}\n\`\`\`plantuml\n${diagram.plantumlCode}\n\`\`\``,
        )
        .join('\n\n')
    : emptyMessage('noDiagram', language);

  return ['## 4. Flow Diagram', diagramSection].join('\n\n');
}

export function renderCodeQuality(
  codeReviewer: CodeReviewerOutput | undefined,
  suppressedFindings: SuppressedFinding[],
  language: string,
): string {
  const activeIssues = (codeReviewer?.issues ?? [])
    .filter((issue) => !isSuppressed(issue.file, issue.category, issue.description, suppressedFindings))
    .sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity));
  const assessment = codeReviewer
    ? `**${codeReviewer.qualityVerdict}**\n${activeIssues.slice(0, 3).map((issue) => `- ${issue.description}`).join('\n') || emptyMessage('noIssues', language)}`
    : emptyMessage('noIssues', language);

  return ['## 5. Code Quality Assessment', assessment].join('\n\n');
}

export function renderImprovementsFallback(
  codeReviewer: CodeReviewerOutput | undefined,
  security: SecurityAnalystOutput | undefined,
  suppressedFindings: SuppressedFinding[],
  language: string,
): { markdown: string; stats: MetadataStats } {
  const lines: string[] = [];
  let total = 0;
  let crossValidated = 0;
  const byAgent: Record<string, number> = { CR: 0, SA: 0, OB: 0 };
  const bySeverity: Record<string, number> = { critical: 0, major: 0, minor: 0, suggestion: 0 };

  const securityFindings = (security?.vulnerabilities ?? []).filter(
    (finding) => finding.confidence >= 0.5 && !isSuppressed(finding.file, 'security', finding.description, suppressedFindings),
  );

  if ((codeReviewer?.issues?.length ?? 0) > 0) {
    lines.push('### Correctness');
    const issues = [...(codeReviewer?.issues ?? [])]
      .filter((issue) => !isSuppressed(issue.file, issue.category, issue.description, suppressedFindings))
      .sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity));
    for (const issue of issues) {
      const crossValidatedFinding = securityFindings.some((finding) =>
        finding.file === issue.file &&
        wordOverlapRatio(finding.description, issue.description) > 0.4,
      );
      const tag = crossValidatedFinding ? '[XV][CR]' : '[CR]';
      if (crossValidatedFinding) {
        crossValidated += 1;
      }
      total += 1;
      byAgent.CR += 1;
      bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
      lines.push(
        `- **File & Location**: \`${issue.file}\` — ${issue.location}\n` +
        `  **Issue**: ${tag} ${issue.description}\n` +
        `  **Why it matters**: ${issue.category} risk in changed behavior.\n` +
        `  **Actionable fix**: ${issue.suggestion}\n` +
        `  **Confidence score**: ${Math.round((issue.confidence ?? 0.6) * 100)}%`,
      );
    }
  }

  if (securityFindings.length > 0) {
    lines.push('### Security');
    const sorted = [...securityFindings].sort(
      (left, right) =>
        severityWeight(right.severity) - severityWeight(left.severity) ||
        right.confidence - left.confidence,
    );
    for (const finding of sorted) {
      total += 1;
      byAgent.SA += 1;
      const severityKey =
        finding.severity === 'critical'
          ? 'critical'
          : finding.severity === 'high'
            ? 'major'
            : finding.severity === 'medium'
              ? 'minor'
              : 'suggestion';
      bySeverity[severityKey] = (bySeverity[severityKey] ?? 0) + 1;
      lines.push(
        `- **File & Location**: \`${finding.file}\` — ${finding.location}\n` +
        `  **Issue**: [SA] ${finding.cweId} ${finding.description}\n` +
        `  **Why it matters**: ${finding.type} vulnerability may affect security boundaries.\n` +
        `  **Actionable fix**: ${finding.remediation}\n` +
        `  **Confidence score**: ${Math.round(finding.confidence * 100)}%`,
      );
    }
  }

  return {
    markdown: ['## 6. Improvement Suggestions', lines.length > 0 ? lines.join('\n') : emptyMessage('noIssues', language)].join('\n\n'),
    stats: {
      totalFindings: total,
      crossValidated,
      byAgent,
      bySeverity,
      suppressed: 0,
    },
  };
}

export function renderImprovementsFromFindings(
  findings: Finding[],
  language: string,
): { markdown: string; stats: MetadataStats } {
  const sorted = [...findings].sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity));
  const lines = sorted.map((finding) =>
    `- **File & Location**: \`${finding.file}\` — ${finding.lineRange.start}:${finding.lineRange.end}\n` +
    `  **Issue**: ${finding.description}\n` +
    `  **Actionable fix**: ${finding.suggestion}\n` +
    `  **Confidence score**: ${Math.round(finding.confidence * 100)}%`,
  );
  const bySeverity: Record<string, number> = { critical: 0, major: 0, minor: 0, suggestion: 0 };
  const byAgent: Record<string, number> = { CR: 0, SA: 0, OB: 0 };

  for (const finding of sorted) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
    if (finding.agentRole === 'Code Reviewer') {
      byAgent.CR += 1;
    } else if (finding.agentRole === 'Security Analyst') {
      byAgent.SA += 1;
    } else if (finding.agentRole === 'Observer') {
      byAgent.OB += 1;
    }
  }

  return {
    markdown: ['## 6. Improvement Suggestions', lines.length > 0 ? lines.join('\n') : emptyMessage('noIssues', language)].join('\n\n'),
    stats: {
      totalFindings: sorted.length,
      bySeverity,
      byAgent,
      crossValidated: 0,
      suppressed: 0,
    },
  };
}

export function renderTodo(observer: ObserverOutput | undefined, language: string): string {
  const todoLines = (observer?.todoItems ?? []).map((item) =>
    `- ${item.parallelizable ? '[Parallel]' : '[Sequential]'} ${item.action} ` +
    `(rationale: ${item.rationale ?? 'Validate behavior'}, expected: ${item.expectedOutcome ?? 'Behavior confirmed'}, priority: ${item.priority ?? 'medium'})`,
  );

  return ['## 7. Observer TODO List', todoLines.length > 0 ? todoLines.join('\n') : emptyMessage('noTodo', language)].join('\n\n');
}

export function renderRisks(
  observer: ObserverOutput | undefined,
  security: SecurityAnalystOutput | undefined,
  suppressedFindings: SuppressedFinding[],
  language: string,
): string {
  const riskEntries = [
    ...(observer?.risks ?? [])
      .filter((risk) => !isSuppressed(risk.affectedArea, 'correctness', risk.description, suppressedFindings))
      .map((risk, index) => ({
        key: `ob-${index}`,
        weight: severityWeight(risk.severity),
        line:
          `- [OB] ${risk.affectedArea} — ${risk.description} ` +
          `(confidence: ${Math.round((risk.confidence ?? 0.6) * 100)}%, likelihood: ${risk.likelihood ?? 'medium'}, impact: ${risk.impact ?? 'Needs validation'}, mitigation: ${risk.mitigation ?? 'Add follow-up checks'})`,
      })),
    ...(security?.vulnerabilities ?? [])
      .filter((finding) =>
        finding.confidence >= 0.5 &&
        !isSuppressed(finding.file, 'security', finding.description, suppressedFindings),
      )
      .map((finding, index) => ({
        key: `sa-${index}`,
        weight: severityWeight(finding.severity),
        line:
          `- [SA] ${finding.file}:${finding.location} — ${finding.description} ` +
          `(impact: ${finding.cweId}, mitigation: ${finding.remediation})`,
      })),
  ]
    .sort((left, right) => right.weight - left.weight)
    .map((entry) => entry.line);

  const riskLines = [
    ...riskEntries,
    ...((observer?.hypothesisVerdicts ?? []).map((verdict) =>
      `- Hypothesis #${verdict.hypothesisIndex}: ${verdict.verdict} — ${verdict.evidence}`,
    )),
  ];

  return ['## 8. Potential Hidden Risks', riskLines.length > 0 ? riskLines.join('\n') : emptyMessage('noRisks', language)].join('\n\n');
}

export function renderCodeQualityFromFindings(findings: Finding[], language: string): string {
  const codeFindings = findings
    .filter((finding) => finding.agentRole === 'Code Reviewer')
    .sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity));
  if (codeFindings.length === 0) {
    return ['## 5. Code Quality Assessment', emptyMessage('noIssues', language)].join('\n\n');
  }

  const verdict = codeFindings[0].severity === 'critical'
    ? 'Critical'
    : codeFindings[0].severity === 'major'
      ? 'Not Bad'
      : codeFindings[0].severity === 'minor'
        ? 'Safe'
        : 'Good';
  return [
    '## 5. Code Quality Assessment',
    `**${verdict}**\n${codeFindings.slice(0, 3).map((finding) => `- ${finding.description}`).join('\n')}`,
  ].join('\n\n');
}

export function renderRisksFromFindings(
  findings: Finding[],
  hypotheses: Hypothesis[],
  language: string,
): string {
  const riskLines = findings
    .filter((finding) => finding.agentRole === 'Observer' || finding.agentRole === 'Security Analyst')
    .sort((left, right) => severityWeight(right.severity) - severityWeight(left.severity))
    .map((finding) =>
      `- [${finding.agentRole === 'Security Analyst' ? 'SA' : 'OB'}] ${finding.file} — ${finding.description} ` +
      `(confidence: ${Math.round(finding.confidence * 100)}%, mitigation: ${finding.suggestion})`,
    );
  const hypothesisLines = hypotheses.map((hypothesis, index) =>
    `- Hypothesis #${index + 1}: ${hypothesis.description} (${hypothesis.status})`,
  );
  const content = [...riskLines, ...hypothesisLines];
  return ['## 8. Potential Hidden Risks', content.length > 0 ? content.join('\n') : emptyMessage('noRisks', language)].join('\n\n');
}

export function computeMetadataStatsFromFindings(findings: Finding[], suppressedCount: number): MetadataStats {
  const bySeverity: Record<string, number> = { critical: 0, major: 0, minor: 0, suggestion: 0 };
  const byAgent: Record<string, number> = { CR: 0, SA: 0, OB: 0 };
  let crossValidated = 0;

  for (const finding of findings) {
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
    if (finding.agentRole === 'Code Reviewer') {
      byAgent.CR += 1;
      if (findings.some((candidate) =>
        candidate.agentRole === 'Security Analyst' &&
        candidate.file === finding.file &&
        wordOverlapRatio(candidate.description, finding.description) > 0.4,
      )) {
        crossValidated += 1;
      }
    } else if (finding.agentRole === 'Security Analyst') {
      byAgent.SA += 1;
    } else if (finding.agentRole === 'Observer') {
      byAgent.OB += 1;
    }
  }

  return {
    totalFindings: findings.length,
    bySeverity,
    byAgent,
    crossValidated,
    suppressed: suppressedCount,
  };
}

export function computeMetadataStats(
  codeReviewer: CodeReviewerOutput | undefined,
  security: SecurityAnalystOutput | undefined,
  observer: ObserverOutput | undefined,
  suppressedFindings: SuppressedFinding[],
): MetadataStats {
  const bySeverity: Record<string, number> = { critical: 0, major: 0, minor: 0, suggestion: 0 };
  const byAgent: Record<string, number> = { CR: 0, SA: 0, OB: 0 };
  let crossValidated = 0;
  let suppressed = 0;

  const activeSecurityFindings = (security?.vulnerabilities ?? []).filter((finding) => {
    const matched =
      finding.confidence >= 0.5 &&
      !isSuppressed(finding.file, 'security', finding.description, suppressedFindings);
    if (!matched && finding.confidence >= 0.5) {
      suppressed += 1;
    }
    return matched;
  });

  const activeCodeReviewerIssues = (codeReviewer?.issues ?? []).filter((issue) => {
    const matched = !isSuppressed(issue.file, issue.category, issue.description, suppressedFindings);
    if (!matched) {
      suppressed += 1;
    }
    return matched;
  });

  const activeObserverRisks = (observer?.risks ?? []).filter((risk) => {
    const matched = !isSuppressed(risk.affectedArea, 'correctness', risk.description, suppressedFindings);
    if (!matched) {
      suppressed += 1;
    }
    return matched;
  });

  for (const issue of activeCodeReviewerIssues) {
    byAgent.CR += 1;
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
    if (activeSecurityFindings.some((finding) =>
      finding.file === issue.file &&
      wordOverlapRatio(finding.description, issue.description) > 0.4,
    )) {
      crossValidated += 1;
    }
  }

  for (const finding of activeSecurityFindings) {
    byAgent.SA += 1;
    const severityKey =
      finding.severity === 'critical'
        ? 'critical'
        : finding.severity === 'high'
          ? 'major'
          : finding.severity === 'medium'
            ? 'minor'
            : 'suggestion';
    bySeverity[severityKey] += 1;
  }

  for (const risk of activeObserverRisks) {
    byAgent.OB += 1;
    if (risk.severity === 'high') {
      bySeverity.major += 1;
    } else if (risk.severity === 'medium') {
      bySeverity.minor += 1;
    } else {
      bySeverity.suggestion += 1;
    }
  }

  return {
    totalFindings: activeCodeReviewerIssues.length + activeSecurityFindings.length + activeObserverRisks.length,
    bySeverity,
    byAgent,
    crossValidated,
    suppressed,
  };
}
