import { REVIEW_AGENT_INSTRUCTIONS, REVIEW_OUTPUT_CONTRACT } from './reviewOutputContract';

const DEFAULT_SYSTEM_PROMPT = `
${REVIEW_AGENT_INSTRUCTIONS}

${REVIEW_OUTPUT_CONTRACT}
`;

export const SYSTEM_PROMPT_GENERATE_REVIEW_MERGE = (
  language: string = "English",
  customSystemPrompt?: string,
  customRules?: string,
  customAgentInstructions?: string
) => {
  const systemPrompt = customSystemPrompt || DEFAULT_SYSTEM_PROMPT;

  let prompt = `You are an expert code reviewer focused on code quality, best practices, and identifying issues. Analyze changes between two Git branches and provide actionable feedback.

**IMPORTANT: You MUST respond in ${language} language. All sections, titles, explanations, and comments must be written in ${language}.**

${systemPrompt}
`;

  if (customAgentInstructions) {
    prompt += `\n\n## Custom Review Agents\n\n${customAgentInstructions}\n`;
  }

  // Append custom rules if provided
  if (customRules) {
    prompt += `\n\n## Custom Review Rules\n\nThe following are project-specific review rules that you MUST follow in addition to the guidelines above:\n\n${customRules}\n`;
  }

  return prompt;
};
