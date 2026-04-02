import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface IconThemeDocument {
	iconDefinitions?: Record<string, { iconPath?: string }>;
	fileExtensions?: Record<string, string>;
	fileNames?: Record<string, string>;
	file?: string;
}

export interface ResolvedIconTheme {
	extMap: Record<string, string>;
	fileMap: Record<string, string>;
	defaultFile: string | null;
}

/**
 * Resolve the active file icon theme to webview-safe image URIs.
 * Only works with SVG/PNG-based themes (Material Icon Theme, VSCode Icons, etc.).
 * Returns null for font-based themes (Seti) — webview will use codicon fallback.
 */
export async function resolveFileIconTheme(webview: vscode.Webview): Promise<ResolvedIconTheme | null> {
	try {
		const iconThemeId = vscode.workspace.getConfiguration('workbench').get<string>('iconTheme');
		if (!iconThemeId) return null;

		const ext = vscode.extensions.all.find(e => {
			const contributes = e.packageJSON?.contributes?.iconThemes;
			return Array.isArray(contributes) && contributes.some((t: any) => t.id === iconThemeId);
		});
		if (!ext) return null;

		const themeContrib = ext.packageJSON.contributes.iconThemes.find((t: any) => t.id === iconThemeId);
		if (!themeContrib?.path) return null;

		const themePath = path.join(ext.extensionPath, themeContrib.path);
		const themeDir = path.dirname(themePath);
		if (!fs.existsSync(themePath)) return null;

		const themeDoc: IconThemeDocument = JSON.parse(fs.readFileSync(themePath, 'utf8'));
		const { iconDefinitions = {}, fileExtensions = {}, fileNames = {}, file: defaultFileKey } = themeDoc;

		// Only support image-based themes
		const hasIconPath = Object.values(iconDefinitions).some(d => !!d.iconPath);
		if (!hasIconPath) return null;

		const resolveUri = (defKey: string): string | null => {
			const def = iconDefinitions[defKey];
			if (!def?.iconPath) return null;
			const absPath = path.join(themeDir, def.iconPath);
			if (!fs.existsSync(absPath)) return null;
			return webview.asWebviewUri(vscode.Uri.file(absPath)).toString();
		};

		const extMap: Record<string, string> = {};
		const fileMap: Record<string, string> = {};
		for (const [e, defKey] of Object.entries(fileExtensions)) {
			const uri = resolveUri(defKey);
			if (uri) extMap[e.toLowerCase()] = uri;
		}
		for (const [name, defKey] of Object.entries(fileNames)) {
			const uri = resolveUri(defKey);
			if (uri) fileMap[name.toLowerCase()] = uri;
		}
		return { extMap, fileMap, defaultFile: defaultFileKey ? resolveUri(defaultFileKey) : null };
	} catch {
		return null;
	}
}
