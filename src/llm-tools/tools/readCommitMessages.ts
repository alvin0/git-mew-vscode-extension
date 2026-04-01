import { FunctionCall, ToolExecuteResponse, ToolOptional } from '../toolInterface';

const DEFAULT_MAX_COUNT = 12;
const MAX_BODY_CHARS = 280;

function trimCommitBody(body: string): string {
  if (!body) {
    return '';
  }

  const normalized = body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ');

  if (normalized.length <= MAX_BODY_CHARS) {
    return normalized;
  }

  return normalized.slice(0, MAX_BODY_CHARS) + '...';
}

/**
 * Tool to read commit messages introduced by a merged branch.
 * Useful for Review Merged Branch so agents can infer intent and sequencing,
 * not just the final squashed state reflected by the diff.
 */
export const readCommitMessagesTool: FunctionCall = {
  id: 'read_commit_messages',
  functionCalling: {
    type: 'function',
    function: {
      name: 'read_commit_messages',
      description: 'Read commit messages introduced by the merged branch represented by a merge commit. Use this in Review Merged Branch to understand intent, sequencing, and scope beyond the final diff.',
      parameters: {
        type: 'object',
        properties: {
          mergeCommitSha: {
            type: 'string',
            description: 'Optional merge commit SHA or git ref to inspect. Defaults to the current merged-branch review commit when available.',
          },
          maxCount: {
            type: 'number',
            description: 'Maximum number of commits to return, ordered oldest to newest. Default is 12, capped at 50.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  execute: async (
    args: { mergeCommitSha?: string; maxCount?: number },
    optional?: ToolOptional
  ): Promise<ToolExecuteResponse> => {
    const gitService = optional?.gitService;
    if (!gitService || typeof gitService.getMergedBranchCommitMessages !== 'function') {
      return {
        error: 'Git service unavailable',
        description: 'Merged branch commit history is unavailable because the git service was not provided.',
        contentType: 'text',
      };
    }

    const mergeCommitSha = args.mergeCommitSha?.trim() || optional?.compareBranch?.trim();
    if (!mergeCommitSha) {
      return {
        error: 'Missing merge commit SHA',
        description: 'Provide a merge commit SHA, or use this tool inside a merged-branch review where the merge commit is already known.',
        contentType: 'text',
      };
    }

    const maxCount = Number.isFinite(args.maxCount)
      ? Math.max(1, Math.min(50, Math.floor(args.maxCount!)))
      : DEFAULT_MAX_COUNT;

    try {
      const commits = await gitService.getMergedBranchCommitMessages(mergeCommitSha, maxCount);
      if (!commits || commits.length === 0) {
        return {
          description:
            `[read_commit_messages] No merged-branch commits were found for ${mergeCommitSha}. ` +
            `The merge may not contain separate branch commits, or the history could not be resolved.`,
          contentType: 'text',
        };
      }

      const formattedCommits = commits.map((commit: {
        commitSha: string;
        authoredAt: Date;
        author: string;
        subject: string;
        body: string;
      }, index: number) => {
        const lines = [
          `${index + 1}. ${commit.commitSha.slice(0, 12)} | ${commit.authoredAt.toISOString()} | ${commit.author}`,
          `   Subject: ${commit.subject || '(no subject)'}`,
        ];

        const trimmedBody = trimCommitBody(commit.body);
        if (trimmedBody) {
          lines.push(`   Body: ${trimmedBody}`);
        }

        return lines.join('\n');
      }).join('\n');

      return {
        description:
          `[read_commit_messages] ${commits.length} commits introduced by merged branch ${mergeCommitSha} ` +
          `(oldest to newest):\n\n${formattedCommits}\n\n` +
          `Use these commit messages to infer intent, staging, and why the final diff looks the way it does.`,
        contentType: 'text',
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        description: `Failed to read merged-branch commit messages: ${error instanceof Error ? error.message : String(error)}`,
        contentType: 'text',
      };
    }
  },
};
