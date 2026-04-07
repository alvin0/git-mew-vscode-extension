import { createHash } from 'crypto';
import { StructuredAgentReport } from './orchestratorTypes';
import { SuppressedFinding } from '../reviewMemoryTypes';
import { SessionMemory } from './SessionMemory';

export interface SuppressionFilterInput {
  structuredReports: StructuredAgentReport[];
  suppressedFindings: SuppressedFinding[];
}

export interface SuppressionResult {
  suppressedCount: number;
  suppressedFindingIds: string[];
  filteredReports: StructuredAgentReport[];
}

export function normalize(text: string): string {
  return (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function wordOverlapRatio(a: string, b: string): number {
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

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function globToRegExp(pattern: string): RegExp {
  if (!pattern) {
    return new RegExp('^$');
  }

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

export function globMatch(path: string, pattern: string): boolean {
  return globToRegExp(pattern).test(path);
}

export function isSuppressed(
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

export class SuppressionFilter {
  static apply(input: SuppressionFilterInput): SuppressionResult {
    return this.applyToLegacyReports(input.structuredReports, input.suppressedFindings);
  }

  static applyToSessionMemory(
    sessionMemory: SessionMemory,
    suppressedFindings: SuppressedFinding[],
  ): SuppressionResult {
    const findings = sessionMemory.getFindings({ status: ['verified'] });
    const suppressedFindingIds: string[] = [];

    for (const finding of findings) {
      if (isSuppressed(finding.file, finding.category, finding.description, suppressedFindings)) {
        sessionMemory.transitionFindingStatus(finding.id, 'suppressed', 'suppression_filter');
        suppressedFindingIds.push(finding.id);
      }
    }

    return {
      suppressedCount: suppressedFindingIds.length,
      suppressedFindingIds,
      filteredReports: [],
    };
  }

  static applyToLegacyReports(
    reports: StructuredAgentReport[],
    suppressedFindings: SuppressedFinding[],
  ): SuppressionResult {
    let suppressedCount = 0;
    const suppressedFindingIds: string[] = [];

    const filteredReports = reports.map((report) => {
      switch (report.role) {
        case 'Code Reviewer': {
          const issues = report.structured.issues.filter((issue, index) => {
            const suppressed = isSuppressed(issue.file, issue.category, issue.description, suppressedFindings);
            if (suppressed) {
              suppressedCount += 1;
              suppressedFindingIds.push(`Code Reviewer:${index}`);
            }
            return !suppressed;
          });
          return {
            ...report,
            structured: {
              ...report.structured,
              issues,
            },
          };
        }
        case 'Security Analyst': {
          const vulnerabilities = report.structured.vulnerabilities.filter((finding, index) => {
            const suppressed = isSuppressed(finding.file, 'security', finding.description, suppressedFindings);
            if (suppressed) {
              suppressedCount += 1;
              suppressedFindingIds.push(`Security Analyst:${index}`);
            }
            return !suppressed;
          });
          return {
            ...report,
            structured: {
              ...report.structured,
              vulnerabilities,
            },
          };
        }
        case 'Observer': {
          const risks = report.structured.risks.filter((risk, index) => {
            const suppressed = isSuppressed(risk.affectedArea, 'correctness', risk.description, suppressedFindings);
            if (suppressed) {
              suppressedCount += 1;
              suppressedFindingIds.push(`Observer:${index}`);
            }
            return !suppressed;
          });
          return {
            ...report,
            structured: {
              ...report.structured,
              risks,
            },
          };
        }
        case 'Flow Diagram':
          return report;
        default:
          return report;
      }
    });

    return {
      suppressedCount,
      suppressedFindingIds,
      filteredReports,
    };
  }
}
