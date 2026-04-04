import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { UnifiedDiffFile } from '../llm/contextTypes';
import { FileTypeDetector } from './fileTypeDetector';
import {
    ReviewReferenceContextOptions,
    ReviewReferenceContextProvider,
    ReviewReferenceContextResult
} from '../../commands/reviewShared/referenceContextProvider';
import { interpolate, TemplateContext } from './templateInterpolator';

export interface GitChange {
    uri: vscode.Uri;
    status: number;
    originalUri?: vscode.Uri;
}

export interface StagedFileWithDiff {
    filePath: string;
    relativePath: string;
    diff: string;
    status: number;
    isDeleted: boolean;
    isBinary: boolean;
}

// Git status codes
export enum GitStatus {
    INDEX_MODIFIED = 0,
    INDEX_ADDED = 1,
    INDEX_DELETED = 2,
    INDEX_RENAMED = 3,
    INDEX_COPIED = 4,
    MODIFIED = 5,
    DELETED = 6,
    UNTRACKED = 7,
    IGNORED = 8,
    INTENT_TO_ADD = 9,
}

export interface MergedBranchInfo {
    branchName: string;
    mergeCommitSha: string;
    mergeDate: Date;
    mergeAuthor: string;
    mergeMessage: string;
}

export interface MergedBranchCommitInfo {
    commitSha: string;
    authoredAt: Date;
    author: string;
    subject: string;
    body: string;
}

export class GitService {
    private gitExtension: any;
    private git: any;
    private readonly commitMessageSyncRetries = 20;
    private readonly commitMessageSyncDelayMs = 100;
    private readonly reviewReferenceContextProvider = new ReviewReferenceContextProvider();

    constructor() {
        this.initializeGit();
    }

    /**
     * Initialize Git extension and API
     */
    private initializeGit() {
        this.gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        if (this.gitExtension) {
            this.git = this.gitExtension.getAPI(1);
        }
    }

    /**
     * Get the first Git repository in the workspace
     */
    private getRepository() {
        if (!this.git) {
            throw new Error('Git extension not found');
        }

        if (this.git.repositories.length === 0) {
            throw new Error('No Git repository found');
        }

        return this.git.repositories[0];
    }

    /**
     * Read file content from a specific git ref (branch, tag, commit).
     * Uses VS Code Git Extension API's `show()` method.
     * Returns undefined if the file doesn't exist at that ref.
     */
    public async showFileFromRef(ref: string, relativePath: string): Promise<string | undefined> {
        try {
            const repository = this.getRepository();
            // VS Code Git API: repository.show(ref, path) returns file content as string
            const content = await repository.show(ref, relativePath);
            return content ?? undefined;
        } catch {
            // File doesn't exist at this ref, or ref is invalid
            return undefined;
        }
    }

    /**
     * Get the workspace root path from the git repository.
     */
    public getWorkspaceRoot(): string {
        const repository = this.getRepository();
        return repository.rootUri.fsPath;
    }

    /**
     * Get all staged files (files in the index)
     * @returns Array of file paths
     */
    public async getStagedFiles(): Promise<string[]> {
        try {
            const repository = this.getRepository();
            const stagedChanges = repository.state.indexChanges;

            if (stagedChanges.length === 0) {
                return [];
            }

            return stagedChanges.map((change: GitChange) => change.uri.fsPath);
        } catch (error) {
            throw new Error(`Failed to get staged files: ${error}`);
        }
    }

    /**
     * Get all staged files with their relative paths
     * @returns Array of relative file paths
     */
    public async getStagedFilesRelative(): Promise<string[]> {
        try {
            const repository = this.getRepository();
            const stagedChanges = repository.state.indexChanges;

            if (stagedChanges.length === 0) {
                return [];
            }

            const workspaceRoot = repository.rootUri.fsPath;
            return stagedChanges.map((change: GitChange) => {
                const fullPath = change.uri.fsPath;
                return fullPath.replace(workspaceRoot + '/', '');
            });
        } catch (error) {
            throw new Error(`Failed to get staged files: ${error}`);
        }
    }

    /**
     * Get staged changes with detailed information
     * @returns Array of GitChange objects
     */
    public async getStagedChanges(): Promise<GitChange[]> {
        try {
            const repository = this.getRepository();
            return repository.state.indexChanges;
        } catch (error) {
            throw new Error(`Failed to get staged changes: ${error}`);
        }
    }

    /**
     * Get the diff content for a staged file
     * @param filePath - Path to the file
     * @returns Diff content as string
     */
    public async getStagedFileDiff(filePath: string): Promise<string> {
        try {
            const repository = this.getRepository();
            const uri = vscode.Uri.file(filePath);
            const diff = await repository.diffIndexWithHEAD(uri.fsPath);
            return diff || '';
        } catch (error) {
            throw new Error(`Failed to get diff for ${filePath}: ${error}`);
        }
    }

