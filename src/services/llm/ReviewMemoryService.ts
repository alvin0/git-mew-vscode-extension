import * as vscode from 'vscode';
import { createHash, randomUUID } from 'crypto';
import {
  CodeReviewerOutput,
  ObserverOutput,
  SecurityAnalystOutput,
  StructuredAgentReport,
} from './orchestrator/orchestratorTypes';
import {
  FindingSignature,
  MemoryStats,
  PatternEntry,
  ResolutionAction,
  ResolutionRecord,
  ReviewSummary,
  SuppressedFinding,
} from './reviewMemoryTypes';

type StorageLike = Pick<vscode.Memento, 'get' | 'update'>;

type StoredCacheStats = {
  hits: number;
  misses: number;
};

type PatternDecayState = {
  lastDecayAt: number;
};

type PatternCandidate = {
  description: string;
  category: PatternEntry['category'];
  filePattern: string;
  severity: string;
  sourceAgent: string;
};

class InMemoryStorage implements StorageLike {
  private readonly store = new Map<string, unknown>();

  get<T>(key: string, defaultValue?: T): T | undefined {
    if (!this.store.has(key)) {
      return defaultValue;
    }
    return this.store.get(key) as T;
  }

  update(key: string, value: unknown): Thenable<void> {
    if (value === undefined) {
      this.store.delete(key);
    } else {
      this.store.set(key, value);
    }
    return Promise.resolve();
  }
}

export class ReviewMemoryService {
  private static readonly KEY_PREFIX = 'gitmew.reviewMemory.';
  private static readonly KNOWN_SUFFIXES = [
    'patterns',
    'patternDecayState',
    'suppressed',
    'reviews',
    'resolutions',
    'cacheStats',
  ] as const;
  private static readonly MAX_SUPPRESSED_FINDINGS = 200;
  private static readonly MAX_RESOLUTION_RECORDS = 1000;

  private readonly storage: StorageLike;

  constructor(storage?: vscode.Memento | null) {
    if (storage) {
      this.storage = storage;
    } else {
      this.storage = new InMemoryStorage();
      console.warn('[ReviewMemory] workspaceState unavailable, using in-memory fallback');
    }

    void this.validateAndRepair();
  }

  private key(suffix: string): string {
    return ReviewMemoryService.KEY_PREFIX + suffix;
  }

  private async read<T>(suffix: string): Promise<T | undefined> {
    const raw = this.storage.get<unknown>(this.key(suffix));
    if (raw === undefined) {
      return undefined;
    }

    try {
      if (typeof raw === 'string') {
        return JSON.parse(raw) as T;
      }
      return raw as T;
    } catch (error) {
      console.warn(`[ReviewMemory] corrupted entry for ${suffix}, clearing`, error);
      await this.storage.update(this.key(suffix), undefined);
      return undefined;
    }
  }

  private async write<T>(suffix: string, data: T): Promise<void> {
    await this.storage.update(this.key(suffix), JSON.stringify(data));
  }

  async getPatterns(changedFileGlobs: string[]): Promise<PatternEntry[]> {
    const patterns = (await this.read<PatternEntry[]>('patterns')) ?? [];
    const relevant = patterns.filter((pattern) =>
      changedFileGlobs.length === 0 ||
      pattern.filePatterns.some((filePattern) =>
        changedFileGlobs.some((changedFile) => this.globMatch(changedFile, filePattern)),
      ),
    );

    return relevant
      .sort((a, b) => this.patternScore(b) - this.patternScore(a))
      .slice(0, 10);
  }

