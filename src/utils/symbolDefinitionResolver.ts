import * as vscode from 'vscode';

export interface SymbolMatch {
    line: number;
    column: number;
    position: vscode.Position;
}

export interface ResolveSymbolDefinitionOptions {
    maxMatches?: number;
}

export interface NormalizedSymbolDefinition {
    uri: vscode.Uri;
    range: vscode.Range;
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
): Promise<NormalizedSymbolDefinition[]> {
    if (!symbol.trim()) {
        return [];
    }

    const matches = findSymbolMatches(document, symbol);
    if (matches.length === 0) {
        return [];
    }

    const definitionKeys = new Set<string>();
    const definitions: NormalizedSymbolDefinition[] = [];
    const maxMatches = Math.max(1, options.maxMatches ?? 3);

    for (const match of matches.slice(0, maxMatches)) {
        const found = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
            'vscode.executeDefinitionProvider',
            document.uri,
            match.position
        );

        for (const definition of found || []) {
            const normalized = normalizeDefinitionLocation(definition);
            if (!normalized) {
                continue;
            }

            const key = `${normalized.uri.toString()}#${normalized.range.start.line}:${normalized.range.start.character}-${normalized.range.end.line}:${normalized.range.end.character}`;
            if (!definitionKeys.has(key)) {
                definitionKeys.add(key);
                definitions.push(normalized);
            }
        }

        if (definitions.length > 0) {
            break;
        }
    }

    return definitions;
}

function normalizeDefinitionLocation(
    definition: vscode.Location | vscode.LocationLink
): NormalizedSymbolDefinition | undefined {
    if (definition instanceof vscode.Location) {
        return {
            uri: definition.uri,
            range: definition.range,
        };
    }

    if ('targetUri' in definition && definition.targetUri && definition.targetSelectionRange) {
        return {
            uri: definition.targetUri,
            range: definition.targetSelectionRange,
        };
    }

    return undefined;
}