    /**
     * Check if a file is binary using advanced FileTypeDetector
     * @param diff - Diff content
     * @param filePath - File path for extension detection
     * @returns True if the file is binary
     */
    private async isBinaryFile(diff: string, filePath: string): Promise<boolean> {
        // Empty diff is not binary
        if (!diff || diff.length === 0) {
            return false;
        }

        // Quick check: Git explicitly marks it as binary
        if (diff.includes('Binary files') ||
            diff.includes('GIT binary patch') ||
            (diff.includes('differ') && diff.includes('Binary'))) {
            return true;
        }

        // If diff is extremely long (> 100KB), likely binary or minified
        const MAX_REASONABLE_DIFF_SIZE = 100000;
        if (diff.length > MAX_REASONABLE_DIFF_SIZE) {
            return true;
        }

        try {
            // Convert diff string to buffer for FileTypeDetector
            const encoder = new TextEncoder();
            const uint8Array = encoder.encode(diff);
            
            // Create a new ArrayBuffer and copy data to ensure it's a proper ArrayBuffer
            const arrayBuffer = new ArrayBuffer(uint8Array.byteLength);
            const view = new Uint8Array(arrayBuffer);
            view.set(uint8Array);
            
            // Extract filename from path
            const filename = filePath.split('/').pop() || filePath;
            
            // Use FileTypeDetector for comprehensive analysis
            const result = FileTypeDetector.detectFromBuffer(
                arrayBuffer,
                filename
            );
            
            // Return true if detected as binary with reasonable confidence
            return result.isBinary && result.confidence > 0.5;
        } catch (error) {
            // Fallback to simple heuristic if FileTypeDetector fails
            const sample = diff.substring(0, Math.min(8000, diff.length));
            const nullBytes = (sample.match(/\x00/g) || []).length;
            return nullBytes > 0;
        }
    }

    /**
     * Get all staged files with their diff content
     * @returns Array of files with their diffs
     */
    public async getStagedFilesWithDiff(): Promise<StagedFileWithDiff[]> {
        try {
            const repository = this.getRepository();
            const stagedChanges = repository.state.indexChanges;

            if (stagedChanges.length === 0) {
                return [];
            }

            const workspaceRoot = repository.rootUri.fsPath;
            const filesWithDiff: StagedFileWithDiff[] = [];

            for (const change of stagedChanges) {
                const fullPath = change.uri.fsPath;
                const relativePath = fullPath.replace(workspaceRoot + '/', '');
                const status = change.status;
                const isDeleted = status === GitStatus.INDEX_DELETED;
                
                let diff = '';
                let isBinary = false;
                
                // Get diff for all files including deleted ones
                try {
                    diff = await repository.diffIndexWithHEAD(fullPath);
                    if (!diff) {
                        diff = 'No diff available';
                    } else {
                        // Check if file is binary using advanced FileTypeDetector
                        isBinary = await this.isBinaryFile(diff, fullPath);
                        
                        // For binary files, replace diff with a simple message
                        if (isBinary) {
                            diff = 'Binary file';
                        }
                    }
                } catch (error) {
                    diff = `Error getting diff: ${error}`;
                }

                filesWithDiff.push({
                    filePath: fullPath,
                    relativePath: relativePath,
                    diff: diff,
                    status: status,
                    isDeleted: isDeleted,
                    isBinary: isBinary
                });
            }

            return filesWithDiff;
        } catch (error) {
            throw new Error(`Failed to get staged files with diff: ${error}`);
        }
    }

    /**
     * Get staged changes as a structured diff model shared by all LLM flows
     */
    public async getStagedDiffFiles(): Promise<UnifiedDiffFile[]> {
        const filesWithDiff = await this.getStagedFilesWithDiff();
        return filesWithDiff.map((file) => this.toUnifiedDiffFile(file));
    }

    /**
     * Format staged files with diff in markdown format
     * @returns Formatted markdown string
     */
    public async getFormattedStagedChanges(): Promise<string> {
        try {
            const files = await this.getStagedDiffFiles();
            return this.renderStagedDiffFiles(files);
        } catch (error) {
            throw new Error(`Failed to format staged changes: ${error}`);
        }
    }

