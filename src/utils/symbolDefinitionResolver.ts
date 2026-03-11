import * as vscode from 'vscode';

export interface SymbolMatch {
    line: number;
    column: number;
    position: vscode.Position;
}

export interface ResolveSymbolDefinitionOptions {
    maxMatches?: number;
}

export function findSymbolMatches(document: vscode.TextDocument, symbol: string): SymbolMatch[] {
    const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const symbolRegex = new RegExp(`\\b${escapedSymbol}\\b`, 'g');
    const matches: SymbolMatch[] = [];
    const text = document.getText();

    let match: RegExpExecArray | null;
    while ((match = symbolRegex.exec(text)) !== null) {
        const position = document.positionAt(match.index);
        matches.push({
            line: position.line,
            column: position.character,
            position,
        });
    }

    return matches;
}

export async function resolveSymbolDefinitions(
    document: vscode.TextDocument,
    symbol: string,
    options: ResolveSymbolDefinitionOptions = {}
): Promise<vscode.Location[]> {
    if (!symbol.trim()) {
        return [];
    }

    const matches = findSymbolMatches(document, symbol);
    if (matches.length === 0) {
        return [];
    }

    const definitionKeys = new Set<string>();
    const definitions: vscode.Location[] = [];
    const maxMatches = Math.max(1, options.maxMatches ?? 3);

    for (const match of matches.slice(0, maxMatches)) {
        const found = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeDefinitionProvider',
            document.uri,
            match.position
        );

        for (const definition of found || []) {
            const key = `${definition.uri.toString()}#${definition.range.start.line}:${definition.range.start.character}-${definition.range.end.line}:${definition.range.end.character}`;
            if (!definitionKeys.has(key)) {
                definitionKeys.add(key);
                definitions.push(definition);
            }
        }

        if (definitions.length > 0) {
            break;
        }
    }

    return definitions;
}