  async savePatterns(agentOutputs: StructuredAgentReport[]): Promise<void> {
    const existing = (await this.read<PatternEntry[]>('patterns')) ?? [];
    const now = Date.now();

    for (const candidate of this.extractPatternCandidates(agentOutputs)) {
      const match = existing.find((pattern) =>
        pattern.category === candidate.category &&
        pattern.filePatterns.some((filePattern) => this.globMatch(candidate.filePattern, filePattern)) &&
        this.wordOverlapRatio(pattern.description, candidate.description) >= 0.7,
      );

      if (match) {
        match.frequencyCount += 1;
        match.lastSeen = now;
        match.description = match.description.length >= candidate.description.length
          ? match.description
          : candidate.description;
        match.filePatterns = [...new Set([...match.filePatterns, candidate.filePattern])];
        match.averageSeverity = this.pickMoreSevere(match.averageSeverity, candidate.severity);
        match.sourceAgents = [...new Set([...match.sourceAgents, candidate.sourceAgent])];
        continue;
      }

      existing.push({
        id: randomUUID(),
        description: candidate.description,
        category: candidate.category,
        frequencyCount: 1,
        firstSeen: now,
        lastSeen: now,
        filePatterns: [candidate.filePattern],
        averageSeverity: candidate.severity,
        sourceAgents: [candidate.sourceAgent],
      });
    }

    const trimmed = existing
      .sort((a, b) => this.patternScore(b) - this.patternScore(a))
      .slice(0, 50);

    await this.write('patterns', trimmed);
  }

  async decayPatterns(): Promise<void> {
    const decayState = (await this.read<PatternDecayState>('patternDecayState')) ?? { lastDecayAt: 0 };
    const now = Date.now();
    if (now - decayState.lastDecayAt < 24 * 60 * 60 * 1000) {
      return;
    }

    const patterns = (await this.read<PatternEntry[]>('patterns')) ?? [];
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;

    const decayed = patterns
      .map((pattern) => {
        if (pattern.lastSeen >= cutoff) {
          return pattern;
        }
        return {
          ...pattern,
          frequencyCount: pattern.frequencyCount * 0.5,
        };
      })
      .filter((pattern) => pattern.frequencyCount >= 1);

    await this.write('patterns', decayed);
    await this.write('patternDecayState', { lastDecayAt: now });
  }

  async getSuppressedFindings(): Promise<SuppressedFinding[]> {
    return (await this.read<SuppressedFinding[]>('suppressed')) ?? [];
  }

  async suppressFinding(finding: SuppressedFinding): Promise<void> {
    const suppressed = await this.getSuppressedFindings();
    const normalizedDescription = finding.normalizedDescription
      ?? (finding.description ? this.normalize(finding.description) : undefined)
      ?? this.normalize(finding.dismissReason ?? '');
    suppressed.push({
      ...finding,
      normalizedDescription,
    });

    const trimmed = suppressed
      .sort((a, b) => b.dismissedAt - a.dismissedAt)
      .slice(0, ReviewMemoryService.MAX_SUPPRESSED_FINDINGS);

    await this.write('suppressed', trimmed);
  }

  async isFindingSuppressed(signature: FindingSignature): Promise<boolean> {
    const suppressed = await this.getSuppressedFindings();
    const normalizedDescription = this.normalize(signature.description);
    const descriptionHash = this.sha256(normalizedDescription);

    return suppressed.some((entry) => {
      if (!this.globMatch(signature.file, entry.filePattern)) {
        return false;
      }
      if (signature.category !== entry.issueCategory) {
        return false;
      }
      if (entry.descriptionHash === descriptionHash) {
        return true;
      }
      if (!entry.normalizedDescription) {
        return false;
      }
      return this.wordOverlapRatio(normalizedDescription, entry.normalizedDescription) >= 0.7;
    });
  }