    /**
     * Render structured staged changes back into the legacy markdown format
     */
    public renderStagedDiffFiles(files: UnifiedDiffFile[]): string {
        if (files.length === 0) {
            return 'No staged files found';
        }

        const addedFiles: UnifiedDiffFile[] = [];
        const modifiedFiles: UnifiedDiffFile[] = [];
        const deletedFiles: UnifiedDiffFile[] = [];

        for (const file of files) {
            if (file.status === GitStatus.INDEX_DELETED) {
                deletedFiles.push(file);
            } else if (file.status === GitStatus.INDEX_ADDED) {
                addedFiles.push(file);
            } else {
                modifiedFiles.push(file);
            }
        }

        let markdown = '';

        if (addedFiles.length > 0) {
            markdown += '# Files Add:\n\n';
            markdown += this.renderUnifiedDiffFileList(addedFiles);
        }

        if (modifiedFiles.length > 0) {
            markdown += '# Files Edit:\n\n';
            markdown += this.renderUnifiedDiffFileList(modifiedFiles);
        }

        if (deletedFiles.length > 0) {
            markdown += '# Files Remove:\n\n';
            markdown += this.renderUnifiedDiffFileList(deletedFiles);
        }

        return markdown.trimEnd();
    }

    /**
     * Get all unstaged files (working tree changes)
     * @returns Array of file paths
     */
    public async getUnstagedFiles(): Promise<string[]> {
        try {
            const repository = this.getRepository();
            const workingTreeChanges = repository.state.workingTreeChanges;

            if (workingTreeChanges.length === 0) {
                return [];
            }

            return workingTreeChanges.map((change: GitChange) => change.uri.fsPath);
        } catch (error) {
            throw new Error(`Failed to get unstaged files: ${error}`);
        }
    }

