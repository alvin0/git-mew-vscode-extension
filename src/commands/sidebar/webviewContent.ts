export function getWebviewHtml(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Git Mew</title>
<style>${getStyles()}</style>
</head>
<body>
<div class="main-content">
${getSourceControlHtml()}
</div>
${getScript()}
</body>
</html>`;
}

function getStyles(): string {
	return `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
	font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
	color: var(--vscode-foreground); background: var(--vscode-sideBar-background);
	overflow-x: hidden; display: flex; flex-direction: column; height: 100vh;
}
.main-content { flex: 1; overflow-y: auto; min-height: 0; }
.section-header {
	display: flex; align-items: center; justify-content: space-between;
	padding: 0 8px; font-size: 11px; font-weight: 600;
	text-transform: uppercase; letter-spacing: 0.5px;
	color: var(--vscode-sideBarSectionHeader-foreground);
	background: var(--vscode-sideBarSectionHeader-background);
	border-top: 1px solid var(--vscode-sideBar-border, transparent);
	cursor: pointer; user-select: none; height: 22px;
}
.section-header:hover { background: var(--vscode-list-hoverBackground); }
.section-header .hdr-left { display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0; }
.section-header .hdr-right { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.count { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 10px; padding: 0 6px; font-size: 10px; min-width: 18px; text-align: center; }
.icon-btn { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 2px 4px; border-radius: 3px; font-size: 14px; opacity: 0.7; display: flex; align-items: center; }
.icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
`;
}

function getSourceControlHtml(): string {
	const svgMerge = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v1.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z"/></svg>`;
	const svgHistory = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.643 3.143L.427 1.927A.25.25 0 0 0 0 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 0 0 .177-.427L2.715 4.215a6.5 6.5 0 1 1-1.18 4.458.75.75 0 1 0-1.493.154 8.001 8.001 0 1 0 1.6-5.684zM8 5.5a.75.75 0 0 1 .75.75v2.69l1.28 1.28a.75.75 0 0 1-1.06 1.06l-1.5-1.5A.75.75 0 0 1 7.25 9V6.25A.75.75 0 0 1 8 5.5z"/></svg>`;
	const svgRefresh = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834zM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5z"/></svg>`;
	const svgPlus = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8.75 1.75a.75.75 0 0 0-1.5 0V7H1.75a.75.75 0 0 0 0 1.5H7.25v5.25a.75.75 0 0 0 1.5 0V8.5h5.25a.75.75 0 0 0 0-1.5H8.75V1.75z"/></svg>`;
	const svgSparkle = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 1l1.5 3.5L13 6l-3.5 1.5L8 11l-1.5-3.5L3 6l3.5-1.5L7.5 1zm0 2.18L6.72 5.1 4.5 6l2.22.9.78 1.92.78-1.92L10.5 6l-2.22-.9L7.5 3.18zM2 12l.67 1.33L4 14l-1.33.67L2 16l-.67-1.33L0 14l1.33-.67L2 12zm11 0l.67 1.33L15 14l-1.33.67L13 16l-.67-1.33L11 14l1.33-.67L13 12z"/></svg>`;
	const svgCheck = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>`;
	const svgEye = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.5 5.5 1.5 8s3 5 6.5 5 6.5-2.5 6.5-5-3-5-6.5-5zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7zm0-5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>`;
	const svgPush = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5a.75.75 0 0 1 .75.75V7h4.75a.25.25 0 0 1 .177.427l-5.25 5.25a.25.25 0 0 1-.354 0l-5.25-5.25A.25.25 0 0 1 3 7h4.25V2.25A.75.75 0 0 1 8 1.5z" transform="rotate(180 8 8)"/></svg>`;

	return `
<div class="section-header" onclick="toggleSection('sc-body', this)">
	<span class="hdr-left"><span class="chevron">›</span>GITMEW SOURCE CONTROL</span>
	<div class="hdr-right" onclick="event.stopPropagation()">
		<button class="icon-btn" title="Review Merge" onclick="sendCommand('review-merge')">${svgMerge}</button>
		<button class="icon-btn" title="Review Merged Branch" onclick="sendCommand('review-merged-branch')">${svgHistory}</button>
		<button class="icon-btn" title="Refresh" onclick="sendCommand('refresh')">${svgRefresh}</button>
		<button class="icon-btn" title="Stage All Changes" onclick="sendCommand('stage-all')">${svgPlus}</button>
	</div>
</div>
<div id="sc-body" class="section-body">
	<div class="commit-area">
		<div class="commit-input-wrap">
			<textarea id="commit-msg" placeholder="Message (Ctrl+Enter to commit on...)"></textarea>
			<div class="input-actions">
				<button class="input-icon-btn" title="Generate commit message with AI" onclick="sendCommand('generate-commit')">${svgSparkle}</button>
			</div>
		</div>
		<div class="btn-row">
			<button class="btn-commit" onclick="doCommit()">${svgCheck} Commit</button>
			<button id="btn-review-staged" class="btn-review-staged" style="display:none" onclick="sendCommand('review-staged')" title="Review Staged Changes with AI">${svgEye} Review</button>
		</div>
		<div id="push-banner" style="display:none" class="push-banner">
			${svgPush}
			<span id="push-banner-text">1 commit to push</span>
			<button class="push-btn" onclick="sendCommand('git-push')" title="Push to remote">Push</button>
		</div>
		<div id="force-push-banner" style="display:none" class="force-push-banner">
			<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8.22 1.754a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368L8.22 1.754zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575L6.457 1.047zM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-.25-5.25a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 0 1.5 0v-2.5z"/></svg>
			<span id="force-push-text">History rewritten — force push required</span>
			<button class="force-push-btn" onclick="sendCommand('git-force-push')" title="Force push to remote">Force Push</button>
		</div>
		<div id="sync-banner" style="display:none" class="sync-banner" onclick="sendCommand('git-sync')">
			<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834zM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5z"/></svg>
			<span id="sync-banner-text">Sync Changes</span>
		</div>
	</div>
	<div id="merge-conflict-banner" style="display:none" class="merge-conflict-banner">
		<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8.22 1.754a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368L8.22 1.754zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575L6.457 1.047zM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-.25-5.25a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 0 1.5 0v-2.5z"/></svg>
		<span id="merge-conflict-text">Resolve conflicts before committing</span>
		<button id="abort-merge-btn" class="abort-merge-btn" style="display:none" onclick="sendCommand('abort-merge')">Abort Merge</button>
	</div>
	<div id="merge-section-header" class="section-header merge-section" style="padding-left:8px;display:none" onclick="toggleSection('merge-body', this)">
		<span class="hdr-left"><span class="chevron">›</span> Merge Changes</span>
		<div class="hdr-right" onclick="event.stopPropagation()">
			<button class="icon-btn" title="Stage All Merge Changes" onclick="sendCommand('stage-all-merge')">+</button>
			<span class="count merge-count" id="merge-count">0</span>
		</div>
	</div>
	<div id="merge-body" class="section-body" style="display:none">
		<div class="file-list" id="merge-list"></div>
	</div>
	<div id="staged-section-header" class="section-header" style="padding-left:8px;display:none" onclick="toggleSection('staged-body', this)">
		<span class="hdr-left"><span class="chevron">›</span> Staged Changes</span>
		<div class="hdr-right" onclick="event.stopPropagation()">
			<button class="icon-btn" title="Unstage All Changes" onclick="sendCommand('unstage-all')">−</button>
			<span class="count" id="staged-count">0</span>
		</div>
	</div>
	<div id="staged-body" class="section-body" style="display:none">
		<div class="file-list" id="staged-list"></div>
	</div>
	<div class="section-header" style="padding-left:8px" onclick="toggleSection('unstaged-body', this)">
		<span class="hdr-left"><span class="chevron">›</span> Changes</span>
		<div class="hdr-right" onclick="event.stopPropagation()">
			<button class="icon-btn" title="Discard All Changes" onclick="sendCommand('discard-all')">↩</button>
			<button class="icon-btn" title="Stage All Changes" onclick="sendCommand('stage-all')">+</button>
			<span class="count" id="unstaged-count">0</span>
		</div>
	</div>
	<div id="unstaged-body" class="section-body">
		<div class="file-list" id="unstaged-list"><div class="empty-state">No changes</div></div>
	</div>
</div>
<div id="merge-context-menu" class="context-menu" style="display:none">
	<div class="context-menu-item" data-ctx="accept-current">Accept Current Change</div>
	<div class="context-menu-item" data-ctx="accept-incoming">Accept Incoming Change</div>
	<div class="context-menu-separator"></div>
	<div class="context-menu-item" data-ctx="open">Open File</div>
	<div class="context-menu-item" data-ctx="stage">Stage File</div>
</div>`;
}

