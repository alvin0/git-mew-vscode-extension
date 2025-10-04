/**
 * File Type Detector Service
 * Detects whether file content is text or binary/encoded
 */

export interface FileTypeResult {
  isText: boolean;
  isBinary: boolean;
  encoding?: string;
  mimeType?: string;
  extension?: string;
  confidence: number; // 0-1 confidence score
  reason: string;
}

export interface FileAnalysis {
  hasNullBytes: boolean;
  nonPrintableRatio: number;
  utf8Valid: boolean;
  asciiRatio: number;
  controlCharRatio: number;
  averageLineLength: number;
  hasCommonTextPatterns: boolean;
}

/**
 * Common text file extensions
 */
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".json",
  ".xml",
  ".html",
  ".htm",
  ".css",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".php",
  ".rb",
  ".go",
  ".rs",
  ".sql",
  ".sh",
  ".bat",
  ".ps1",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".log",
  ".csv",
  ".tsv",
  ".gitignore",
  ".gitattributes",
  ".dockerfile",
  ".env",
]);

/**
 * Common binary file extensions
 */
const BINARY_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".bz2",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".tiff",
  ".ico",
  ".svg",
  ".mp3",
  ".wav",
  ".flac",
  ".ogg",
  ".mp4",
  ".avi",
  ".mkv",
  ".mov",
  ".wmv",
  ".webm",
  ".webp",
  ".ttf",
  ".otf",
  ".woff",
  ".woff2",
]);

/**
 * Magic bytes for common binary formats
 */
const BINARY_SIGNATURES = [
  {
    signature: [0x25, 0x50, 0x44, 0x46],
    type: "application/pdf",
    description: "PDF",
  },
  {
    signature: [0x50, 0x4b, 0x03, 0x04],
    type: "application/zip",
    description: "ZIP/Office",
  },
  {
    signature: [0x50, 0x4b, 0x05, 0x06],
    type: "application/zip",
    description: "ZIP/Office",
  },
  {
    signature: [0x50, 0x4b, 0x07, 0x08],
    type: "application/zip",
    description: "ZIP/Office",
  },
  { signature: [0xff, 0xd8, 0xff], type: "image/jpeg", description: "JPEG" },
  {
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    type: "image/png",
    description: "PNG",
  },
  {
    signature: [0x47, 0x49, 0x46, 0x38],
    type: "image/gif",
    description: "GIF",
  },
  { signature: [0x42, 0x4d], type: "image/bmp", description: "BMP" },
  {
    signature: [0x7f, 0x45, 0x4c, 0x46],
    type: "application/octet-stream",
    description: "ELF",
  },
  {
    signature: [0x4d, 0x5a],
    type: "application/octet-stream",
    description: "EXE",
  },
  {
    signature: [0xca, 0xfe, 0xba, 0xbe],
    type: "application/octet-stream",
    description: "Java Class",
  },
  {
    signature: [0xfe, 0xed, 0xfa, 0xce],
    type: "application/octet-stream",
    description: "Mach-O",
  },
  {
    signature: [0xfe, 0xed, 0xfa, 0xcf],
    type: "application/octet-stream",
    description: "Mach-O",
  },
];

/**
 * Common text patterns that indicate text content
 */