    /**
     * Check if there are any staged files
     * @returns True if there are staged files
     */
    public async hasStagedFiles(): Promise<boolean> {
        try {
            const repository = this.getRepository();
            return repository.state.indexChanges.length > 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get the count of staged files
     * @returns Number of staged files
     */
    public async getStagedFilesCount(): Promise<number> {
        try {
            const repository = this.getRepository();
            return repository.state.indexChanges.length;
        } catch (error) {
            return 0;
        }

    }

    /**
     * Commit staged changes with a message
     * @param message - Commit message
     */
    public async commit(message: string): Promise<void> {
        try {
            const repository = this.getRepository();
            await repository.commit(message);
        } catch (error) {
            throw new Error(`Failed to commit: ${error}`);
        }

    }

    /**
     * Set commit message in the Git SCM input box
     * @param message - Commit message to set
     */
    public async setCommitMessage(message: string): Promise<void> {
        try {
            const repository = this.getRepository();
            repository.inputBox.value = message;

            // SCM input can be reset by repository refreshes right after staging/generation.
            // Re-apply only when it gets cleared, so we do not overwrite user edits.
            for (let attempt = 0; attempt < this.commitMessageSyncRetries; attempt += 1) {
                await this.delay(this.commitMessageSyncDelayMs);

                if (repository.inputBox.value === message) {
                    continue;
                }

                if (repository.inputBox.value.trim().length === 0) {
                    repository.inputBox.value = message;
                    continue;
                }

                return;
            }
        } catch (error) {
            throw new Error(`Failed to set commit message: ${error}`);
        }
    }

    private async delay(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Stage all changes (add all files from working tree to index)
     */
    public async stageAllChanges(): Promise<void> {
        try {
            const repository = this.getRepository();
            const workingTreeChanges = repository.state.workingTreeChanges;
            
            if (workingTreeChanges.length === 0) {
                return;
            }

            // Add all working tree changes to the index
            await repository.add(workingTreeChanges.map((change: GitChange) => change.uri.fsPath));
        } catch (error) {
            throw new Error(`Failed to stage all changes: ${error}`);
        }
    }

    /**
     * Get all branches (local and remote)
     * @returns Array of branch names
     */
    public async getAllBranches(): Promise<string[]> {
        try {
            const repository = this.getRepository();
            
            // Get local and remote branches
            const branches: string[] = [];
            
            // Try to get refs
            const refs = await repository.getRefs();
            console.log('Total refs found:', refs.length);
            
            for (const ref of refs) {
                console.log('Ref:', ref.name, 'Type:', ref.type);
                if (ref.name) {
                    // Type 0 = local branch (HEAD)
                    // Type 1 = remote branch
                    // Type 2 = tag
                    
                    // Skip origin/HEAD as it's just a pointer
                    if (ref.name === 'origin/HEAD') {
                        continue;
                    }
                    
                    // Add all branches (local and remote)
                    // Local branches don't have prefix (e.g., "main")
                    // Remote branches have "origin/" prefix (e.g., "origin/main")
                    if (ref.type === 0 || ref.type === 1) {
                        branches.push(ref.name);
                        console.log('Added branch:', ref.name);
                    }
                }
            }
            
            console.log('Total branches found:', branches.length);
            
            // Remove duplicates and sort
            const uniqueBranches = [...new Set(branches)].sort();
            console.log('Unique branches:', uniqueBranches);
            return uniqueBranches;
        } catch (error) {
            console.error('Error getting branches:', error);
            throw new Error(`Failed to get branches: ${error}`);
        }
    }

    /**
     * Get the current branch name
     * @returns Current branch name or undefined
     */
    public async getCurrentBranch(): Promise<string | undefined> {
        try {
            const repository = this.getRepository();
            const head = repository.state.HEAD;
            return head?.name;
        } catch (error) {
            return undefined;
        }
    }

    /**
     * Get diff between two branches
     * @param baseBranch - The base branch (target branch to merge into)
     * @param compareBranch - The compare branch (source branch to merge from)
     * @returns Diff content as string
     */
    public async getBranchDiff(baseBranch: string, compareBranch: string): Promise<string> {
        try {
            const files = await this.getBranchDiffFiles(baseBranch, compareBranch);
            return this.renderBranchDiffFiles(files);
        } catch (error) {
            console.error('Error getting branch diff:', error);
            throw new Error(`Failed to get diff between branches: ${error}`);
        }
    }

    /**
     * Get branch changes in the shared structured diff format
     */
    public async getBranchDiffFiles(baseBranch: string, compareBranch: string): Promise<UnifiedDiffFile[]> {
        try {
            const repository = this.getRepository();
            console.log('Getting diff between:', baseBranch, 'and', compareBranch);

            const changes = await repository.diffBetween(baseBranch, compareBranch);
            console.log('Changes received:', changes);

            if (!changes || changes.length === 0) {
                return [];
            }

            const workspaceRoot = repository.rootUri.fsPath;
            const branchDiffFiles: UnifiedDiffFile[] = [];

            for (const change of changes) {
                const fullPath = change.uri.fsPath;
                const relativePath = this.toRelativePath(workspaceRoot, fullPath);
                let diff = '';
                let isBinary = false;

                try {
                    const fileDiff = await repository.diffBetween(baseBranch, compareBranch, fullPath);
                    if (!fileDiff) {
                        diff = 'No diff available';
                    } else {
                        const sanitizedDiff = this.sanitizeDiffContent(fileDiff);
                        isBinary = await this.isBinaryFile(sanitizedDiff, fullPath);
                        diff = isBinary ? 'Binary file' : sanitizedDiff;
                    }
                } catch (error) {
                    diff = `Error getting diff: ${error}`;
                }

                branchDiffFiles.push({
                    filePath: fullPath,
                    relativePath,
                    diff,
                    status: change.status,
                    statusLabel: this.getStatusString(change.status),
                    isDeleted: change.status === GitStatus.INDEX_DELETED || change.status === GitStatus.DELETED,
                    isBinary,
                    originalFilePath: change.originalUri?.fsPath
                });
            }

            return branchDiffFiles;
        } catch (error) {
            throw new Error(`Failed to get structured diff between branches: ${error}`);
        }
    }

    /**
     * Render structured branch diff back into the legacy markdown format
     */
    public renderBranchDiffFiles(files: UnifiedDiffFile[]): string {
        if (files.length === 0) {
            return 'No differences found between the branches.';
        }

        return files.map((file) => {
            let markdown = `\n## ${file.statusLabel}: ${file.relativePath}\n`;

            if (file.isBinary) {
                markdown += '\nBinary file change\n';
                return markdown;
            }

            if (file.diff && file.diff !== 'No diff available') {
                markdown += '\n```diff\n';
                markdown += file.diff;
                markdown += '\n```\n';
            }

            return markdown;
        }).join('').trim() || 'No detailed diff available.';
    }

    public async buildReviewReferenceContext(
        changedFiles: UnifiedDiffFile[],
        options?: ReviewReferenceContextOptions
    ): Promise<ReviewReferenceContextResult> {
        return this.reviewReferenceContextProvider.buildReferenceContext(changedFiles, options);
    }

    public normalizeGeneratedPaths(text: string, changedFiles: UnifiedDiffFile[] = []): string {
        if (!text) {
            return text;
        }

        const repository = this.getRepository();
        const workspaceRoot = repository.rootUri.fsPath;
        const replacements = new Map<string, string>();

        for (const file of changedFiles) {
            replacements.set(file.filePath, this.toForwardSlashPath(file.relativePath));

            if (file.originalFilePath) {
                const relativeOriginalPath = this.toRelativePath(workspaceRoot, file.originalFilePath);
                replacements.set(file.originalFilePath, this.toForwardSlashPath(relativeOriginalPath));
            }
        }

        let normalizedText = text;
        for (const [absolutePath, relativePath] of Array.from(replacements.entries()).sort((a, b) => b[0].length - a[0].length)) {
            const pathVariants = new Set<string>([
                absolutePath,
                absolutePath.replace(/\//g, '\\'),
                absolutePath.replace(/\\/g, '/'),
            ]);

            for (const variant of pathVariants) {
                normalizedText = normalizedText.split(variant).join(relativePath);
            }
        }

        const workspacePrefixPatterns = [
            `${workspaceRoot}\\`,
            `${workspaceRoot}/`,
            `${workspaceRoot.replace(/\//g, '\\')}\\`,
            `${workspaceRoot.replace(/\\/g, '/')}\/`,
        ];

        for (const prefix of workspacePrefixPatterns) {
            normalizedText = normalizedText.split(prefix).join('');
        }

        return normalizedText.replace(/\\/g, '/');
    }
    
    /**
     * Get status string from status code
     */
    private getStatusString(status: number): string {
        switch (status) {
            case GitStatus.INDEX_MODIFIED:
            case GitStatus.MODIFIED:
                return 'Modified';
            case GitStatus.INDEX_ADDED:
                return 'Added';
            case GitStatus.INDEX_DELETED:
            case GitStatus.DELETED:
                return 'Deleted';
            case GitStatus.INDEX_RENAMED:
                return 'Renamed';
            case GitStatus.INDEX_COPIED:
                return 'Copied';
            case GitStatus.UNTRACKED:
                return 'Untracked';
            default:
                return 'Changed';
        }
    }

    private toUnifiedDiffFile(file: StagedFileWithDiff): UnifiedDiffFile {
        return {
            filePath: file.filePath,
            relativePath: file.relativePath,
            diff: this.sanitizeDiffContent(file.diff),
            status: file.status,
            statusLabel: this.getStatusString(file.status),
            isDeleted: file.isDeleted,
            isBinary: file.isBinary
        };
    }

    private renderUnifiedDiffFileList(files: UnifiedDiffFile[]): string {
        return files.map((file) => {
            let markdown = `## ${file.relativePath}\n\n`;

            if (file.isBinary) {
                markdown += `**Binary file ${file.statusLabel.toLowerCase()}**\n\n`;
                return markdown;
            }

            markdown += '### Description Change\n\n';
            markdown += '```diff\n';
            markdown += file.diff;
            markdown += '\n```\n\n';

            return markdown;
        }).join('');
    }

    private sanitizeDiffContent(diff: string): string {
        if (!diff) {
            return diff;
        }

        return diff.replace(/^(diff --git a\/.* b\/.*)$/gm, (match: string, diffHeader: string) => {
            return diffHeader.replace(/a\//, './').replace(/b\//, './');
        });
    }

    private toRelativePath(workspaceRoot: string, fullPath: string): string {
        const normalizedRoot = workspaceRoot.endsWith(path.sep)
            ? workspaceRoot
            : `${workspaceRoot}${path.sep}`;
        return fullPath.replace(normalizedRoot, '');
    }

    private toForwardSlashPath(filePath: string): string {
        return filePath.replace(/\\/g, '/');
    }

    /**
     * Read the first existing file from a list of candidate paths.
     * Priority: project > global (~/.gitmew) > legacy project flat names.
     * Optionally interpolates template variables if ctx is provided.
     */
    private readFirstExisting(candidates: string[], ctx?: TemplateContext): string | undefined {
        for (const filePath of candidates) {
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, 'utf-8').trim();
                return ctx ? interpolate(raw, ctx) : raw;
            }
        }
        return undefined;
    }

    private getGlobalGitmewDir(): string {
        return path.join(os.homedir(), '.gitmew');
    }

    /**
     * Get custom code review rules.
     * Priority: project .gitmew/review/code-rules.md > global ~/.gitmew/review/code-rules.md > legacy project code-rule.review-merge.md
     */
    public async getCustomReviewMergeRules(ctx?: TemplateContext): Promise<string | undefined> {
        try {
            const workspaceRoot = this.getRepository().rootUri.fsPath;
            const projectDir = path.join(workspaceRoot, '.gitmew');
            const globalDir = this.getGlobalGitmewDir();
            return this.readFirstExisting([
                path.join(projectDir, 'review', 'code-rules.md'),
                path.join(globalDir, 'review', 'code-rules.md'),
                path.join(projectDir, 'code-rule.review-merge.md'),
            ], ctx);
        } catch (error) {
            console.error('Error reading custom review rules:', error);
            return undefined;
        }
    }

    /**
     * Get custom review system prompt.
     * Priority: project .gitmew/review/system-prompt.md > global ~/.gitmew/review/system-prompt.md > legacy project system-prompt.review-merge.md
     */
    public async getCustomReviewMergeSystemPrompt(ctx?: TemplateContext): Promise<string | undefined> {
        try {
            const workspaceRoot = this.getRepository().rootUri.fsPath;
            const projectDir = path.join(workspaceRoot, '.gitmew');
            const globalDir = this.getGlobalGitmewDir();
            return this.readFirstExisting([
                path.join(projectDir, 'review', 'system-prompt.md'),
                path.join(globalDir, 'review', 'system-prompt.md'),
                path.join(projectDir, 'system-prompt.review-merge.md'),
            ], ctx);
        } catch (error) {
            console.error('Error reading custom system prompt:', error);
            return undefined;
        }
    }

    /**
     * Get custom review agent instructions.
     * Priority: project .gitmew/review/agent-rules.md > global ~/.gitmew/review/agent-rules.md > legacy project agent-rule.review-merge.md
     */
    public async getCustomReviewMergeAgentPrompt(ctx?: TemplateContext): Promise<string | undefined> {
        try {
            const workspaceRoot = this.getRepository().rootUri.fsPath;
            const projectDir = path.join(workspaceRoot, '.gitmew');
            const globalDir = this.getGlobalGitmewDir();
            return this.readFirstExisting([
                path.join(projectDir, 'review', 'agent-rules.md'),
                path.join(globalDir, 'review', 'agent-rules.md'),
                path.join(projectDir, 'agent-rule.review-merge.md'),
            ], ctx);
        } catch (error) {
            console.error('Error reading custom review agent instructions:', error);
            return undefined;
        }
    }

    /**
     * Get custom description system prompt.
     * Priority: project .gitmew/description/system-prompt.md > global ~/.gitmew/description/system-prompt.md > legacy project system-prompt.description-merge.md
     */
    public async getCustomDescriptionMergeSystemPrompt(ctx?: TemplateContext): Promise<string | undefined> {
        try {
            const workspaceRoot = this.getRepository().rootUri.fsPath;
            const projectDir = path.join(workspaceRoot, '.gitmew');
            const globalDir = this.getGlobalGitmewDir();
            return this.readFirstExisting([
                path.join(projectDir, 'description', 'system-prompt.md'),
                path.join(globalDir, 'description', 'system-prompt.md'),
                path.join(projectDir, 'system-prompt.description-merge.md'),
            ], ctx);
        } catch (error) {
            console.error('Error reading custom system prompt:', error);
            return undefined;
        }
    }

    /**
     * Execute a git CLI command directly via child_process.execFile.
     * Uses the repository root as the working directory.
     * @param args - Arguments to pass to the git command
     * @returns stdout output from the git command
     */
    private async execGitCommand(args: string[]): Promise<string> {
        const repository = this.getRepository();
        const cwd = repository.rootUri.fsPath;
        return new Promise((resolve, reject) => {
            execFile('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) { reject(new Error(`git ${args[0]} failed: ${stderr || error.message}`)); }
                else { resolve(stdout); }
            });
        });
    }

    /**
     * Parse branch name from a merge commit message.
     * Supports multiple merge message formats:
     * - "Merge branch 'feature/xyz' into main"
     * - "Merge branch 'feature/xyz'"
     * - "Merge pull request #123 from user/branch"
     * - "Merge remote-tracking branch 'origin/feature'"
     * Falls back to returning the full message if no pattern matches.
     */
    private parseBranchNameFromMergeMessage(message: string): string {
        // Pattern 1: "Merge branch 'feature/xyz' into main" (must check before Pattern 2 — more specific)
        const branchInto = message.match(/Merge branch '(.+?)' into .+/);
        if (branchInto) { return branchInto[1]; }
        // Pattern 2: "Merge branch 'feature/xyz'"
        const branch = message.match(/Merge branch '(.+?)'/);
        if (branch) { return branch[1]; }
        // Pattern 3: "Merge pull request #123 from user/branch"
        const pr = message.match(/Merge pull request #\d+ from (.+)/);
        if (pr) { return pr[1]; }
        // Pattern 4: "Merge remote-tracking branch 'origin/feature'"
        const remote = message.match(/Merge remote-tracking branch '(.+?)'/);
        if (remote) { return remote[1]; }
        // Fallback
        return message;
    }

    private parseMergedBranchLogOutput(output: string): MergedBranchInfo[] {
        if (!output.trim()) {
            return [];
        }

        return output.trim().split('\n')
            .filter(line => line.trim())
            .map(line => {
                const [sha, date, author, ...messageParts] = line.split('|');
                const message = messageParts.join('|');
                return {
                    mergeCommitSha: sha,
                    mergeDate: new Date(date),
                    mergeAuthor: author,
                    mergeMessage: message,
                    branchName: this.parseBranchNameFromMergeMessage(message),
                };
            });
    }

    private normalizeMergedBranchLimit(limit: number): number {
        return Math.max(1, Math.min(20, Math.floor(limit)));
    }

    /**
     * Get list of branches that have been merged into the target branch.
     * Runs: git log --merges --first-parent --format=%H|%ai|%an|%s <targetBranch> -n <limit>
     * Results are sorted by merge date descending (git log default).
     */
    public async getMergedBranches(targetBranch: string, limit: number = 20): Promise<MergedBranchInfo[]> {
        const safeLimit = this.normalizeMergedBranchLimit(limit);
        const output = await this.execGitCommand([
            'log', '--merges', '--first-parent',
            '--format=%H|%ai|%an|%s',
            targetBranch,
            '-n', String(safeLimit)
        ]);
        return this.parseMergedBranchLogOutput(output);
    }

    /**
     * Search merged branches by merge commit message / branch identifier.
     * Results remain sorted by merge date descending (git log default).
     */
    public async searchMergedBranches(
        targetBranch: string,
        query: string,
        limit: number = 20
    ): Promise<MergedBranchInfo[]> {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            return this.getMergedBranches(targetBranch, limit);
        }

        const safeLimit = this.normalizeMergedBranchLimit(limit);
        const output = await this.execGitCommand([
            'log', '--merges', '--first-parent',
            '--regexp-ignore-case', '--fixed-strings',
            '--grep', trimmedQuery,
            '--format=%H|%ai|%an|%s',
            targetBranch,
            '-n', String(safeLimit)
        ]);

        return this.parseMergedBranchLogOutput(output);
    }

    /**
     * Get the commit messages that were introduced by a merged branch.
     * Uses the merge commit parents to read commits reachable from the merged branch tip
     * but not from the target branch parent, ordered oldest to newest.
     */
    public async getMergedBranchCommitMessages(
        mergeCommitSha: string,
        limit: number = 20
    ): Promise<MergedBranchCommitInfo[]> {
        const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
        const output = await this.execGitCommand([
            'log',
            '--reverse',
            `-n`, String(safeLimit),
            '--format=%H%x1f%ai%x1f%an%x1f%s%x1f%b%x1e',
            `${mergeCommitSha}^1..${mergeCommitSha}^2`,
        ]);

        if (!output.trim()) {
            return [];
        }

        return output
            .split('\x1e')
            .map(record => record.trim())
            .filter(Boolean)
            .map(record => {
                const [commitSha = '', authoredAt = '', author = '', subject = '', ...bodyParts] = record.split('\x1f');
                return {
                    commitSha: commitSha.trim(),
                    authoredAt: new Date(authoredAt.trim()),
                    author: author.trim(),
                    subject: subject.trim(),
                    body: bodyParts.join('\x1f').trim(),
                };
            });
    }

    /**
     * Map git status character (A/M/D/R/C) to GitStatus enum value.
     */
    private mapGitStatusChar(statusChar: string): number {
        const map: Record<string, number> = {
            'A': GitStatus.INDEX_ADDED,
            'M': GitStatus.MODIFIED,
            'D': GitStatus.INDEX_DELETED,
            'R': GitStatus.INDEX_RENAMED,
            'C': GitStatus.INDEX_COPIED,
        };
        return map[statusChar] ?? GitStatus.MODIFIED;
    }

    /**
     * Map git status character to human-readable label string.
     */
    private mapGitStatusLabel(statusChar: string): string {
        const map: Record<string, string> = {
            'A': 'Added', 'M': 'Modified', 'D': 'Deleted',
            'R': 'Renamed', 'C': 'Copied',
        };
        return map[statusChar] ?? 'Modified';
    }

    /**
     * Extract diff from a merge commit using first-parent diff.
     * 
     * Step 1: Get list of changed files via `git diff --name-status <sha>^1..<sha>`
     * Step 2: Get unified diff for each file
     * Step 3: Render diff string using existing renderBranchDiffFiles()
     * 
     * @param mergeCommitSha - SHA of the merge commit
     * @returns Object with structured changes and rendered diff string
     */
    public async getMergedBranchDiff(mergeCommitSha: string): Promise<{ changes: UnifiedDiffFile[]; diff: string }> {
        const repository = this.getRepository();
        const workspaceRoot = repository.rootUri.fsPath;

        // Step 1: Get list of changed files
        const nameStatusOutput = await this.execGitCommand([
            'diff', '--name-status', `${mergeCommitSha}^1..${mergeCommitSha}`
        ]);
        if (!nameStatusOutput.trim()) { return { changes: [], diff: '' }; }

        const fileEntries = nameStatusOutput.trim().split('\n')
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split('\t');
                const status = parts[0].charAt(0);
                // Handle rename: R100\told-path\tnew-path
                const filePath = parts[parts.length - 1];
                const originalPath = parts.length > 2 ? parts[1] : undefined;
                return { status, filePath, originalPath };
            });

        // Step 2: Get diff for each file
        const changes: UnifiedDiffFile[] = [];
        for (const entry of fileEntries) {
            const fullPath = path.join(workspaceRoot, entry.filePath);
            let diff: string;
            let isBinary = false;
            try {
                const fileDiff = await this.execGitCommand([
                    'diff', `${mergeCommitSha}^1..${mergeCommitSha}`, '--', entry.filePath
                ]);
                const sanitized = this.sanitizeDiffContent(fileDiff);
                isBinary = await this.isBinaryFile(sanitized, fullPath);
                diff = isBinary ? 'Binary file' : sanitized;
            } catch (error) {
                diff = `Error getting diff: ${error}`;
            }
            changes.push({
                filePath: fullPath,
                relativePath: entry.filePath,
                diff,
                status: this.mapGitStatusChar(entry.status),
                statusLabel: this.mapGitStatusLabel(entry.status),
                isDeleted: entry.status === 'D',
                isBinary,
                originalFilePath: entry.originalPath ? path.join(workspaceRoot, entry.originalPath) : undefined,
            });
        }

        // Step 3: Render diff string (reuse existing method)
        const diff = this.renderBranchDiffFiles(changes);
        return { changes, diff };
    }