function getScript(): string {
	return `<style>
.commit-area { padding: 6px 8px 4px; }
.commit-input-wrap { margin-bottom: 4px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; display: flex; align-items: flex-start; }
.commit-input-wrap:focus-within { border-color: var(--vscode-focusBorder); outline: 1px solid var(--vscode-focusBorder); }
textarea { flex: 1; min-height: 28px; max-height: 200px; resize: none; background: transparent; color: var(--vscode-input-foreground); border: none; padding: 6px 4px 6px 8px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); outline: none; line-height: 1.4; overflow-y: scroll; scrollbar-width: none; }
textarea::-webkit-scrollbar { display: none; }
textarea::placeholder { color: var(--vscode-input-placeholderForeground); }
.input-actions { display: flex; flex-direction: column; align-items: center; padding: 4px 2px; flex-shrink: 0; }
.input-icon-btn { background: none; border: none; color: var(--vscode-input-foreground); cursor: pointer; padding: 3px 4px; border-radius: 3px; opacity: 0.7; display: flex; align-items: center; justify-content: center; font-size: 13px; line-height: 1; }
.input-icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.btn-commit { flex: 1; padding: 5px 10px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; cursor: pointer; font-size: 12px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 4px; }
.btn-commit:hover { background: var(--vscode-button-hoverBackground); }
.btn-review-staged { padding: 5px 8px; background: var(--vscode-button-secondaryBackground, rgba(255,255,255,0.1)); color: var(--vscode-button-secondaryForeground, var(--vscode-foreground)); border: none; border-radius: 2px; cursor: pointer; font-size: 12px; display: flex; align-items: center; gap: 4px; white-space: nowrap; flex-shrink: 0; }
.btn-review-staged:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.15)); }
.btn-row { display: flex; gap: 4px; }
.push-banner { display: flex; align-items: center; gap: 6px; margin-top: 5px; padding: 5px 8px; background: var(--vscode-inputValidation-warningBackground, rgba(226,192,141,0.15)); border: 1px solid var(--vscode-inputValidation-warningBorder, rgba(226,192,141,0.4)); border-radius: 2px; font-size: 11px; color: var(--vscode-foreground); }
.push-banner svg { flex-shrink: 0; opacity: 0.8; } .push-banner span { flex: 1; }
.push-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; padding: 2px 10px; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap; }
.push-btn:hover { background: var(--vscode-button-hoverBackground); }
.force-push-banner { display: flex; align-items: center; gap: 6px; margin-top: 5px; padding: 5px 8px; background: rgba(241,76,76,0.15); border: 1px solid rgba(241,76,76,0.4); border-radius: 2px; font-size: 11px; color: #f14c4c; }
.force-push-banner svg { flex-shrink: 0; opacity: 0.8; fill: #f14c4c; } .force-push-banner span { flex: 1; color: #f14c4c; }
.force-push-btn { background: rgba(241,76,76,0.3); color: #fff; border: 1px solid rgba(241,76,76,0.5); border-radius: 2px; padding: 2px 10px; cursor: pointer; font-size: 11px; font-weight: 500; white-space: nowrap; }
.force-push-btn:hover { background: rgba(241,76,76,0.5); }
.sync-banner { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 5px; padding: 6px 8px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 2px; font-size: 12px; font-weight: 500; cursor: pointer; }
.sync-banner:hover { background: var(--vscode-button-hoverBackground); }
.commit-area.sync-required .btn-row,
.commit-area.sync-required .push-banner { display: none !important; }
.commit-area.sync-required .force-push-banner { display: flex !important; }
.file-list { list-style: none; user-select: none; }
.tree-folder { position: relative; }
.tree-folder-children { position: relative; }
.tree-folder:hover > .tree-folder-children::before {
	content: ''; position: absolute; top: 0; bottom: 0;
	left: var(--guide-left, 16px); width: 1px;
	background: var(--vscode-tree-indentGuidesStroke, rgba(255,255,255,0.15));
}
.tree-folder-header { display: flex; align-items: center; padding: 0 4px 0 0; cursor: pointer; font-size: 13px; gap: 2px; user-select: none; height: 22px; }
.tree-folder-header:hover { background: var(--vscode-list-hoverBackground); }
.tree-folder-header .tree-chevron { font-size: 16px; width: 16px; text-align: center; flex-shrink: 0; transition: transform 0.1s; display: inline-block; transform: rotate(90deg); }
.tree-folder-header.collapsed .tree-chevron { transform: rotate(0deg); }
.tree-folder-header .tree-folder-icon { flex-shrink: 0; opacity: 0.7; margin-right: 2px; }
.tree-folder-header .tree-folder-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.folder-actions { display: none; gap: 1px; flex-shrink: 0; }
.tree-folder-header:hover .folder-actions { display: flex; }
.tree-folder-children.hidden { display: none; }
.file-item { display: flex; align-items: center; padding: 0 4px 0 0; cursor: pointer; font-size: 13px; gap: 2px; position: relative; height: 22px; }
.file-item:hover { background: var(--vscode-list-hoverBackground); }
.file-icon-img { display: inline-block; flex-shrink: 0; vertical-align: middle; }
.file-item .file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-badge { font-size: 11px; font-weight: 600; width: 14px; text-align: center; flex-shrink: 0; }
.status-M { color: #e2c08d; } .status-A { color: #73c991; } .status-D { color: #f14c4c; } .status-R { color: #73c991; } .status-U { color: #e2c08d; } .status-C { color: #73c991; }
.file-actions { display: none; gap: 1px; flex-shrink: 0; } .file-item:hover .file-actions { display: flex; }
.file-item.selected { background: var(--vscode-list-activeSelectionBackground, rgba(255,255,255,0.1)); }
.file-item.selected .file-actions { display: flex; }
.file-item.selected:hover { background: var(--vscode-list-activeSelectionBackground, rgba(255,255,255,0.12)); }
.tree-folder-header.selected { background: var(--vscode-list-activeSelectionBackground, rgba(255,255,255,0.1)); }
.tree-folder-header.selected:hover { background: var(--vscode-list-activeSelectionBackground, rgba(255,255,255,0.12)); }
.tree-folder-header.selected .folder-actions { display: flex; }
.file-action-btn { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 1px 3px; border-radius: 2px; font-size: 12px; opacity: 0.8; line-height: 1; }
.file-action-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.empty-state { padding: 0 20px; font-size: 12px; color: var(--vscode-descriptionForeground); font-style: italic; height: 22px; line-height: 22px; }
.action-item { display: flex; align-items: center; padding: 0 8px 0 12px; cursor: pointer; gap: 8px; font-size: 12px; height: 22px; }
.action-item:hover { background: var(--vscode-list-hoverBackground); }
.action-item .ai-icon { font-size: 14px; flex-shrink: 0; } .action-item .ai-label { flex: 1; } .action-item .ai-desc { font-size: 11px; color: var(--vscode-descriptionForeground); }
.chevron { font-size: 13px; transition: transform 0.15s; display: inline-block; transform: rotate(90deg); }
.collapsed .chevron { transform: rotate(0deg); } .section-body.hidden { display: none; }
.branch-badge { font-size: 10px; padding: 1px 6px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 10px; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sync-info { padding: 4px 12px; font-size: 11px; color: var(--vscode-descriptionForeground); display: flex; gap: 8px; align-items: center; }
.sync-ahead { color: var(--vscode-gitDecoration-addedResourceForeground, #73c991); }
.sync-behind { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }
.conflict-banner { margin: 4px 8px; padding: 6px 8px; background: var(--vscode-inputValidation-errorBackground, rgba(241,76,76,0.15)); border: 1px solid var(--vscode-inputValidation-errorBorder, #f14c4c); border-radius: 3px; font-size: 11px; display: flex; align-items: center; gap: 6px; color: var(--vscode-errorForeground, #f14c4c); }
.merge-conflict-banner { display: flex; align-items: center; gap: 6px; margin: 4px 8px; padding: 5px 8px; background: rgba(241,76,76,0.12); border: 1px solid rgba(241,76,76,0.35); border-radius: 2px; font-size: 11px; color: #f14c4c; }
.merge-conflict-banner svg { flex-shrink: 0; fill: #f14c4c; }
.merge-conflict-banner span { flex: 1; }
.abort-merge-btn { background: rgba(241,76,76,0.25); color: #f14c4c; border: 1px solid rgba(241,76,76,0.4); border-radius: 2px; padding: 1px 8px; cursor: pointer; font-size: 10px; font-weight: 500; white-space: nowrap; flex-shrink: 0; }
.abort-merge-btn:hover { background: rgba(241,76,76,0.4); }
.merge-section { color: #f14c4c; }
.merge-count { background: rgba(241,76,76,0.3); color: #f14c4c; }
#merge-list .status-U { color: #f14c4c; }
.context-menu { position: fixed; z-index: 200; background: var(--vscode-menu-background, var(--vscode-editorWidget-background)); border: 1px solid var(--vscode-menu-border, var(--vscode-editorWidget-border, rgba(255,255,255,0.15))); border-radius: 4px; padding: 4px 0; min-width: 180px; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
.context-menu-item { padding: 4px 12px; font-size: 12px; cursor: pointer; color: var(--vscode-menu-foreground, var(--vscode-foreground)); }
.context-menu-item:hover { background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground)); color: var(--vscode-menu-selectionForeground, var(--vscode-foreground)); }
.context-menu-separator { height: 1px; margin: 4px 8px; background: var(--vscode-menu-separatorBackground, rgba(255,255,255,0.1)); }
</style>
` + getScriptBody();
}

