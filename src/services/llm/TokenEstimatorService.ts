import { countTokens as countCl100kTokens } from "gpt-tokenizer/encoding/cl100k_base";
import { countTokens as countO200kTokens } from "gpt-tokenizer";

type ProviderLike = "openai" | "claude" | "gemini" | "ollama" | "unknown";

/**
 * Estimates prompt token usage using a real tokenizer plus a conservative safety margin.
 */
export class TokenEstimatorService {
  estimateTextTokens(text: string, model?: string): number {
    if (!text) {
      return 0;
    }

    const provider = this.inferProvider(model);
    const baseCount = this.getBaseTokenCount(text, model, provider);
    const safetyMultiplier = this.getSafetyMultiplier(provider);

    return Math.ceil(baseCount * safetyMultiplier);
  }

  private getBaseTokenCount(
    text: string,
    model: string | undefined,
    provider: ProviderLike
  ): number {
    const normalizedModel = (model || "").toLowerCase();

    if (
      provider === "openai" &&
      (normalizedModel.startsWith("gpt-4") ||
        normalizedModel.startsWith("gpt-3.5"))
    ) {
      return countCl100kTokens(text);
    }

    const o200kCount = countO200kTokens(text);

    if (provider === "openai") {
      return o200kCount;
    }

    // Non-OpenAI providers do not expose a compatible tokenizer here, so we
    // take the larger count across modern OpenAI encodings as a safer proxy.
    return Math.max(o200kCount, countCl100kTokens(text));
  }

  private getSafetyMultiplier(provider: ProviderLike): number {
    switch (provider) {
      case "openai":
        return 1.08;
      case "claude":
      case "gemini":
        return 1.18;
      case "ollama":
        return 1.2;
      default:
        return 1.2;
    }
  }

  private inferProvider(model?: string): ProviderLike {
    const normalizedModel = (model || "").toLowerCase();

    if (
      normalizedModel.startsWith("gpt") ||
      normalizedModel.startsWith("o1") ||
      normalizedModel.startsWith("o3") ||
      normalizedModel.startsWith("o4")
    ) {
      return "openai";
    }

    if (normalizedModel.startsWith("claude")) {
      return "claude";
    }

    if (normalizedModel.startsWith("gemini")) {
      return "gemini";
    }

    return "unknown";
  }
}
