import * as path from 'path';
import * as vscode from 'vscode';
import { UnifiedDiffFile } from '../../services/llm';

const MAX_REFERENCE_FILES = 4;
const MAX_LINES_PER_REFERENCE = 40;

export class ReviewReferenceContextProvider {
    async buildReferenceContext(changedFiles: UnifiedDiffFile[]): Promise<string | undefined> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }

        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const changedPaths = new Set(changedFiles.map((file) => path.normalize(file.filePath)));
        const candidateFiles = new Set<string>();

        for (const changedFile of changedFiles) {
            if (changedFile.isBinary || changedFile.isDeleted) {
                continue;
            }

            const relatedFiles = await this.findRelatedFiles(changedFile.filePath);
            for (const relatedFile of relatedFiles) {
                const normalizedPath = path.normalize(relatedFile);
                if (!changedPaths.has(normalizedPath)) {
                    candidateFiles.add(normalizedPath);
                }
                if (candidateFiles.size >= MAX_REFERENCE_FILES) {
                    break;
                }
            }
            if (candidateFiles.size >= MAX_REFERENCE_FILES) {
                break;
            }
        }

        const selectedFiles = Array.from(candidateFiles).slice(0, MAX_REFERENCE_FILES);
        if (selectedFiles.length === 0) {
            return undefined;
        }

        const renderedFiles = await Promise.all(
            selectedFiles.map(async (filePath) => {
                try {
                    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                    const relativePath = path.relative(workspaceRoot, filePath);
                    const summaryLines = this.extractRelevantLines(document.getText());
                    if (summaryLines.length === 0) {
                        return undefined;
                    }

                    return `### ${relativePath}\n\`\`\`\n${summaryLines.join('\n')}\n\`\`\``;
                } catch {
                    return undefined;
                }
            })
        );

        const sections = renderedFiles.filter((value): value is string => Boolean(value));
        if (sections.length === 0) {
            return undefined;
        }

        return [
            '## Additional Reference Context',
            'The following read-only files are outside the diff but appear related to the reviewed flow. Use them only as supporting context for hidden risk analysis and flow reconstruction.',
            ...sections,
        ].join('\n\n');
    }

    private async findRelatedFiles(filePath: string): Promise<string[]> {
        try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
            const relatedFiles = new Set<string>();

            const links = await vscode.commands.executeCommand<vscode.DocumentLink[]>(
                'vscode.executeLinkProvider',
                document.uri
            );

            for (const link of links || []) {
                if (link.target?.scheme === 'file') {
                    relatedFiles.add(link.target.fsPath);
                }
                if (relatedFiles.size >= MAX_REFERENCE_FILES) {
                    break;
                }
            }

            return Array.from(relatedFiles);
        } catch {
            return [];
        }
    }

    private extractRelevantLines(content: string): string[] {
        const lines = content.split('\n');
        const matched = lines.filter((line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                return false;
            }

            return /^(import |export |class |interface |type |enum |function |async function |const [A-Za-z0-9_]+ = \(|public |private |protected )/.test(trimmed);
        });

        const sourceLines = matched.length > 0 ? matched : lines.filter((line) => line.trim()).slice(0, MAX_LINES_PER_REFERENCE);
        return sourceLines.slice(0, MAX_LINES_PER_REFERENCE);
    }
}