    /**
     * Get the combined diff for a range of commits (oldest..newest).
     * Used by "Review Selected Commits" from the graph view.
     *
     * @param oldestSha - The oldest commit SHA in the selection (exclusive start)
     * @param newestSha - The newest commit SHA in the selection (inclusive end)
     * @returns Object with structured changes and rendered diff string
     */
    public async getCommitRangeDiff(oldestSha: string, newestSha: string): Promise<{ changes: UnifiedDiffFile[]; diff: string }> {
        const repository = this.getRepository();
        const workspaceRoot = repository.rootUri.fsPath;

        // Determine the range spec. If oldest commit is the root (has no parent),
        // use diff against the empty tree instead of SHA^.
        let rangeSpec: string;
        try {
            await this.execGitCommand(['rev-parse', '--verify', `${oldestSha}^`]);
            rangeSpec = `${oldestSha}^..${newestSha}`;
        } catch {
            // oldest is the root commit — diff from empty tree to newest
            const emptyTree = '4b825dc642cb6eb9a060e54bf899d15363da7b23';
            rangeSpec = `${emptyTree}..${newestSha}`;
        }

        // Step 1: Get list of changed files
        const nameStatusOutput = await this.execGitCommand([
            'diff', '--name-status', rangeSpec
        ]);
        if (!nameStatusOutput.trim()) { return { changes: [], diff: '' }; }

        const fileEntries = nameStatusOutput.trim().split('\n')
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split('\t');
                const status = parts[0].charAt(0);
                const filePath = parts[parts.length - 1];
                const originalPath = parts.length > 2 ? parts[1] : undefined;
                return { status, filePath, originalPath };
            });

        // Step 2: Get diff for each file
        const changes: UnifiedDiffFile[] = [];
        for (const entry of fileEntries) {
            const fullPath = path.join(workspaceRoot, entry.filePath);
            let diff: string;
            let isBinary = false;
            try {
                const fileDiff = await this.execGitCommand([
                    'diff', rangeSpec, '--', entry.filePath
                ]);
                const sanitized = this.sanitizeDiffContent(fileDiff);
                isBinary = await this.isBinaryFile(sanitized, fullPath);
                diff = isBinary ? 'Binary file' : sanitized;
            } catch (error) {
                diff = `Error getting diff: ${error}`;
            }
            changes.push({
                filePath: fullPath,
                relativePath: entry.filePath,
                diff,
                status: this.mapGitStatusChar(entry.status),
                statusLabel: this.mapGitStatusLabel(entry.status),
                isDeleted: entry.status === 'D',
                isBinary,
                originalFilePath: entry.originalPath ? path.join(workspaceRoot, entry.originalPath) : undefined,
            });
        }

        // Step 3: Render diff string
        const diff = this.renderBranchDiffFiles(changes);
        return { changes, diff };
    }
}
