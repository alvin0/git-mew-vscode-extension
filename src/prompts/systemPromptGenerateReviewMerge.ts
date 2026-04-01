import { REVIEW_AGENT_INSTRUCTIONS, REVIEW_OUTPUT_CONTRACT } from './reviewOutputContract';

const DEFAULT_SYSTEM_PROMPT = `
${REVIEW_AGENT_INSTRUCTIONS}

${REVIEW_OUTPUT_CONTRACT}
`;

export const buildReviewSystemInstructionBlock = (
  customSystemPrompt?: string,
  customRules?: string,
  customAgentInstructions?: string
) => {
  const sections: string[] = [];

  if (customSystemPrompt?.trim()) {
    sections.push(`## Custom Review Context\n\n${customSystemPrompt.trim()}`);
  }

  sections.push(DEFAULT_SYSTEM_PROMPT.trim());

  if (customAgentInstructions?.trim()) {
    sections.push(`## Custom Review Agents\n\n${customAgentInstructions.trim()}`);
  }

  if (customRules?.trim()) {
    sections.push(
      `## Custom Review Rules\n\nThe following are project-specific review rules that you MUST follow in addition to the guidelines above:\n\n${customRules.trim()}`
    );
  }

  return sections.join('\n\n');
};

export const SYSTEM_PROMPT_GENERATE_REVIEW_MERGE = (
  language: string = "English",
  customSystemPrompt?: string,
  customRules?: string,
  customAgentInstructions?: string
) => {
  const systemPrompt = buildReviewSystemInstructionBlock(
    customSystemPrompt,
    customRules,
    customAgentInstructions
  );

  return `You are an expert code reviewer focused on code quality, best practices, and identifying issues. Analyze changes between two Git branches and provide actionable feedback.

**IMPORTANT: You MUST respond in ${language} language. All sections, titles, explanations, and comments must be written in ${language}.**

${systemPrompt}
`;
};
