import { ILLMAdapter } from "../../../llm-adapter";
import { ChunkAnalysis, ContextGenerationRequest, DiffChunk, DiffChunkEntry, UnifiedDiffFile } from "../contextTypes";
import { TokenEstimatorService } from "../TokenEstimatorService";
import { TaskExecutionProfile } from "./orchestratorTypes";

export class DiffChunkBuilder {
  constructor(private readonly tokenEstimator: TokenEstimatorService) {}

  estimateTokens(text: string, model?: string): number {
    return this.tokenEstimator.estimateTextTokens(text, model) + 32;
  }

  buildChunks(
    files: UnifiedDiffFile[],
    maxChunkTokens: number,
    model?: string
  ): DiffChunk[] {
    if (files.length === 0) {
      return [];
    }

    const chunkEntries = files.flatMap((file) =>
      this.splitFileIntoEntries(file, maxChunkTokens, model)
    );

    const chunks: DiffChunk[] = [];
    let currentEntries: DiffChunkEntry[] = [];
    let currentTokens = 0;
    let chunkIndex = 1;

    for (const entry of chunkEntries) {
      if (currentEntries.length > 0 && currentTokens + entry.estimatedTokens > maxChunkTokens) {
        chunks.push({
          id: `chunk-${chunkIndex++}`,
          files: currentEntries,
          estimatedTokens: currentTokens,
        });
        currentEntries = [];
        currentTokens = 0;
      }

      currentEntries.push(entry);
      currentTokens += entry.estimatedTokens;
    }

    if (currentEntries.length > 0) {
      chunks.push({
        id: `chunk-${chunkIndex}`,
        files: currentEntries,
        estimatedTokens: currentTokens,
      });
    }

    return chunks;
  }

  private splitFileIntoEntries(
    file: UnifiedDiffFile,
    maxChunkTokens: number,
    model?: string
  ): DiffChunkEntry[] {
    const fullEntry = this.createEntry(file, file.diff, undefined, model);
    if (file.isBinary || fullEntry.estimatedTokens <= maxChunkTokens) {
      return [fullEntry];
    }

    const { header, hunks } = this.extractDiffHeaderAndHunks(file.diff);
    if (hunks.length === 0) {
      return this.splitTextIntoEntries(file, file.diff, maxChunkTokens, "part", model);
    }

    const entries: DiffChunkEntry[] = [];
    let partIndex = 1;
    const normalizedHeader = header ? `${header}\n` : "";

    for (const hunk of hunks) {
      const hunkContent = `${normalizedHeader}${hunk}`.trimEnd();
      const hunkEntry = this.createEntry(file, hunkContent, `hunk-${partIndex}`, model);
      if (hunkEntry.estimatedTokens <= maxChunkTokens) {
        entries.push(hunkEntry);
        partIndex += 1;
        continue;
      }

      const splitEntries = this.splitHunkIntoEntries(
        file, normalizedHeader, hunk, maxChunkTokens, partIndex, model
      );
      entries.push(...splitEntries);
      partIndex += splitEntries.length;
    }

    return entries;
  }

  private splitTextIntoEntries(
    file: UnifiedDiffFile,
    text: string,
    maxChunkTokens: number,
    labelPrefix: string,
    model?: string
  ): DiffChunkEntry[] {
    const maxChars = Math.max(400, (maxChunkTokens - 64) * 4);
    const lines = text.split("\n");
    const segments: DiffChunkEntry[] = [];
    let currentLines: string[] = [];
    let partIndex = 1;

    const flush = () => {
      if (currentLines.length === 0) { return; }
      const content = currentLines.join("\n").trimEnd();
      segments.push(this.createEntry(file, content, `${labelPrefix}-${partIndex++}`, model));
      currentLines = [];
    };

    for (const line of lines) {
      const nextText = [...currentLines, line].join("\n");
      if (this.estimateTokens(nextText, model) > maxChunkTokens || nextText.length > maxChars) {
        flush();
      }
      currentLines.push(line);
    }

    flush();
    return segments;
  }

  private splitHunkIntoEntries(
    file: UnifiedDiffFile,
    header: string,
    hunk: string,
    maxChunkTokens: number,
    startIndex: number,
    model?: string
  ): DiffChunkEntry[] {
    const lines = hunk.split("\n");
    const hunkHeader = lines[0] ?? "";
    const bodyLines = lines.slice(1);
    const entries: DiffChunkEntry[] = [];
    const maxChars = Math.max(
      400,
      (maxChunkTokens - this.estimateTokens(header, model) - 64) * 4
    );
    let currentLines: string[] = [];
    let partIndex = startIndex;

    const flush = () => {
      if (currentLines.length === 0) { return; }
      const content = `${header}${hunkHeader}\n${currentLines.join("\n")}`.trimEnd();
      entries.push(this.createEntry(file, content, `segment-${partIndex++}`, model));
      currentLines = [];
    };

    for (const line of bodyLines) {
      const nextLines = [...currentLines, line];
      const nextContent = `${header}${hunkHeader}\n${nextLines.join("\n")}`.trimEnd();
      if (this.estimateTokens(nextContent, model) > maxChunkTokens || nextContent.length > maxChars) {
        flush();
      }
      currentLines.push(line);
    }

    flush();
    return entries;
  }

  private extractDiffHeaderAndHunks(diff: string): { header: string; hunks: string[] } {
    const lines = diff.split("\n");
    const headerLines: string[] = [];
    const hunks: string[] = [];
    let currentHunk: string[] = [];
    let inHunk = false;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        if (currentHunk.length > 0) {
          hunks.push(currentHunk.join("\n"));
          currentHunk = [];
        }
        inHunk = true;
      }
      if (inHunk) {
        currentHunk.push(line);
      } else {
        headerLines.push(line);
      }
    }

    if (currentHunk.length > 0) {
      hunks.push(currentHunk.join("\n"));
    }

    return { header: headerLines.join("\n").trimEnd(), hunks };
  }

  private createEntry(
    file: UnifiedDiffFile,
    content: string,
    segmentLabel?: string,
    model?: string
  ): DiffChunkEntry {
    return {
      file,
      content,
      segmentLabel,
      estimatedTokens: this.estimateTokens(content, model) + 32,
    };
  }

  describeChunk(chunk: DiffChunk): string {
    const fileLabels = chunk.files.map((entry) =>
      entry.segmentLabel
        ? `${entry.file.relativePath} (${entry.segmentLabel})`
        : entry.file.relativePath
    );
    return Array.from(new Set(fileLabels)).join(", ");
  }
}