  async getReviewHistory(limit: number = 20): Promise<ReviewSummary[]> {
    const reviews = (await this.read<ReviewSummary[]>('reviews')) ?? [];
    return reviews
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  async saveReviewSummary(summary: ReviewSummary): Promise<void> {
    const reviews = (await this.read<ReviewSummary[]>('reviews')) ?? [];
    reviews.push(summary);
    const trimmed = reviews
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
    await this.write('reviews', trimmed);
  }

  async getRelevantHistory(changedFiles: string[], limit: number): Promise<ReviewSummary[]> {
    const reviews = await this.getReviewHistory(20);
    return reviews
      .filter((review) => review.changedFiles.some((file) => changedFiles.includes(file)))
      .slice(0, limit);
  }

  async recordResolution(
    findingId: string,
    action: ResolutionAction,
    reviewId: string,
  ): Promise<void> {
    const records = (await this.read<ResolutionRecord[]>('resolutions')) ?? [];
    records.push({
      findingId,
      action,
      reviewId,
      timestamp: Date.now(),
    });
    const trimmed = records
      .map((record, index) => ({ record, index }))
      .sort((a, b) => b.record.timestamp - a.record.timestamp || b.index - a.index)
      .map(({ record }) => record)
      .slice(0, ReviewMemoryService.MAX_RESOLUTION_RECORDS);
    await this.write('resolutions', trimmed);
  }

  async getResolutionRate(): Promise<number> {
    const records = (await this.read<ResolutionRecord[]>('resolutions')) ?? [];
    if (records.length === 0) {
      return 0;
    }

    const positive = records.filter(
      (record) => record.action === 'resolved' || record.action === 'acknowledged',
    ).length;
    return positive / records.length;
  }

  async getAgentResolutionRates(): Promise<Record<string, number>> {
    const records = (await this.read<ResolutionRecord[]>('resolutions')) ?? [];
    const grouped = new Map<string, ResolutionRecord[]>();

    for (const record of records) {
      const agent = record.findingId.split(':', 1)[0] || 'unknown';
      const bucket = grouped.get(agent) ?? [];
      bucket.push(record);
      grouped.set(agent, bucket);
    }

    const result: Record<string, number> = {};
    for (const [agent, bucket] of grouped) {
      const positive = bucket.filter(
        (record) => record.action === 'resolved' || record.action === 'acknowledged',
      ).length;
      result[agent] = bucket.length === 0 ? 0 : positive / bucket.length;
    }
    return result;
  }

  async getHistoricalDismissRates(): Promise<Record<string, number>> {
    const records = (await this.read<ResolutionRecord[]>('resolutions')) ?? [];
    const counters = new Map<string, { dismissed: number; total: number }>();

    for (const record of records) {
      const parts = record.findingId.split(':');
      if (parts.length < 3) {
        continue;
      }
      const key = `${parts[1]}:${parts[2]}`;
      const current = counters.get(key) ?? { dismissed: 0, total: 0 };
      current.total += 1;
      if (record.action === 'dismissed') {
        current.dismissed += 1;
      }
      counters.set(key, current);
    }

    const suppressed = await this.getSuppressedFindings();
    for (const finding of suppressed) {
      const key = `${finding.issueCategory}:${finding.filePattern}`;
      const current = counters.get(key) ?? { dismissed: 0, total: 0 };
      current.dismissed += 1;
      current.total += 1;
      counters.set(key, current);
    }

    const result: Record<string, number> = {};
    for (const [key, value] of counters) {
      result[key] = value.total === 0 ? 0 : value.dismissed / value.total;
    }
    return result;
  }

  async clear(): Promise<void> {
    await Promise.all(
      ReviewMemoryService.KNOWN_SUFFIXES.map((suffix) =>
        this.storage.update(this.key(suffix), undefined),
      ),
    );
  }

  async getStats(): Promise<MemoryStats> {
    const patterns = (await this.read<PatternEntry[]>('patterns')) ?? [];
    const suppressed = await this.getSuppressedFindings();
    const reviews = await this.getReviewHistory(20);
    const cacheStats = (await this.read<StoredCacheStats>('cacheStats')) ?? { hits: 0, misses: 0 };
    const reviewRates = reviews
      .map((review) => review.resolutionRate)
      .filter((rate): rate is number => typeof rate === 'number');

    return {
      totalPatterns: patterns.length,
      totalSuppressedFindings: suppressed.length,
      cacheHitRate:
        cacheStats.hits + cacheStats.misses === 0
          ? 0
          : cacheStats.hits / (cacheStats.hits + cacheStats.misses),
      totalReviewsStored: reviews.length,
      averageResolutionRate:
        reviewRates.length === 0
          ? await this.getResolutionRate()
          : reviewRates.reduce((sum, value) => sum + value, 0) / reviewRates.length,
    };
  }

  async validateAndRepair(): Promise<void> {
    for (const suffix of ReviewMemoryService.KNOWN_SUFFIXES) {
      await this.read(suffix);
    }
  }

  private extractPatternCandidates(agentOutputs: StructuredAgentReport[]): PatternCandidate[] {
    const candidates: PatternCandidate[] = [];

    for (const output of agentOutputs) {
      if (output.role === 'Code Reviewer') {
        const structured = output.structured as CodeReviewerOutput;
        for (const issue of structured.issues ?? []) {
          if (!issue.description || !issue.file) { continue; }
          candidates.push({
            description: issue.description,
            category: issue.category,
            filePattern: this.toFilePattern(issue.file),
            severity: issue.severity,
            sourceAgent: output.role,
          });
        }
      }

      if (output.role === 'Security Analyst') {
        const structured = output.structured as SecurityAnalystOutput;
        for (const vulnerability of structured.vulnerabilities ?? []) {
          if (!vulnerability.description || !vulnerability.file) { continue; }
          candidates.push({
            description: `${vulnerability.cweId}: ${vulnerability.description}`,
            category: 'security',
            filePattern: this.toFilePattern(vulnerability.file),
            severity: vulnerability.severity,
            sourceAgent: output.role,
          });
        }
      }

      if (output.role === 'Observer') {
        const structured = output.structured as ObserverOutput;
        for (const risk of structured.risks ?? []) {
          if (!risk.description || !risk.affectedArea) { continue; }
          candidates.push({
            description: risk.description,
            category: this.inferObserverCategory(risk.description),
            filePattern: this.toFilePattern(risk.affectedArea),
            severity: risk.severity,
            sourceAgent: output.role,
          });
        }
      }
    }

    return candidates;
  }

  private patternScore(pattern: PatternEntry): number {
    const daysSinceLastSeen = Math.max(1, (Date.now() - pattern.lastSeen) / (24 * 60 * 60 * 1000));
    return pattern.frequencyCount * (1 / daysSinceLastSeen);
  }

  private pickMoreSevere(left: string, right: string): string {
    const rank = new Map<string, number>([
      ['critical', 4],
      ['high', 4],
      ['major', 3],
      ['medium', 2],
      ['minor', 1],
      ['low', 1],
      ['suggestion', 0],
    ]);
    return (rank.get(left) ?? 0) >= (rank.get(right) ?? 0) ? left : right;
  }

  private inferObserverCategory(description: string): PatternEntry['category'] {
    const normalized = description.toLowerCase();
    if (normalized.includes('security') || normalized.includes('auth')) {
      return 'security';
    }
    if (normalized.includes('performance') || normalized.includes('latency')) {
      return 'performance';
    }
    if (normalized.includes('test')) {
      return 'testing';
    }
    if (normalized.includes('maintain') || normalized.includes('readability')) {
      return 'maintainability';
    }
    return 'correctness';
  }

  private normalize(desc: string): string {
    return (desc ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private sha256(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  private wordOverlapRatio(a: string, b: string): number {
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

  private globMatch(path: string, pattern: string): boolean {
    const regex = this.globToRegExp(pattern);
    return regex.test(path);
  }

  private globToRegExp(pattern: string): RegExp {
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

  private toFilePattern(filePath: string): string {
    if (!filePath) {
      return '**/*';
    }
    const normalized = filePath.replace(/\\/g, '/');
    const parts = normalized.split('/');
    const fileName = parts.pop() ?? normalized;
    const extensionMatch = fileName.match(/(\.[a-z0-9]+)$/i);
    const extension = extensionMatch?.[1] ?? '';
    const directory = parts.join('/');

    if (!directory) {
      return extension ? `**/*${extension}` : '**/*';
    }

    return extension ? `${directory}/**/*${extension}` : `${directory}/**/*`;
  }
}
