import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface IconThemeDocument {
	iconDefinitions?: Record<string, { iconPath?: string }>;
	fileExtensions?: Record<string, string>;
	fileNames?: Record<string, string>;
	file?: string;
	folderNames?: Record<string, string>;
	folderNamesExpanded?: Record<string, string>;
	folder?: string;
	folderExpanded?: string;
}

export interface ResolvedIconTheme {
	extMap: Record<string, string>;
	fileMap: Record<string, string>;
	defaultFile: string | null;
	folderMap: Record<string, string>;
	folderExpandedMap: Record<string, string>;
	defaultFolder: string | null;
	defaultFolderExpanded: string | null;
}

// Cache theme definitions (parsed JSON) independently of webview instance
let _cachedThemeDef: { id: string; themeDir: string; themeDoc: IconThemeDocument } | null = null;
// Cache resolved URIs per webview instance to avoid redundant processing
const _webviewIconCache = new WeakMap<vscode.Webview, { id: string; theme: ResolvedIconTheme }>();

/**
 * Resolve the active file icon theme to webview-safe image URIs.
 * Only works with SVG/PNG-based themes (Material Icon Theme, VSCode Icons, etc.).
 * Returns null for font-based themes (Seti) — webview will use codicon fallback.
 */
export async function resolveFileIconTheme(webview: vscode.Webview): Promise<ResolvedIconTheme | null> {
	try {
		const iconThemeId = vscode.workspace.getConfiguration('workbench').get<string>('iconTheme');
		if (!iconThemeId) return null;

		// 1. Check if we have a fully resolved cache for THIS webview
		const webviewCached = _webviewIconCache.get(webview);
		if (webviewCached?.id === iconThemeId) {
			return webviewCached.theme;
		}

		// 2. Resolve or use cached theme definition (JSON)
		let themeDoc: IconThemeDocument;
		let themeDir: string;

		if (_cachedThemeDef?.id === iconThemeId) {
			themeDoc = _cachedThemeDef.themeDoc;
			themeDir = _cachedThemeDef.themeDir;
		} else {
			const ext = vscode.extensions.all.find(e => {
				const contributes = e.packageJSON?.contributes?.iconThemes;
				return Array.isArray(contributes) && contributes.some((t: any) => t.id === iconThemeId);
			});
			if (!ext) return null;

			const themeContrib = ext.packageJSON.contributes.iconThemes.find((t: any) => t.id === iconThemeId);
			if (!themeContrib?.path) return null;

			const themePath = path.join(ext.extensionPath, themeContrib.path);
			themeDir = path.dirname(themePath);
			
			const themeContent = await fs.promises.readFile(themePath, 'utf8').catch(() => null);
			if (!themeContent) return null;

			themeDoc = JSON.parse(themeContent);
			_cachedThemeDef = { id: iconThemeId, themeDir, themeDoc };
		}
		const {
			iconDefinitions = {}, fileExtensions = {}, fileNames = {},
			file: defaultFileKey,
			folderNames = {}, folderNamesExpanded = {},
			folder: defaultFolderKey, folderExpanded: defaultFolderExpandedKey
		} = themeDoc;

		// Only support image-based themes
		const hasIconPath = Object.values(iconDefinitions).some(d => !!d.iconPath);
		if (!hasIconPath) return null;

		// Pre-resolve all definition IRIs to avoid repeated work
		const definitionUris: Record<string, string> = {};
		for (const [key, def] of Object.entries(iconDefinitions)) {
			if (def?.iconPath) {
				const absPath = path.join(themeDir, def.iconPath);
				definitionUris[key] = webview.asWebviewUri(vscode.Uri.file(absPath)).toString();
			}
		}

		const extMap: Record<string, string> = {};
		const fileMap: Record<string, string> = {};
		for (const [e, defKey] of Object.entries(fileExtensions)) {
			const uri = definitionUris[defKey];
			if (uri) extMap[e.toLowerCase()] = uri;
		}
		for (const [name, defKey] of Object.entries(fileNames)) {
			const uri = definitionUris[defKey];
			if (uri) fileMap[name.toLowerCase()] = uri;
		}

		const folderMap: Record<string, string> = {};
		const folderExpandedMap: Record<string, string> = {};
		for (const [name, defKey] of Object.entries(folderNames)) {
			const uri = definitionUris[defKey];
			if (uri) folderMap[name.toLowerCase()] = uri;
		}
		for (const [name, defKey] of Object.entries(folderNamesExpanded)) {
			const uri = definitionUris[defKey];
			if (uri) folderExpandedMap[name.toLowerCase()] = uri;
		}

		const theme = {
			extMap, fileMap,
			defaultFile: defaultFileKey ? (definitionUris[defaultFileKey] || null) : null,
			folderMap, folderExpandedMap,
			defaultFolder: defaultFolderKey ? (definitionUris[defaultFolderKey] || null) : null,
			defaultFolderExpanded: defaultFolderExpandedKey ? (definitionUris[defaultFolderExpandedKey] || null) : null,
		};
		
		_webviewIconCache.set(webview, { id: iconThemeId, theme });
		return theme;
	} catch (err) {
		console.error('[IconResolver] Failed to resolve theme:', err);
		return null;
	}
}
