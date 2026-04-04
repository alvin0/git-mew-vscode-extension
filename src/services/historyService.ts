import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const GLOBAL_GITMEW_DIR = path.join(os.homedir(), '.gitmew');
const HISTORIES_DIR = path.join(GLOBAL_GITMEW_DIR, '.histories');

/**
 * Get the workspace-specific history directory.
 * Uses the workspace folder name as the subdirectory (sanitized).
 */
export function getWorkspaceHistoryDir(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined;
    }
    const rawName = workspaceFolders[0].name;
    // Sanitize: replace path-unsafe chars, collapse dots to prevent traversal
    const safeName = rawName
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\.{2,}/g, '_')
        .trim() || 'workspace';
    return path.join(HISTORIES_DIR, safeName);
}

/**
 * Get today's date string for subfolder (YYYY-MM-DD).
 */
function getTodayDateFolder(): string {
    const now = new Date();
    return now.toISOString().slice(0, 10); // "2026-04-04"
}

/**
 * Get time-only prefix for filename (HHmmss).
 */
function getTimePrefix(): string {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${h}${m}${s}`;
}

/**
 * Save a review report as a markdown file in the history directory.
 * Structure: ~/.gitmew/.histories/[workspace]/[YYYY-MM-DD]/[HHmmss]_[name]_[unique].md
 */
export async function saveReviewHistory(
    reviewContent: string,
    fileName?: string
): Promise<string | undefined> {
    const historyDir = getWorkspaceHistoryDir();
    if (!historyDir) {
        console.warn('[history] No workspace folder found, skipping history save.');
        return undefined;
    }

    const dateDir = path.join(historyDir, getTodayDateFolder());
    await fs.mkdir(dateDir, { recursive: true });

    const finalName = fileName
        ? sanitizeFileName(fileName)
        : generateDefaultFileName();

    const filePath = path.join(dateDir, finalName);
    await fs.writeFile(filePath, reviewContent, 'utf-8');
    console.log(`[history] Saved review to ${filePath}`);
    return filePath;
}

/**
 * List all history files for the current workspace across all date subfolders.
 */
export function listHistoryFiles(): { name: string; filePath: string; mtime: Date; dateFolder: string }[] {
    const historyDir = getWorkspaceHistoryDir();
    if (!historyDir || !fsSync.existsSync(historyDir)) {
        return [];
    }

    try {
        const results: { name: string; filePath: string; mtime: Date; dateFolder: string }[] = [];
        const dateFolders = fsSync.readdirSync(historyDir);

        for (const dateFolder of dateFolders) {
            const datePath = path.join(historyDir, dateFolder);
            const stat = fsSync.statSync(datePath);
            if (!stat.isDirectory()) { continue; }

            const files = fsSync.readdirSync(datePath);
            for (const file of files) {
                if (!file.endsWith('.md')) { continue; }
                const filePath = path.join(datePath, file);
                const fileStat = fsSync.statSync(filePath);
                results.push({
                    name: file,
                    filePath,
                    mtime: fileStat.mtime,
                    dateFolder,
                });
            }
        }

        return results.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    } catch {
        return [];
    }
}

/**
 * Delete a history file. Removes the parent date folder if it becomes empty.
 */
export async function deleteHistoryFile(filePath: string): Promise<void> {
    await fs.unlink(filePath);
    // Cleanup empty date folder
    const parentDir = path.dirname(filePath);
    try {
        const remaining = await fs.readdir(parentDir);
        if (remaining.length === 0) {
            await fs.rmdir(parentDir);
        }
    } catch {
        // Ignore cleanup errors
    }
}

/**
 * Update an existing history file with new content.
 * No-op if the file no longer exists.
 */
export async function updateHistoryFile(filePath: string, newContent: string): Promise<void> {
    try {
        await fs.access(filePath);
    } catch {
        console.warn(`[history] File no longer exists, skipping update: ${filePath}`);
        return;
    }
    await fs.writeFile(filePath, newContent, 'utf-8');
    console.log(`[history] Updated review at ${filePath}`);
}

function randomSuffix(length: number = 5): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function sanitizeFileName(name: string): string {
    let sanitized = name.replace(/[<>:"/\\|?*\s]/g, '-').replace(/\.+/g, '.').trim();
    if (sanitized.endsWith('.md')) {
        sanitized = sanitized.slice(0, -3);
    }
    // Collapse consecutive dashes
    sanitized = sanitized.replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
    return `${getTimePrefix()}_${sanitized}_${randomSuffix()}.md`;
}

function generateDefaultFileName(): string {
    return `${getTimePrefix()}_review_${randomSuffix()}.md`;
}
