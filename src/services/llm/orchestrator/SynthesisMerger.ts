import {
  CodeReviewerOutput,
  FlowDiagramOutput,
  ObserverOutput,
  SecurityAnalystOutput,
  StructuredAgentReport,
} from './orchestratorTypes';
import { UnifiedDiffFile } from '../contextTypes';
import { SuppressedFinding } from '../reviewMemoryTypes';
import { createHash } from 'crypto';

const EMPTY_SECTION_MESSAGES: Record<string, Record<string, string>> = {
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

function emptyMessage(key: string, language: string): string {
  const messages = EMPTY_SECTION_MESSAGES[key];
  return messages?.[language] ?? messages?.English ?? 'None';
}

function extractAgentBody(output?: string): string {
  if (!output) {
    return '';
  }
  const match = output.match(/### Agent: .+?\n\n([\s\S]*)/);
  return (match?.[1] ?? output).trim();
}

function normalize(text: string): string {
  return (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function wordOverlapRatio(a: string, b: string): number {
  const toWords = (value: string) =>
    new Set(
      value
        .split(/\s+/)
        .map((word) => word.toLowerCase())
        .filter((word) => word.length > 3),
    );

  const setA = toWords(a);
  const setB = toWords(b);
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const word of setA) {
    if (setB.has(word)) {
      overlap += 1;
    }
  }

  return overlap / Math.min(setA.size, setB.size);
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function globToRegExp(pattern: string): RegExp {
  if (!pattern) { return new RegExp('^$'); }
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexSource = escaped
    .replace(/\*\*\//g, '::DOUBLE_STAR_DIR::')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/::DOUBLE_STAR_DIR::/g, '(?:.*/)?')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${regexSource}$`);
}

function globMatch(path: string, pattern: string): boolean {
  return globToRegExp(pattern).test(path);
}

function isSuppressed(
  file: string,
  category: string,
  description: string,
  suppressedFindings: SuppressedFinding[],
): boolean {
  if (!description || !file) {
    return false;
  }
  const normalizedDescription = normalize(description);
  const descriptionHash = sha256(normalizedDescription);
  return suppressedFindings.some((finding) => {
    if (!finding.filePattern || !globMatch(file, finding.filePattern)) {
      return false;
    }
    if (finding.issueCategory !== category) {
      return false;
    }
    if (finding.descriptionHash === descriptionHash) {
      return true;
    }
    if (!finding.normalizedDescription) {
      return false;
    }
    return wordOverlapRatio(normalizedDescription, finding.normalizedDescription) >= 0.7;
  });
}

function severityWeight(severity: string): number {
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

function getReports(structuredReports: StructuredAgentReport[]): {
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

function buildChangedFilesSection(changedFiles: UnifiedDiffFile[]): string {
  const lines = changedFiles.length > 0
    ? changedFiles.map((file) => `- \`${file.relativePath}\` — ${file.statusLabel}`)
    : ['None'];
  return `## 1. Changed File Paths\n${lines.join('\n')}`;
}

function buildSummaryDetailFallback(
  structuredReports: StructuredAgentReport[],
  detailChangeReport?: string,
): string {
  const detailRaw = detailChangeReport?.trim() || 'None';
  const summary = structuredReports.length > 0
    ? `The review covered ${structuredReports.map((report) => report.role).join(', ')} findings for the changed files.`
    : 'None';

  return [
    '## 2. Summary of Changes',
    summary,
    '## 3. Detail Change',
    detailRaw || 'None',
  ].join('\n\n');
}

function buildDiagramAssessmentFallback(
  flow: FlowDiagramOutput | undefined,
  codeReviewer: CodeReviewerOutput | undefined,
  suppressedFindings: SuppressedFinding[],
  language: string,
): string {
  const diagramSection = flow?.diagrams?.length
    ? flow.diagrams
        .map((diagram) =>
          `### Diagram: ${diagram.name}\n${diagram.description}\n\`\`\`plantuml\n${diagram.plantumlCode}\n\`\`\``,
        )
        .join('\n\n')
    : emptyMessage('noDiagram', language);
  const activeIssues = (codeReviewer?.issues ?? []).filter(
    (issue) => !isSuppressed(issue.file, issue.category, issue.description, suppressedFindings),
  );
  const assessment = codeReviewer
    ? `**${codeReviewer.qualityVerdict}**\n${activeIssues.slice(0, 3).map((issue) => `- ${issue.description}`).join('\n') || emptyMessage('noIssues', language)}`
    : emptyMessage('noIssues', language);

  return [
    '## 4. Flow Diagram',
    diagramSection,
    '## 5. Code Quality Assessment',
    assessment,
  ].join('\n\n');
}

function buildImprovementFallback(
  codeReviewer: CodeReviewerOutput | undefined,
  security: SecurityAnalystOutput | undefined,
  suppressedFindings: SuppressedFinding[],
  language: string,
): { markdown: string; total: number; crossValidated: number; byAgent: Record<string, number>; bySeverity: Record<string, number> } {
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
    total,
    crossValidated,
    byAgent,
    bySeverity,
  };
}

function buildRiskTodoFallback(
  observer: ObserverOutput | undefined,
  security: SecurityAnalystOutput | undefined,
  suppressedFindings: SuppressedFinding[],
  language: string,
): { markdown: string; observerCount: number } {
  const todoLines = (observer?.todoItems ?? []).map((item) =>
    `- ${item.parallelizable ? '[Parallel]' : '[Sequential]'} ${item.action} ` +
    `(rationale: ${item.rationale ?? 'Validate behavior'}, expected: ${item.expectedOutcome ?? 'Behavior confirmed'}, priority: ${item.priority ?? 'medium'})`,
  );

  const activeObserverRisks = (observer?.risks ?? []).filter(
    (risk) => !isSuppressed(risk.affectedArea, 'correctness', risk.description, suppressedFindings),
  );
  const activeSecurityFindings = (security?.vulnerabilities ?? []).filter(
    (finding) =>
      finding.confidence >= 0.5 &&
      !isSuppressed(finding.file, 'security', finding.description, suppressedFindings),
  );

  const riskLines = [
    ...activeObserverRisks.map((risk) =>
      `- [OB] ${risk.affectedArea} — ${risk.description} ` +
      `(confidence: ${Math.round((risk.confidence ?? 0.6) * 100)}%, likelihood: ${risk.likelihood ?? 'medium'}, impact: ${risk.impact ?? 'Needs validation'}, mitigation: ${risk.mitigation ?? 'Add follow-up checks'})`,
    ),
    ...activeSecurityFindings.map((finding) =>
      `- [SA] ${finding.file}:${finding.location} — ${finding.description} ` +
      `(impact: ${finding.cweId}, mitigation: ${finding.remediation})`,
    ),
    ...((observer?.hypothesisVerdicts ?? []).map((verdict) =>
      `- Hypothesis #${verdict.hypothesisIndex}: ${verdict.verdict} — ${verdict.evidence}`,
    )),
  ];

  return {
    markdown: [
      '## 7. Observer TODO List',
      todoLines.length > 0 ? todoLines.join('\n') : emptyMessage('noTodo', language),
      '## 8. Potential Hidden Risks',
      riskLines.length > 0 ? riskLines.join('\n') : emptyMessage('noRisks', language),
    ].join('\n\n'),
    observerCount: activeObserverRisks.length + (observer?.todoItems?.length ?? 0),
  };
}

type MetadataStats = {
  totalFindings: number;
  bySeverity: Record<string, number>;
  byAgent: Record<string, number>;
  crossValidated: number;
  suppressed: number;
};

function mapSecuritySeverityToMetadata(severity: string): 'critical' | 'major' | 'minor' | 'suggestion' {
  if (severity === 'critical') {
    return 'critical';
  }
  if (severity === 'high') {
    return 'major';
  }
  if (severity === 'medium') {
    return 'minor';
  }
  return 'suggestion';
}

function mapObserverSeverityToMetadata(severity: string): 'critical' | 'major' | 'minor' | 'suggestion' {
  if (severity === 'high') {
    return 'major';
  }
  if (severity === 'medium') {
    return 'minor';
  }
  return 'suggestion';
}

function computeMetadataStats(
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
    const matched = finding.confidence >= 0.5 &&
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
    bySeverity[mapSecuritySeverityToMetadata(finding.severity)] += 1;
  }

  for (const risk of activeObserverRisks) {
    byAgent.OB += 1;
    bySeverity[mapObserverSeverityToMetadata(risk.severity)] += 1;
  }

  return {
    totalFindings: activeCodeReviewerIssues.length + activeSecurityFindings.length + activeObserverRisks.length,
    bySeverity,
    byAgent,
    crossValidated,
    suppressed,
  };
}

export function mergeSynthesisOutputs(
  agentOutputs: Map<string, string>,
  changedFiles: UnifiedDiffFile[],
  structuredReports: StructuredAgentReport[],
  suppressedFindings: SuppressedFinding[],
  reviewDurationMs: number,
  detailChangeReport?: string,
  language: string = 'English',
): string {
  const { codeReviewer, security, observer, flow } = getReports(structuredReports);

  const summaryDetail = extractAgentBody(agentOutputs.get('Summary & Detail'));
  const diagramAssessment = extractAgentBody(agentOutputs.get('Diagram & Assessment'));
  const improvementSuggestions = extractAgentBody(agentOutputs.get('Improvement Suggestions'));
  const riskTodo = extractAgentBody(agentOutputs.get('Risk & TODO'));

  const improvementFallback = buildImprovementFallback(codeReviewer, security, suppressedFindings, language);
  const riskTodoFallback = buildRiskTodoFallback(observer, security, suppressedFindings, language);
  const metadataStats = computeMetadataStats(codeReviewer, security, observer, suppressedFindings);

  const sections = [
    '# Code Review Report',
    buildChangedFilesSection(changedFiles),
    summaryDetail && !summaryDetail.startsWith('[ERROR]')
      ? summaryDetail
      : buildSummaryDetailFallback(structuredReports, detailChangeReport),
    diagramAssessment && !diagramAssessment.startsWith('[ERROR]')
      ? diagramAssessment
      : buildDiagramAssessmentFallback(flow, codeReviewer, suppressedFindings, language),
    improvementSuggestions && !improvementSuggestions.startsWith('[ERROR]')
      ? improvementSuggestions
      : improvementFallback.markdown,
    riskTodo && !riskTodo.startsWith('[ERROR]')
      ? riskTodo
      : riskTodoFallback.markdown,
  ];

  const metadataFooter =
    `<!-- Review Metadata: findings=${metadataStats.totalFindings}, critical=${metadataStats.bySeverity.critical ?? 0}, ` +
    `major=${metadataStats.bySeverity.major ?? 0}, minor=${metadataStats.bySeverity.minor ?? 0}, ` +
    `suggestion=${metadataStats.bySeverity.suggestion ?? 0}, ` +
    `by_agent={CR:${metadataStats.byAgent.CR ?? 0}, SA:${metadataStats.byAgent.SA ?? 0}, OB:${metadataStats.byAgent.OB ?? 0}}, ` +
    `cross_validated=${metadataStats.crossValidated}, suppressed=${metadataStats.suppressed}, duration=${reviewDurationMs}ms -->`;

  return [...sections, metadataFooter].join('\n\n');
}
