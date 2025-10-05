import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { FileTypeDetector } from './fileTypeDetector';

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

export class GitService {
    private gitExtension: any;
    private git: any;

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
     * Format staged files with diff in markdown format
     * @returns Formatted markdown string
     */
    public async getFormattedStagedChanges(): Promise<string> {
        try {
            const filesWithDiff = await this.getStagedFilesWithDiff();

            if (filesWithDiff.length === 0) {
                return 'No staged files found';
            }

            // Categorize files by their status
            const addedFiles: StagedFileWithDiff[] = [];
            const modifiedFiles: StagedFileWithDiff[] = [];
            const deletedFiles: StagedFileWithDiff[] = [];

            for (const file of filesWithDiff) {
                if (file.status === GitStatus.INDEX_DELETED) {
                    deletedFiles.push(file);
                } else if (file.status === GitStatus.INDEX_ADDED) {
                    addedFiles.push(file);
                } else {
                    // INDEX_MODIFIED, INDEX_RENAMED, INDEX_COPIED, etc.
                    modifiedFiles.push(file);
                }
            }

            let markdown = '';

            // Files Add section
            if (addedFiles.length > 0) {
                markdown += '# Files Add:\n\n';
                for (const file of addedFiles) {
                    markdown += `## ${file.relativePath}\n\n`;
                    if (file.isBinary) {
                        markdown += '**Binary file added**\n\n';
                    } else {
                        markdown += '### Description Change\n\n';
                        markdown += '```diff\n';
                        markdown += file.diff;
                        markdown += '\n```\n\n';
                    }
                }
            }

            // Files Edit section
            if (modifiedFiles.length > 0) {
                markdown += '# Files Edit:\n\n';
                for (const file of modifiedFiles) {
                    markdown += `## ${file.relativePath}\n\n`;
                    if (file.isBinary) {
                        markdown += '**Binary file modified**\n\n';
                    } else {
                        markdown += '### Description Change\n\n';
                        markdown += '```diff\n';
                        markdown += file.diff;
                        markdown += '\n```\n\n';
                    }
                }
            }

            // Files Remove section
            if (deletedFiles.length > 0) {
                markdown += '# Files Remove:\n\n';
                for (const file of deletedFiles) {
                    markdown += `## ${file.relativePath}\n\n`;
                    if (file.isBinary) {
                        markdown += '**Binary file deleted**\n\n';
                    } else {
                        markdown += '### Description Change\n\n';
                        markdown += '```diff\n';
                        markdown += file.diff;
                        markdown += '\n```\n\n';
                    }
                }
            }

            return markdown;
        } catch (error) {
            throw new Error(`Failed to format staged changes: ${error}`);
        }
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
        } catch (error) {
            throw new Error(`Failed to set commit message: ${error}`);
        }
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
            const repository = this.getRepository();
            console.log('Getting diff between:', baseBranch, 'and', compareBranch);
            
            // diffBetween returns an array of Change objects, not a string
            const changes = await repository.diffBetween(baseBranch, compareBranch);
            console.log('Changes received:', changes);
            
            if (!changes || changes.length === 0) {
                return 'No differences found between the branches.';
            }
            
            // Build diff string from changes
            let diffContent = '';
            
            for (const change of changes) {
                const uri = change.uri;
                const status = this.getStatusString(change.status);
                const workspaceRoot = repository.rootUri.fsPath;
                const relativePath = uri.fsPath.replace(workspaceRoot + '/', '');

                diffContent += `\n## ${status}: ${relativePath}\n`;
                
                // Try to get the actual diff content for this file
                try {
                    const fileDiff = await repository.diffBetween(baseBranch, compareBranch, uri.fsPath);
                    if (fileDiff) {
                        diffContent += '\n```diff\n';
                        // Sanitize file paths in the diff content
                        const sanitizedDiff = fileDiff.replace(/^(diff --git a\/.* b\/.*)$/gm, (match: string, p1: string) => {
                            return p1.replace(/a\//, './').replace(/b\//, './');
                        });
                        diffContent += sanitizedDiff;
                        diffContent += '\n```\n';
                    }
                } catch (err) {
                    console.log('Could not get file diff:', err);
                }
            }
            
            return diffContent || 'No detailed diff available.';
        } catch (error) {
            console.error('Error getting branch diff:', error);
            throw new Error(`Failed to get diff between branches: ${error}`);
        }
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

    /**
     * Get custom code review rules from .gitmew/code-rule.review-merge.md
     * @returns Custom rules content or undefined if file doesn't exist
     */
    public async getCustomReviewMergeRules(): Promise<string | undefined> {
        try {
            const repository = this.getRepository();
            const workspaceRoot = repository.rootUri.fsPath;
            const rulesPath = path.join(workspaceRoot, '.gitmew', 'code-rule.review-merge.md');
            
            // Check if file exists
            if (!fs.existsSync(rulesPath)) {
                return undefined;
            }
            
            // Read file content
            const content = fs.readFileSync(rulesPath, 'utf-8');
            return content.trim();
        } catch (error) {
            console.error('Error reading custom review rules:', error);
            return undefined;
        }
    }

    /**
     * Get custom system prompt from .gitmew/system-prompt.review-merge.md
     * @returns Custom system prompt content or undefined if file doesn't exist
     */
    public async getCustomReviewMergeSystemPrompt(): Promise<string | undefined> {
        try {
            const repository = this.getRepository();
            const workspaceRoot = repository.rootUri.fsPath;
            const promptPath = path.join(workspaceRoot, '.gitmew', 'system-prompt.review-merge.md');
            
            // Check if file exists
            if (!fs.existsSync(promptPath)) {
                return undefined;
            }
            
            // Read file content
            const content = fs.readFileSync(promptPath, 'utf-8');
            return content.trim();
        } catch (error) {
            console.error('Error reading custom system prompt:', error);
            return undefined;
        }
    }

    /**
     * Get custom system prompt from .gitmew/system-prompt.review-merge.md
     * @returns Custom system prompt content or undefined if file doesn't exist
     */
    public async getCustomDescriptionMergeSystemPrompt(): Promise<string | undefined> {
        try {
            const repository = this.getRepository();
            const workspaceRoot = repository.rootUri.fsPath;
            const promptPath = path.join(workspaceRoot, '.gitmew', 'system-prompt.description-merge.md');

            // Check if file exists
            if (!fs.existsSync(promptPath)) {
                return undefined;
            }
            
            // Read file content
            const content = fs.readFileSync(promptPath, 'utf-8');
            return content.trim();
        } catch (error) {
            console.error('Error reading custom system prompt:', error);
            return undefined;
        }
    }
}