function getScriptBody(): string {
	return `<script>
const vscode = acquireVsCodeApi();
function sendCommand(cmd, extra) { vscode.postMessage({ command: cmd, ...extra }); }
function doCommit() { if (_staged.length === 0) return; const msg = document.getElementById('commit-msg').value; vscode.postMessage({ command: 'commit', message: msg }); }
document.getElementById('commit-msg').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) doCommit(); });
const commitMsg = document.getElementById('commit-msg');
function autoResize(el) { el.style.height = 'auto'; el.style.height = (el.value ? Math.min(el.scrollHeight, 200) : 28) + 'px'; }
commitMsg.addEventListener('input', (e) => { autoResize(e.target); vscode.postMessage({ command: 'commit-msg-change', message: e.target.value }); });
function toggleSection(bodyId, headerEl) { document.getElementById(bodyId).classList.toggle('hidden'); headerEl.classList.toggle('collapsed'); }
const STATUS_MAP = { 0:'M', 1:'A', 2:'D', 3:'R', 4:'C', 5:'M', 6:'D', 7:'U', 9:'A' };
function statusLetter(s) { return STATUS_MAP[s] || 'M'; }

let _iconTheme = null;

function getFileIcon(fileName, statusLtr) {
	var STATUS_COLORS = { 'M': '#e2c08d', 'A': '#73c991', 'D': '#f14c4c', 'R': '#73c991', 'C': '#73c991', 'U': '#e2c08d' };
	var color = STATUS_COLORS[statusLtr] || 'var(--vscode-foreground)';
	return '<svg class="file-icon-img" width="14" height="14" viewBox="0 0 16 16" fill="'+color+'" xmlns="http://www.w3.org/2000/svg"><path d="M13.85 4.44l-3.28-3.3-.35-.14H3.5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V4.8l-.15-.36zM10.5 1.62L12.88 4H10.5V1.62zM12.5 14h-9V2h6V4.5a.5.5 0 0 0 .5.5h2.5v9z"/></svg>';
}

function getFolderIcon(folderName, isExpanded) {
	var nameLower = (folderName || '').toLowerCase();
	if (_iconTheme) {
		var uri = isExpanded
			? (_iconTheme.folderExpandedMap?.[nameLower] || _iconTheme.defaultFolderExpanded || _iconTheme.folderMap?.[nameLower] || _iconTheme.defaultFolder)
			: (_iconTheme.folderMap?.[nameLower] || _iconTheme.defaultFolder);
		if (uri) return '<img class="file-icon-img tree-folder-icon" src="'+uri+'" width="14" height="14" data-folder="'+nameLower+'"/>';
	}
	return '<svg class="file-icon-img tree-folder-icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" opacity="0.7"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"/></svg>';
}

function swapFolderIcon(headerEl) {
	if (!_iconTheme) return;
	var iconEl = headerEl.querySelector('.tree-folder-icon');
	if (!iconEl || iconEl.tagName !== 'IMG') return;
	var folderName = iconEl.dataset.folder || '';
	var isNowCollapsed = headerEl.classList.contains('collapsed');
	var uri = isNowCollapsed
		? (_iconTheme.folderMap?.[folderName] || _iconTheme.defaultFolder)
		: (_iconTheme.folderExpandedMap?.[folderName] || _iconTheme.defaultFolderExpanded || _iconTheme.folderMap?.[folderName] || _iconTheme.defaultFolder);
	if (uri) iconEl.src = uri;
}

function renderStagedList(files) {
	var el = document.getElementById('staged-list');
	var hdr = document.getElementById('staged-section-header');
	var body = document.getElementById('staged-body');
	document.getElementById('staged-count').textContent = files.length;
	if (!files.length) { hdr.style.display = 'none'; body.style.display = 'none'; el.innerHTML = ''; return; }
	hdr.style.display = ''; body.style.display = '';
	el.innerHTML = buildFileTree(files, 'staged');
}
function renderUnstagedList(files) {
	var el = document.getElementById('unstaged-list');
	document.getElementById('unstaged-count').textContent = files.length;
	if (!files.length) { el.innerHTML = '<div class="empty-state">No changes</div>'; return; }
	el.innerHTML = buildFileTree(files, 'unstaged');
}

var _mergeConflicts = [];
function renderMergeList(files) {
	_mergeConflicts = files;
	var el = document.getElementById('merge-list');
	var hdr = document.getElementById('merge-section-header');
	var body = document.getElementById('merge-body');
	var banner = document.getElementById('merge-conflict-banner');
	document.getElementById('merge-count').textContent = files.length;
	if (!files.length) { hdr.style.display = 'none'; body.style.display = 'none'; banner.style.display = 'none'; el.innerHTML = ''; return; }
	hdr.style.display = ''; body.style.display = ''; banner.style.display = 'flex';
	document.getElementById('merge-conflict-text').textContent = 'Resolve conflicts before committing';
	el.innerHTML = files.map(function(f, i) {
		return '<div class="file-item" data-merge-idx="'+i+'" title="'+escapeHtml(f.filePath)+'" style="padding-left:20px">' +
			'<span class="file-icon">' + getFileIcon(f.fileName, 'U') + '</span>' +
			'<span class="file-name">' + escapeHtml(f.fileName) + '</span>' +
			'<div class="file-actions">' +
				'<button class="file-action-btn" data-merge-action="open" data-merge-file-idx="'+i+'" title="Open File">○</button>' +
				'<button class="file-action-btn" data-merge-action="stage" data-merge-file-idx="'+i+'" title="Stage Changes">+</button>' +
			'</div>' +
			'<span class="status-badge status-U">U</span>' +
			'</div>';
	}).join('');
}

function escapeHtml(str) {
	if (typeof str !== 'string') return '';
	return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function buildFileTree(files, type) {
	var root = {};
	files.forEach(function(f, i) {
		var dir = (f.dirName || '').replace(/^\\.[\\/]?/, '');
		var parts = dir.split('/').filter(function(p) { return p && p !== '.'; });
		var node = root;
		parts.forEach(function(p) { if (!node[p]) node[p] = {}; node = node[p]; });
		if (!node._files) node._files = [];
		var entry = Object.assign({}, f);
		entry._idx = i;
		node._files.push(entry);
	});
	return renderTreeNode(root, type, 0);
}

function collectIndices(node) {
	var indices = [];
	if (node._files) node._files.forEach(function(f) { indices.push(f._idx); });
	Object.keys(node).filter(function(k) { return k !== '_files'; }).forEach(function(k) {
		indices = indices.concat(collectIndices(node[k]));
	});
	return indices;
}

function compactFolderName(name, child) {
	var current = name;
	var node = child;
	while (true) {
		var subfolders = Object.keys(node).filter(function(k) { return k !== '_files'; });
		if (subfolders.length !== 1 || (node._files && node._files.length > 0)) break;
		current += '/' + subfolders[0];
		node = node[subfolders[0]];
	}
	var fullName = current;
	var parts = current.split('/');
	var displayName = current;
	if (parts.length > 3) {
		displayName = parts[0] + '/.../' + parts.slice(-2).join('/');
	}
	return { displayName: displayName, fullName: fullName, node: node };
}

function renderTreeNode(node, type, depth) {
	var html = '';
	var pad = 12 + depth * 8;
	var folders = Object.keys(node).filter(function(k) { return k !== '_files'; }).sort();
	folders.forEach(function(name) {
		var compact = compactFolderName(name, node[name]);
		var displayName = compact.displayName;
		var fullName = compact.fullName;
		var effectiveNode = compact.node;
		var childIndices = collectIndices(node[name]);
		var lastSegment = fullName.split('/').pop() || fullName;
		var folderActions = '';
		if (type === 'staged') {
			folderActions = '<button class="file-action-btn" data-folder-action="unstage" data-folder-indices="'+childIndices.join(',')+'" title="Unstage Folder">−</button>';
		} else {
			folderActions = '<button class="file-action-btn" data-folder-action="discard" data-folder-indices="'+childIndices.join(',')+'" title="Discard Folder">↩</button><button class="file-action-btn" data-folder-action="stage" data-folder-indices="'+childIndices.join(',')+'" title="Stage Folder">+</button>';
		}
		html += '<div class="tree-folder">';
		html += '<div class="tree-folder-header" style="padding-left:'+pad+'px">';
		html += '<span class="tree-chevron">›</span>';
		html += '<span class="tree-folder-name" title="'+fullName+'">'+displayName+'</span>';
		html += '<div class="folder-actions">'+folderActions+'</div>';
		html += '</div>';
		html += '<div class="tree-folder-children" style="--guide-left:'+(pad+6)+'px">';
		html += renderTreeNode(effectiveNode, type, depth + 1);
		html += '</div></div>';
	});
	if (node._files) {
		node._files.forEach(function(f) {
			var sl = statusLetter(f.status);
			var filePad = pad + 8;
			var actionBtns = type === 'staged'
				? '<button class="file-action-btn" data-action="unstage" data-idx="'+f._idx+'" title="Unstage">−</button>'
				: '<button class="file-action-btn" data-action="discard" data-idx="'+f._idx+'" title="Discard Changes">↩</button><button class="file-action-btn" data-action="stage" data-idx="'+f._idx+'" title="Stage">+</button>';
			html += '<div class="file-item" data-idx="'+f._idx+'" data-type="'+type+'" title="'+f.filePath+'" style="padding-left:'+filePad+'px">';
			html += '<span class="file-icon">'+getFileIcon(f.fileName, sl)+'</span>';
			html += '<span class="file-name">'+f.fileName+'</span>';
			html += '<div class="file-actions">'+actionBtns+'</div>';
			html += '<span class="status-badge status-'+sl+'">'+sl+'</span>';
			html += '</div>';
		});
	}
	return html;
}

let _staged = [], _unstaged = [];
var _selection = { staged: new Set(), unstaged: new Set() };
var _lastClickIdx = { staged: -1, unstaged: -1 };
var _forcePushActive = false;

function handleFileSelect(type, idx, e) {
	var sel = _selection[type];
	if (e.shiftKey && _lastClickIdx[type] >= 0) {
		var from = Math.min(_lastClickIdx[type], idx);
		var to = Math.max(_lastClickIdx[type], idx);
		sel.clear();
		var listEl = document.getElementById(type === 'staged' ? 'staged-list' : 'unstaged-list');
		var items = listEl.querySelectorAll('.file-item[data-idx]');
		items.forEach(function(item) {
			var i = parseInt(item.dataset.idx);
			if (i >= from && i <= to) sel.add(i);
		});
	} else {
		sel.clear(); sel.add(idx);
	}
	_lastClickIdx[type] = idx;
	updateSelectionUI(type);
}

function updateSelectionUI(type) {
	var sel = _selection[type];
	var listId = type === 'staged' ? 'staged-list' : 'unstaged-list';
	var listEl = document.getElementById(listId);
	var items = listEl.querySelectorAll('.file-item[data-idx]');
	items.forEach(function(item) {
		var i = parseInt(item.dataset.idx);
		if (sel.has(i)) item.classList.add('selected'); else item.classList.remove('selected');
	});
	var folders = listEl.querySelectorAll('.tree-folder-header');
	folders.forEach(function(hdr) {
		var actionBtn = hdr.querySelector('[data-folder-indices]');
		if (!actionBtn) { hdr.classList.remove('selected'); return; }
		var indices = actionBtn.dataset.folderIndices.split(',').map(Number);
		var allSelected = indices.length > 0 && indices.every(function(i) { return sel.has(i); });
		if (allSelected) hdr.classList.add('selected'); else hdr.classList.remove('selected');
	});
}

function clearSelection(type) {
	_selection[type].clear();
	_lastClickIdx[type] = -1;
	updateSelectionUI(type);
}

function getSelectedPaths(type, clickedIdx) {
	var sel = _selection[type];
	var files = type === 'staged' ? _staged : _unstaged;
	if (sel.size > 1 && sel.has(clickedIdx)) {
		var paths = [];
		sel.forEach(function(idx) { if (files[idx]) paths.push(files[idx].filePath); });
		return paths;
	}
	return null;
}

function handleFolderSelect(type, indices, e) {
	var sel = _selection[type];
	if (e.shiftKey) {
		indices.forEach(function(i) { sel.add(i); });
	} else {
		sel.clear();
		indices.forEach(function(i) { sel.add(i); });
	}
	if (indices.length) _lastClickIdx[type] = indices[indices.length - 1];
	updateSelectionUI(type);
}

document.getElementById('staged-list').addEventListener('click', (e) => {
	const folderBtn = e.target.closest('[data-folder-action]');
	if (folderBtn) {
		e.stopPropagation(); e.preventDefault();
		var indices = folderBtn.dataset.folderIndices.split(',').map(Number);
		var paths = indices.map(function(idx) { return _staged[idx] ? _staged[idx].filePath : null; }).filter(Boolean);
		if (paths.length) sendCommand(folderBtn.dataset.folderAction + '-files', { filePaths: paths });
		return;
	}
	var folderHdr = e.target.closest('.tree-folder-header');
	if (folderHdr) {
		var chevron = e.target.closest('.tree-chevron');
		if (chevron) { folderHdr.classList.toggle('collapsed'); folderHdr.nextElementSibling.classList.toggle('hidden'); swapFolderIcon(folderHdr); return; }
		var actionBtns = folderHdr.querySelectorAll('[data-folder-action]');
		var allIndices = [];
		actionBtns.forEach(function(b) { if (b.dataset.folderIndices) allIndices = b.dataset.folderIndices.split(',').map(Number); });
		if (allIndices.length) { handleFolderSelect('staged', allIndices, e); }
		return;
	}
	const btn = e.target.closest('[data-action]'); const li = e.target.closest('.file-item[data-idx]');
	if (!li) return; const idx = parseInt(li.dataset.idx);
	if (btn) {
		e.stopPropagation();
		var bulkPaths = getSelectedPaths('staged', idx);
		if (bulkPaths) { sendCommand(btn.dataset.action + '-files', { filePaths: bulkPaths }); clearSelection('staged'); }
		else { const f = _staged[idx]; if (f && btn.dataset.action === 'unstage') sendCommand('unstage-file', { filePath: f.filePath }); }
	}
	else { handleFileSelect('staged', idx, e); const f = _staged[idx]; if (f && !e.shiftKey) sendCommand('open-diff', { filePath: f.filePath, isStaged: true }); }
});
document.getElementById('unstaged-list').addEventListener('click', (e) => {
	const folderBtn = e.target.closest('[data-folder-action]');
	if (folderBtn) {
		e.stopPropagation(); e.preventDefault();
		var indices = folderBtn.dataset.folderIndices.split(',').map(Number);
		var paths = indices.map(function(idx) { return _unstaged[idx] ? _unstaged[idx].filePath : null; }).filter(Boolean);
		if (paths.length) sendCommand(folderBtn.dataset.folderAction + '-files', { filePaths: paths });
		return;
	}
	var folderHdr = e.target.closest('.tree-folder-header');
	if (folderHdr) {
		var chevron = e.target.closest('.tree-chevron');
		if (chevron) { folderHdr.classList.toggle('collapsed'); folderHdr.nextElementSibling.classList.toggle('hidden'); swapFolderIcon(folderHdr); return; }
		var actionBtns = folderHdr.querySelectorAll('[data-folder-action]');
		var allIndices = [];
		actionBtns.forEach(function(b) { if (b.dataset.folderIndices) allIndices = b.dataset.folderIndices.split(',').map(Number); });
		if (allIndices.length) { handleFolderSelect('unstaged', allIndices, e); }
		return;
	}
	const btn = e.target.closest('[data-action]'); const li = e.target.closest('.file-item[data-idx]');
	if (!li) return; const idx = parseInt(li.dataset.idx);
	if (btn) {
		e.stopPropagation();
		var bulkPaths = getSelectedPaths('unstaged', idx);
		if (bulkPaths) { sendCommand(btn.dataset.action + '-files', { filePaths: bulkPaths }); clearSelection('unstaged'); }
		else { const f = _unstaged[idx]; if (!f) return; if (btn.dataset.action === 'stage') sendCommand('stage-file', { filePath: f.filePath }); if (btn.dataset.action === 'discard') sendCommand('discard-file', { filePath: f.filePath }); }
	}
	else { handleFileSelect('unstaged', idx, e); const f = _unstaged[idx]; if (f && !e.shiftKey) sendCommand('open-diff', { filePath: f.filePath, isStaged: false }); }
});

document.getElementById('merge-list').addEventListener('click', (e) => {
	const actionBtn = e.target.closest('[data-merge-action]');
	if (actionBtn) {
		e.stopPropagation();
		const idx = parseInt(actionBtn.dataset.mergeFileIdx);
		const f = _mergeConflicts[idx];
		if (!f) return;
		if (actionBtn.dataset.mergeAction === 'stage') {
			sendCommand('stage-file', { filePath: f.filePath });
		} else if (actionBtn.dataset.mergeAction === 'open') {
			sendCommand('open-merge-editor', { filePath: f.filePath });
		}
		return;
	}
	const li = e.target.closest('.file-item[data-merge-idx]');
	if (!li) return;
	const idx = parseInt(li.dataset.mergeIdx);
	const f = _mergeConflicts[idx];
	if (f) sendCommand('open-merge-editor', { filePath: f.filePath });
});

var _ctxMergeIdx = -1;
document.getElementById('merge-list').addEventListener('contextmenu', (e) => {
	const li = e.target.closest('.file-item[data-merge-idx]');
	if (!li) return;
	e.preventDefault();
	_ctxMergeIdx = parseInt(li.dataset.mergeIdx);
	const menu = document.getElementById('merge-context-menu');
	menu.style.display = 'block';
	menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
	menu.style.top = Math.min(e.clientY, window.innerHeight - 120) + 'px';
});
document.getElementById('merge-context-menu').addEventListener('click', (e) => {
	const item = e.target.closest('[data-ctx]');
	if (!item || _ctxMergeIdx < 0) return;
	const f = _mergeConflicts[_ctxMergeIdx];
	if (!f) return;
	const action = item.dataset.ctx;
	if (action === 'accept-current') sendCommand('accept-merge', { filePath: f.filePath, type: 'current' });
	else if (action === 'accept-incoming') sendCommand('accept-merge', { filePath: f.filePath, type: 'incoming' });
	else if (action === 'open') sendCommand('open-merge-editor', { filePath: f.filePath });
	else if (action === 'stage') sendCommand('stage-file', { filePath: f.filePath });
	hideContextMenu();
});
function hideContextMenu() {
	document.getElementById('merge-context-menu').style.display = 'none';
	_ctxMergeIdx = -1;
}
document.addEventListener('click', hideContextMenu);
document.addEventListener('contextmenu', (e) => {
	if (!e.target.closest('#merge-list')) hideContextMenu();
});

window.addEventListener('message', (event) => {
	const msg = event.data;
	if (msg.command === 'icon-theme') {
		_iconTheme = msg.theme;
		renderStagedList(_staged);
		renderUnstagedList(_unstaged);
		renderMergeList(_mergeConflicts);
	}
	if (msg.command === 'update-state') {
		var newStaged = msg.staged || []; var newUnstaged = msg.unstaged || [];
		var stagedChanged = newStaged.length !== _staged.length || newStaged.some(function(f, i) { return !_staged[i] || f.filePath !== _staged[i].filePath || f.status !== _staged[i].status; });
		var unstagedChanged = newUnstaged.length !== _unstaged.length || newUnstaged.some(function(f, i) { return !_unstaged[i] || f.filePath !== _unstaged[i].filePath || f.status !== _unstaged[i].status; });
		var savedStagedSel = null; var savedUnstagedSel = null;
		if (stagedChanged && _selection.staged.size > 0) {
			savedStagedSel = []; _selection.staged.forEach(function(i) { if (_staged[i]) savedStagedSel.push(_staged[i].filePath); });
		}
		if (unstagedChanged && _selection.unstaged.size > 0) {
			savedUnstagedSel = []; _selection.unstaged.forEach(function(i) { if (_unstaged[i]) savedUnstagedSel.push(_unstaged[i].filePath); });
		}
		_staged = newStaged; _unstaged = newUnstaged;
		if (stagedChanged) { _selection.staged.clear(); renderStagedList(_staged); }
		if (unstagedChanged) { _selection.unstaged.clear(); renderUnstagedList(_unstaged); }
		// Merge conflicts
		var newMerge = msg.mergeConflicts || [];
		renderMergeList(newMerge);
		// Show/hide abort merge button based on merge state
		var abortBtn = document.getElementById('abort-merge-btn');
		var mergeBanner = document.getElementById('merge-conflict-banner');
		if (msg.isMerging) {
			if (abortBtn) abortBtn.style.display = '';
			if (newMerge.length === 0 && mergeBanner) {
				// Merging but all conflicts resolved — show banner with different text
				mergeBanner.style.display = 'flex';
				document.getElementById('merge-conflict-text').textContent = 'All conflicts resolved — commit to complete merge';
			}
		} else {
			if (abortBtn) abortBtn.style.display = 'none';
		}
		if (savedStagedSel && savedStagedSel.length) {
			savedStagedSel.forEach(function(fp) { var i = _staged.findIndex(function(f) { return f.filePath === fp; }); if (i >= 0) _selection.staged.add(i); });
			updateSelectionUI('staged');
		}
		if (savedUnstagedSel && savedUnstagedSel.length) {
			savedUnstagedSel.forEach(function(fp) { var i = _unstaged.findIndex(function(f) { return f.filePath === fp; }); if (i >= 0) _selection.unstaged.add(i); });
			updateSelectionUI('unstaged');
		}
		document.getElementById('btn-review-staged').style.display = _staged.length > 0 ? 'flex' : 'none';
		const commitBtn = document.querySelector('.btn-commit');
		if (commitBtn) {
			commitBtn.disabled = _staged.length === 0;
			commitBtn.style.opacity = _staged.length === 0 ? '0.5' : '1';
			commitBtn.style.cursor = _staged.length === 0 ? 'not-allowed' : 'pointer';
		}
		const ta = document.getElementById('commit-msg');
		if (document.activeElement !== ta) { ta.value = msg.commitMsg || ''; autoResize(ta); }
	}
	if (msg.command === 'clear-commit-msg') { const ta = document.getElementById('commit-msg'); ta.value = ''; autoResize(ta); }
	if (msg.command === 'update-graph') {
		const pushBanner = document.getElementById('push-banner');
		const pushText = document.getElementById('push-banner-text');
		const forcePushBanner = document.getElementById('force-push-banner');
		if (_forcePushActive) {
			pushBanner.style.display = 'none';
			forcePushBanner.style.display = 'flex';
		} else {
			forcePushBanner.style.display = 'none';
			if (msg.ahead > 0) { pushText.textContent = msg.ahead + ' commit' + (msg.ahead > 1 ? 's' : '') + ' to push'; pushBanner.style.display = 'flex'; }
			else { pushBanner.style.display = 'none'; }
		}
		const syncBanner = document.getElementById('sync-banner');
		const syncText = document.getElementById('sync-banner-text');
		const commitArea = document.querySelector('.commit-area');
		if (msg.behind > 0 && !_forcePushActive) {
			syncText.textContent = 'Sync Changes ' + msg.behind + '↓';
			syncBanner.style.display = 'flex';
			if (commitArea) { commitArea.classList.add('sync-required'); }
		} else {
			syncBanner.style.display = 'none';
			if (commitArea) { commitArea.classList.remove('sync-required'); }
		}
	}
	if (msg.command === 'force-push-status') {
		_forcePushActive = !!msg.active;
		const forcePushBanner = document.getElementById('force-push-banner');
		const pushBanner = document.getElementById('push-banner');
		const syncBanner = document.getElementById('sync-banner');
		const commitArea = document.querySelector('.commit-area');
		if (_forcePushActive) {
			forcePushBanner.style.display = 'flex';
			pushBanner.style.display = 'none';
			syncBanner.style.display = 'none';
			if (commitArea) { commitArea.classList.remove('sync-required'); }
		} else {
			forcePushBanner.style.display = 'none';
		}
	}
});
vscode.postMessage({ command: 'ready' });
<\/script>`;
}