const TEXT_PATTERNS = [
  /^[\x20-\x7E\s]*$/, // ASCII printable + whitespace
  /^[\u0000-\u007F]*$/, // ASCII
  /^\s*[\{\[\<]/, // Starts with JSON/XML/HTML bracket
  /^\s*#/, // Starts with comment
  /^\s*\/\//, // Starts with comment
  /^\s*\/\*/, // Starts with comment block
  /^#!/, // Shebang
  /^\s*<\?xml/, // XML declaration
  /^\s*<!DOCTYPE/, // HTML doctype
  /^\s*function\s+\w+/, // Function declaration
  /^\s*class\s+\w+/, // Class declaration
  /^\s*(import|export|require)\s+/, // Module imports
  /^\s*(def|function|func|proc)\s+\w+/, // Function definitions
  /^\s*(public|private|protected)\s+/, // Access modifiers
  /^\s*\w+\s*[:=]\s*/, // Variable assignments
  /^\s*[A-Za-z_]\w*\s*\(/, // Function calls
  /\b(true|false|null|undefined|None|True|False)\b/, // Common literals
  /\b(if|else|for|while|do|switch|case|try|catch|finally)\b/, // Control structures
  /^\s*\d+\.\s+/, // Numbered lists
  /^\s*[-*+]\s+/, // Bullet lists
  /^\s*\|\s*.*\s*\|/, // Table format
];

/**
 * Enhanced text pattern detection
 */
const ADVANCED_TEXT_INDICATORS = [
  // Programming languages
  {
    pattern: /\b(console\.log|print|echo|puts)\b/,
    weight: 0.8,
    description: "Output statements",
  },
  {
    pattern: /\b(return|yield|throw|raise)\b/,
    weight: 0.7,
    description: "Control flow",
  },
  {
    pattern: /\b(int|str|bool|float|double|char|void)\b/,
    weight: 0.6,
    description: "Data types",
  },
  { pattern: /[{}();,]/, weight: 0.3, description: "Code syntax" },

  // Markup languages
  { pattern: /<\/?\w+[^>]*>/, weight: 0.8, description: "HTML/XML tags" },
  { pattern: /&\w+;/, weight: 0.5, description: "HTML entities" },

  // Data formats
  { pattern: /"[^"]*":\s*[^,}]+/, weight: 0.7, description: "JSON key-value" },
  { pattern: /^\s*\w+:\s*.*$/, weight: 0.4, description: "YAML/config format" },
  { pattern: /^\s*\[\w+\]/, weight: 0.5, description: "INI sections" },

  // Documentation
  { pattern: /^\s*#+\s+/, weight: 0.6, description: "Markdown headers" },
  {
    pattern: /\*\*[^*]+\*\*|\*[^*]+\*/,
    weight: 0.4,
    description: "Markdown emphasis",
  },
  {
    pattern: /\[[^\]]*\]\([^)]*\)/,
    weight: 0.5,
    description: "Markdown links",
  },

  // Common text patterns
  {
    pattern: /\b[A-Z][a-z]+\s+[A-Z][a-z]+/,
    weight: 0.3,
    description: "Proper nouns",
  },
  {
    pattern: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/,
    weight: 0.2,
    description: "Dates",
  },
  { pattern: /\b\w+@\w+\.\w+\b/, weight: 0.4, description: "Email addresses" },
  { pattern: /https?:\/\/\S+/, weight: 0.4, description: "URLs" },
];

export class FileTypeDetector {
  /**
   * Detects file type from ArrayBuffer content
   */
  static detectFromBuffer(
    buffer: ArrayBuffer,
    filename?: string,
    mimeType?: string
  ): FileTypeResult {
    const bytes = new Uint8Array(buffer);
    const extension = filename ? this.getExtension(filename) : undefined;

    // Quick checks first
    const quickResult = this.quickDetection(bytes, extension, mimeType);
    if (quickResult) {
      return quickResult;
    }

    // Detailed analysis
    const analysis = this.analyzeContent(bytes);
    return this.makeDecision(analysis, extension, mimeType);
  }

  /**
   * Detects file type from File object
   */
  static async detectFromFile(file: File): Promise<FileTypeResult> {
    const buffer = await file.arrayBuffer();
    return this.detectFromBuffer(buffer, file.name, file.type);
  }

  /**
   * Detects file type from Blob
   */
  static async detectFromBlob(
    blob: Blob,
    filename?: string
  ): Promise<FileTypeResult> {
    const buffer = await blob.arrayBuffer();
    return this.detectFromBuffer(buffer, filename, blob.type);
  }

  /**
   * Quick detection based on magic bytes and extensions
   */
  private static quickDetection(
    bytes: Uint8Array,
    extension?: string,
    mimeType?: string
  ): FileTypeResult | null {
    // Check magic bytes first (highest priority)
    for (const sig of BINARY_SIGNATURES) {
      if (this.matchesSignature(bytes, sig.signature)) {
        return {
          isText: false,
          isBinary: true,
          mimeType: sig.type,
          extension,
          confidence: 0.95,
          reason: `Detected ${sig.description} magic bytes`,
        };
      }
    }

    // Check for immediate binary indicators
    if (this.hasNullBytes(bytes)) {
      return {
        isText: false,
        isBinary: true,
        extension,
        mimeType,
        confidence: 0.95,
        reason: "Contains null bytes - definitely binary",
      };
    }

    // Check MIME type (more reliable than extension)
    if (mimeType) {
      if (
        mimeType.startsWith("text/") ||
        mimeType === "application/json" ||
        mimeType === "application/xml" ||
        mimeType === "application/javascript" ||
        mimeType === "application/x-sh" ||
        mimeType === "application/x-python"
      ) {
        return {
          isText: true,
          isBinary: false,
          encoding: "utf-8",
          mimeType,
          extension,
          confidence: 0.85,
          reason: `Text MIME type: ${mimeType}`,
        };
      }
      if (
        mimeType.startsWith("image/") ||
        mimeType.startsWith("video/") ||
        mimeType.startsWith("audio/") ||
        (mimeType.startsWith("application/") &&
          !mimeType.includes("json") &&
          !mimeType.includes("xml") &&
          !mimeType.includes("javascript"))
      ) {
        return {
          isText: false,
          isBinary: true,
          mimeType,
          extension,
          confidence: 0.85,
          reason: `Binary MIME type: ${mimeType}`,
        };
      }
    }

    // Check known extensions (but don't rely on them exclusively)
    if (extension) {
      const ext = extension.toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        return {
          isText: false,
          isBinary: true,
          extension,
          mimeType,
          confidence: 0.8,
          reason: `Known binary extension: ${ext}`,
        };
      }
      if (TEXT_EXTENSIONS.has(ext)) {
        // Don't immediately return - verify with content analysis
        // This allows us to catch fake text files
        const quickAnalysis = this.quickContentCheck(bytes);
        if (quickAnalysis.likelyBinary) {
          return {
            isText: false,
            isBinary: true,
            extension,
            mimeType,
            confidence: 0.9,
            reason: `Binary content despite text extension ${ext}: ${quickAnalysis.reason}`,
          };
        }
        // Boost confidence for known text extensions with good content
        return {
          isText: true,
          isBinary: false,
          encoding: "utf-8",
          extension,
          mimeType,
          confidence: 0.8,
          reason: `Known text extension ${ext} with valid content`,
        };
      }
    }

    return null;
  }

  /**
   * Quick content check for initial assessment
   */
  private static quickContentCheck(bytes: Uint8Array): {
    likelyBinary: boolean;
    reason: string;
  } {
    const sampleSize = Math.min(bytes.length, 1024); // Check first 1KB
    const sample = bytes.slice(0, sampleSize);

    let nonPrintableCount = 0;
    let controlCharCount = 0;

    for (let i = 0; i < sample.length; i++) {
      const byte = sample[i];

      // Allow common whitespace chars
      if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue;

      // Count problematic characters
      if (byte < 0x20 || byte === 0x7f) {
        controlCharCount++;
        if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) {
          nonPrintableCount++;
        }
      }
    }

    const nonPrintableRatio = nonPrintableCount / sample.length;
    const controlCharRatio = controlCharCount / sample.length;

    if (nonPrintableRatio > 0.1) {
      return {
        likelyBinary: true,
        reason: `high non-printable ratio: ${(nonPrintableRatio * 100).toFixed(
          1
        )}%`,
      };
    }

    if (controlCharRatio > 0.3) {
      return {
        likelyBinary: true,
        reason: `high control char ratio: ${(controlCharRatio * 100).toFixed(
          1
        )}%`,
      };
    }

    return { likelyBinary: false, reason: "content looks text-like" };
  }

  /**
   * Detailed content analysis
   */
  private static analyzeContent(bytes: Uint8Array): FileAnalysis {
    const sampleSize = Math.min(bytes.length, 8192); // Analyze first 8KB
    const sample = bytes.slice(0, sampleSize);

    let nonPrintableCount = 0;
    let asciiCount = 0;
    let controlCharCount = 0;
    let lineBreaks = 0;
    let lineLength = 0;
    let maxLineLength = 0;

    for (let i = 0; i < sample.length; i++) {
      const byte = sample[i];

      // Count different character types
      if (byte === 0x0a || byte === 0x0d) {
        // \n or \r
        lineBreaks++;
        maxLineLength = Math.max(maxLineLength, lineLength);
        lineLength = 0;
      } else {
        lineLength++;
      }

      if (byte >= 0x20 && byte <= 0x7e) {
        asciiCount++;
      } else if (
        byte < 0x20 &&
        byte !== 0x0a &&
        byte !== 0x0d &&
        byte !== 0x09
      ) {
        controlCharCount++;
        if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) {
          nonPrintableCount++;
        }
      } else if (byte > 0x7e) {
        // Extended ASCII or UTF-8
      }
    }

    const hasNullBytes = this.hasNullBytes(sample);
    const nonPrintableRatio = nonPrintableCount / sample.length;
    const asciiRatio = asciiCount / sample.length;
    const controlCharRatio = controlCharCount / sample.length;
    const averageLineLength =
      lineBreaks > 0
        ? (sample.length - lineBreaks) / lineBreaks
        : sample.length;

    // Check for UTF-8 validity
    const utf8Valid = this.isValidUTF8(sample);

    // Enhanced text pattern detection
    const text = new TextDecoder("utf-8", { fatal: false }).decode(
      sample.slice(0, 2048)
    );
    const hasCommonTextPatterns = this.analyzeTextPatterns(text);

    return {
      hasNullBytes,
      nonPrintableRatio,
      utf8Valid,
      asciiRatio,
      controlCharRatio,
      averageLineLength,
      hasCommonTextPatterns,
    };
  }

  /**
   * Enhanced text pattern analysis
   */
  private static analyzeTextPatterns(text: string): boolean {
    let totalWeight = 0;
    let matchedWeight = 0;

    // Check basic patterns
    for (const pattern of TEXT_PATTERNS) {
      if (pattern.test(text)) {
        matchedWeight += 1;
      }
      totalWeight += 1;
    }

    // Check advanced indicators
    for (const indicator of ADVANCED_TEXT_INDICATORS) {
      if (indicator.pattern.test(text)) {
        matchedWeight += indicator.weight;
      }
      totalWeight += indicator.weight;
    }

    // Also check for general text characteristics
    const words = text.match(/\w+/g) || [];
    const sentences = text.match(/[.!?]+/g) || [];
    const whitespaceRatio = (text.match(/\s/g) || []).length / text.length;

    // Boost score for natural text characteristics
    if (words.length > 10 && sentences.length > 0) {
      matchedWeight += 0.5; // Natural language bonus
    }

    if (whitespaceRatio > 0.1 && whitespaceRatio < 0.8) {
      matchedWeight += 0.3; // Reasonable whitespace ratio
    }

    // Check for programming/markup language indicators
    const hasCodeLikeStructure = /[\{\};\(\)\[\]]/.test(text);
    const hasMarkupStructure = /<[^>]+>/.test(text);
    const hasDataStructure = /[:"'\{\}\[\],]/.test(text);

    if (hasCodeLikeStructure || hasMarkupStructure || hasDataStructure) {
      matchedWeight += 0.4; // Structured text bonus
    }

    const confidence = totalWeight > 0 ? matchedWeight / totalWeight : 0;
    return confidence > 0.3; // Lower threshold for pattern matching
  }

  /**
   * Make final decision based on analysis
   */
  private static makeDecision(
    analysis: FileAnalysis,
    extension?: string,
    mimeType?: string
  ): FileTypeResult {
    let confidence = 0.5;
    let reason = "Content analysis";
    let isText = false;

    // Strong indicators of binary (highest priority)
    if (analysis.hasNullBytes) {
      return {
        isText: false,
        isBinary: true,
        extension,
        mimeType,
        confidence: 0.95,
        reason: "Contains null bytes - definitely binary",
      };
    }

    if (analysis.nonPrintableRatio > 0.3) {
      return {
        isText: false,
        isBinary: true,
        extension,
        mimeType,
        confidence: 0.9,
        reason: `High non-printable ratio: ${(
          analysis.nonPrintableRatio * 100
        ).toFixed(1)}%`,
      };
    }

    // Strong indicators of text
    if (analysis.utf8Valid && analysis.asciiRatio > 0.7) {
      isText = true;
      confidence = 0.8;
      reason = `Valid UTF-8 with ${(analysis.asciiRatio * 100).toFixed(
        1
      )}% ASCII`;
    } else if (analysis.hasCommonTextPatterns) {
      isText = true;
      confidence = 0.75;
      reason = "Contains common text patterns";
    } else if (analysis.utf8Valid && analysis.controlCharRatio < 0.1) {
      isText = true;
      confidence = 0.7;
      reason = "Valid UTF-8 with low control characters";
    } else if (analysis.averageLineLength < 200 && analysis.asciiRatio > 0.5) {
      isText = true;
      confidence = 0.65;
      reason = "Reasonable line length with decent ASCII ratio";
    }

    // Adjust confidence based on extension (but don't override strong indicators)
    if (extension && confidence < 0.9) {
      const ext = extension.toLowerCase();

      if (TEXT_EXTENSIONS.has(ext)) {
        if (isText) {
          confidence = Math.min(confidence + 0.15, 0.95);
          reason += ` (known text extension: ${ext})`;
        } else {
          // Unknown extension but content looks like text
          confidence = Math.max(confidence, 0.6);
          reason += ` (text extension ${ext} but questionable content)`;
        }
      } else if (BINARY_EXTENSIONS.has(ext)) {
        if (!isText) {
          confidence = Math.min(confidence + 0.15, 0.95);
          reason += ` (known binary extension: ${ext})`;
        } else {
          // This is suspicious - binary extension but text content
          confidence = Math.max(confidence - 0.2, 0.3);
          reason += ` (binary extension ${ext} but text-like content - suspicious)`;
        }
      } else {
        // Unknown extension - rely more on content analysis
        if (this.isLikelyTextExtension(ext)) {
          if (isText) {
            confidence = Math.min(confidence + 0.1, 0.9);
            reason += ` (likely text extension: ${ext})`;
          }
        } else if (this.isLikelyBinaryExtension(ext)) {
          if (!isText) {
            confidence = Math.min(confidence + 0.1, 0.9);
            reason += ` (likely binary extension: ${ext})`;
          } else {
            confidence = Math.max(confidence - 0.1, 0.4);
            reason += ` (likely binary extension ${ext} but text content)`;
          }
        } else {
          // Completely unknown extension
          reason += ` (unknown extension: ${ext})`;
        }
      }
    }

    // If still uncertain, use heuristics
    if (confidence < 0.6) {
      if (analysis.asciiRatio > 0.8 && analysis.nonPrintableRatio < 0.05) {
        isText = true;
        confidence = 0.65;
        reason = "High ASCII ratio with minimal non-printable chars";
      } else if (
        analysis.nonPrintableRatio > 0.1 ||
        analysis.controlCharRatio > 0.2
      ) {
        isText = false;
        confidence = 0.65;
        reason = "High ratio of problematic characters";
      }
    }

    return {
      isText,
      isBinary: !isText,
      encoding: isText && analysis.utf8Valid ? "utf-8" : undefined,
      extension,
      mimeType,
      confidence,
      reason,
    };
  }

  /**
   * Check if extension is likely to be text based on common patterns
   */
  private static isLikelyTextExtension(ext: string): boolean {
    // Common text file patterns
    const textPatterns = [
      /^\.(txt|text|md|markdown|readme)$/i,
      /^\.(json|xml|yaml|yml|toml|ini|cfg|conf)$/i,
      /^\.(html|htm|css|js|ts|jsx|tsx)$/i,
      /^\.(py|java|c|cpp|h|hpp|cs|php|rb|go|rs|swift)$/i,
      /^\.(sql|sh|bat|ps1|cmd|bash|zsh|fish)$/i,
      /^\.(log|csv|tsv|dat|config)$/i,
      /^\..*rc$/i, // .bashrc, .vimrc, etc.
      /^\.(env|gitignore|gitattributes|dockerignore)$/i,
    ];

    return textPatterns.some((pattern) => pattern.test(ext));
  }

  /**
   * Check if extension is likely to be binary based on common patterns
   */
  private static isLikelyBinaryExtension(ext: string): boolean {
    // Common binary file patterns
    const binaryPatterns = [
      /^\.(exe|dll|so|dylib|lib|a|o)$/i,
      /^\.(jpg|jpeg|png|gif|bmp|tiff|ico|webp|svg)$/i,
      /^\.(mp3|wav|flac|ogg|aac|mp4|avi|mkv|mov|wmv|webm)$/i,
      /^\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp)$/i,
      /^\.(zip|rar|7z|tar|gz|bz2|xz|lzma)$/i,
      /^\.(ttf|otf|woff|woff2|eot)$/i,
      /^\.(bin|dat|db|sqlite|mdb)$/i,
    ];

    return binaryPatterns.some((pattern) => pattern.test(ext));
  }

  /**
   * Check if bytes match a signature
   */
  private static matchesSignature(
    bytes: Uint8Array,
    signature: number[]
  ): boolean {
    if (bytes.length < signature.length) return false;

    for (let i = 0; i < signature.length; i++) {
      if (bytes[i] !== signature[i]) return false;
    }

    return true;
  }

  /**
   * Check for null bytes (strong indicator of binary)
   */
  private static hasNullBytes(bytes: Uint8Array): boolean {
    const sampleSize = Math.min(bytes.length, 8192);
    for (let i = 0; i < sampleSize; i++) {
      if (bytes[i] === 0) return true;
    }
    return false;
  }

  /**
   * Check if bytes form valid UTF-8
   */
  private static isValidUTF8(bytes: Uint8Array): boolean {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file extension from filename
   */
  private static getExtension(filename: string): string | undefined {
    const lastDot = filename.lastIndexOf(".");
    if (lastDot === -1 || lastDot === filename.length - 1) return undefined;
    return filename.slice(lastDot);
  }

  /**
   * Utility: Create a FileTypeResult for testing
   */
  static createResult(
    isText: boolean,
    confidence: number,
    reason: string,
    options: Partial<FileTypeResult> = {}
  ): FileTypeResult {
    return {
      isText,
      isBinary: !isText,
      confidence,
      reason,
      ...options,
    };
  }
}

// Export convenience functions
export const detectFileType = FileTypeDetector.detectFromBuffer;
export const detectFileTypeFromFile = FileTypeDetector.detectFromFile;
export const detectFileTypeFromBlob = FileTypeDetector.detectFromBlob;
