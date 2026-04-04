/**
 * Template variable interpolation for .gitmew custom rule files.
 *
 * Supported variables:
 *   {{branch}}         - current branch name
 *   {{baseBranch}}     - base branch (review merge only)
 *   {{compareBranch}}  - compare branch (review merge only)
 *   {{repoName}}       - repository folder name
 *   {{language}}       - output language (commit / review)
 *
 * Unknown variables are left as-is.
 */

export interface TemplateContext {
    branch?: string;
    baseBranch?: string;
    compareBranch?: string;
    repoName?: string;
}

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

export function interpolate(template: string, ctx: TemplateContext): string {
    return template.replace(VARIABLE_PATTERN, (match, key: string) => {
        const value = (ctx as Record<string, string | undefined>)[key];
        return value !== undefined ? value : match;
    });
}
