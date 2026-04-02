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
<div class="footer">
${getGraphHtml()}
${getCodeReviewHtml()}
${getSettingsHtml()}
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
.main-content { flex: 1; overflow-y: auto; min-height: 0; padding-bottom: var(--footer-height, 80px); }
.footer {
	position: fixed; bottom: 0; left: 0; right: 0;
	background: var(--vscode-sideBar-background);
	border-top: 1px solid var(--vscode-sideBar-border, transparent); z-index: 10;
}
.section-header {
	display: flex; align-items: center; justify-content: space-between;
	padding: 4px 8px; font-size: 11px; font-weight: 600;
	text-transform: uppercase; letter-spacing: 0.5px;
	color: var(--vscode-sideBarSectionHeader-foreground);
	background: var(--vscode-sideBarSectionHeader-background);
	border-top: 1px solid var(--vscode-sideBar-border, transparent);
	cursor: pointer; user-select: none;
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
	<span class="hdr-left"><span class="chevron">▾</span>GITMEW SOURCE CONTROL</span>
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
	</div>
	<div class="section-header" style="padding-left:8px" onclick="toggleSection('staged-body', this)">
		<span class="hdr-left"><span class="chevron">▾</span> Staged Changes</span>
		<div class="hdr-right" onclick="event.stopPropagation()">
			<button class="icon-btn" title="Unstage All Changes" onclick="sendCommand('unstage-all')">−</button>
			<span class="count" id="staged-count">0</span>
		</div>
	</div>
	<div id="staged-body" class="section-body">
		<div class="file-list" id="staged-list"><div class="empty-state">No staged changes</div></div>
	</div>
	<div class="section-header" style="padding-left:8px" onclick="toggleSection('unstaged-body', this)">
		<span class="hdr-left"><span class="chevron">▾</span> Changes</span>
		<div class="hdr-right" onclick="event.stopPropagation()">
			<button class="icon-btn" title="Discard All Changes" onclick="sendCommand('discard-all')">↩</button>
			<button class="icon-btn" title="Stage All Changes" onclick="sendCommand('stage-all')">+</button>
			<span class="count" id="unstaged-count">0</span>
		</div>
	</div>
	<div id="unstaged-body" class="section-body">
		<div class="file-list" id="unstaged-list"><div class="empty-state">No changes</div></div>
	</div>
</div>`;
}

function getGraphHtml(): string {
	const svgRefresh = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834zM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5z"/></svg>`;
	const svgWarn = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8.22 1.754a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368L8.22 1.754zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575L6.457 1.047zM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-.25-5.25a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 0 1.5 0v-2.5z"/></svg>`;
	return `
<div class="section-header collapsed" onclick="toggleSection('graph-body', this)">
	<span class="hdr-left"><span class="chevron">▾</span> GRAPH</span>
	<div class="hdr-right" onclick="event.stopPropagation()">
		<span id="graph-branch-badge" class="branch-badge" style="display:none"></span>
		<button class="icon-btn" title="Refresh graph" onclick="sendCommand('refresh')">${svgRefresh}</button>
	</div>
</div>
<div id="graph-body" class="section-body hidden" style="height:200px;overflow-y:auto;position:relative;">
	<div id="squash-toolbar" style="display:none" class="squash-toolbar">
		<span class="squash-count" id="squash-count-text">0 selected</span>
		<button class="squash-cancel-btn" onclick="cancelSquash()">Cancel</button>
		<button class="squash-btn" id="squash-btn" onclick="doSquash()" disabled>Squash</button>
	</div>
	<div id="undo-squash-banner" style="display:none" class="undo-squash-banner">
		<span>Squash completed</span>
		<button class="squash-cancel-btn" onclick="undoLastSquash()">Undo Squash</button>
		<button class="squash-dismiss-btn" onclick="dismissSquashBackup()">✕</button>
	</div>
	<div id="conflict-banner" style="display:none" class="conflict-banner">${svgWarn}<span id="conflict-text"></span></div>
	<div id="sync-info" style="display:none" class="sync-info"></div>
	<ul class="commit-list" id="commit-list"><li class="empty-state">No commits</li></ul>
	<div id="graph-resize-handle" class="resize-handle"></div>
</div>

<!-- Squash message dialog -->
<div id="squash-dialog" class="squash-dialog" style="display:none">
	<div class="squash-dialog-header">Squash Commit Message</div>
	<div class="squash-dialog-body">
		<textarea id="squash-msg" class="squash-msg-input" placeholder="Enter commit message..."></textarea>
		<div class="squash-dialog-actions">
			<button class="squash-cancel-btn" onclick="closeSquashDialog()">Cancel</button>
			<button class="input-icon-btn" title="Generate message with AI" onclick="generateSquashMsg()" id="squash-generate-btn" style="font-size:12px;padding:2px 6px;opacity:0.8">
				<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 1l1.5 3.5L13 6l-3.5 1.5L8 11l-1.5-3.5L3 6l3.5-1.5L7.5 1zm0 2.18L6.72 5.1 4.5 6l2.22.9.78 1.92.78-1.92L10.5 6l-2.22-.9L7.5 3.18zM2 12l.67 1.33L4 14l-1.33.67L2 16l-.67-1.33L0 14l1.33-.67L2 12zm11 0l.67 1.33L15 14l-1.33.67L13 16l-.67-1.33L11 14l1.33-.67L13 12z"/></svg>
				Generate
			</button>
			<button class="squash-btn" id="squash-confirm-btn" onclick="confirmSquash()">Squash</button>
		</div>
	</div>
</div>`;
}

function getCodeReviewHtml(): string {
	const svgEye = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3C4.5 3 1.5 5.5 1.5 8s3 5 6.5 5 6.5-2.5 6.5-5-3-5-6.5-5zm0 8.5A3.5 3.5 0 1 1 8 4.5a3.5 3.5 0 0 1 0 7zm0-5.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>`;
	const svgMerge = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v1.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z"/></svg>`;
	const svgHistory = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.643 3.143L.427 1.927A.25.25 0 0 0 0 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 0 0 .177-.427L2.715 4.215a6.5 6.5 0 1 1-1.18 4.458.75.75 0 1 0-1.493.154 8.001 8.001 0 1 0 1.6-5.684zM8 5.5a.75.75 0 0 1 .75.75v2.69l1.28 1.28a.75.75 0 0 1-1.06 1.06l-1.5-1.5A.75.75 0 0 1 7.25 9V6.25A.75.75 0 0 1 8 5.5z"/></svg>`;
	return `
<div class="section-header collapsed" onclick="toggleSection('review-body', this)">
	<span class="hdr-left"><span class="chevron">▾</span> CODE REVIEW</span>
</div>
<div id="review-body" class="section-body hidden">
	<div class="action-item" onclick="sendCommand('review-staged')"><span class="ai-icon">${svgEye}</span><div><div class="ai-label">Review Staged Changes</div><div class="ai-desc">AI review of staged files</div></div></div>
	<div class="action-item" onclick="sendCommand('review-merge')"><span class="ai-icon">${svgMerge}</span><div><div class="ai-label">Review Merge</div><div class="ai-desc">Review PR or generate description</div></div></div>
	<div class="action-item" onclick="sendCommand('review-merged-branch')"><span class="ai-icon">${svgHistory}</span><div><div class="ai-label">Review Merged Branch</div><div class="ai-desc">Review a merged branch</div></div></div>
</div>`;
}

function getSettingsHtml(): string {
	const svgGear = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.103-.303c-.066-.019-.176-.011-.299.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.103.303c.066.019.176.011.299-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0zM8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm0 1.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>`;
	const svgKey = `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M10.5 0a5.5 5.5 0 0 1 .5 10.975V13.5a.5.5 0 0 1-.146.354l-2 2a.5.5 0 0 1-.707 0l-2-2A.5.5 0 0 1 6 13.5v-.525A5.5 5.5 0 0 1 10.5 0zm0 1a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM7 13.707l1.5 1.5 1.5-1.5V11.5H7v2.207zM10.5 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/></svg>`;
	return `
<div class="section-header collapsed" onclick="toggleSection('settings-body', this)">
	<span class="hdr-left"><span class="chevron">▾</span> SETTINGS</span>
</div>
<div id="settings-body" class="section-body hidden">
	<div class="action-item" onclick="sendCommand('setup-model')"><span class="ai-icon">${svgGear}</span><span class="ai-label">Setup AI Model</span></div>
	<div class="action-item" onclick="sendCommand('manage-api-keys')"><span class="ai-icon">${svgKey}</span><span class="ai-label">Manage API Keys</span></div>
</div>`;
}

function getScript(): string {
	return `<style>
.commit-area { padding: 8px 8px 6px; }
.commit-input-wrap { margin-bottom: 6px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; display: flex; align-items: flex-start; }
.commit-input-wrap:focus-within { border-color: var(--vscode-focusBorder); outline: 1px solid var(--vscode-focusBorder); }
textarea { flex: 1; min-height: 52px; max-height: 200px; resize: none; background: transparent; color: var(--vscode-input-foreground); border: none; padding: 6px 4px 6px 8px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); outline: none; line-height: 1.4; overflow-y: scroll; scrollbar-width: none; }
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
.file-list { list-style: none; }
.tree-folder { position: relative; }
.tree-folder-children { position: relative; }
.tree-folder:hover > .tree-folder-children::before {
	content: ''; position: absolute; top: 0; bottom: 0;
	left: var(--guide-left, 16px); width: 1px;
	background: var(--vscode-tree-indentGuidesStroke, rgba(255,255,255,0.15));
}
.tree-folder-header { display: flex; align-items: center; padding: 1px 4px 1px 0; cursor: pointer; font-size: 15px; gap: 2px; user-select: none; }
.tree-folder-header:hover { background: var(--vscode-list-hoverBackground); }
.tree-folder-header .tree-chevron { font-size: 15px; width: 16px; text-align: center; flex-shrink: 0; transition: transform 0.1s; display: inline-block; }
.tree-folder-header.collapsed .tree-chevron { transform: rotate(-90deg); }
.tree-folder-header .tree-folder-icon { flex-shrink: 0; opacity: 0.7; margin-right: 2px; }
.tree-folder-header .tree-folder-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.folder-actions { display: none; gap: 1px; flex-shrink: 0; }
.tree-folder-header:hover .folder-actions { display: flex; }
.tree-folder-children { }
.tree-folder-children.hidden { display: none; }
.file-item { display: flex; align-items: center; padding: 1px 4px 1px 0; cursor: pointer; font-size: 15px; gap: 2px; position: relative; }
.file-item:hover { background: var(--vscode-list-hoverBackground); }
.file-item .file-icon { flex-shrink: 0; opacity: 0.7; margin-right: 2px; }
.file-item .file-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-badge { font-size: 11px; font-weight: 600; width: 14px; text-align: center; flex-shrink: 0; }
.status-M { color: #e2c08d; } .status-A { color: #73c991; } .status-D { color: #f14c4c; } .status-R { color: #73c991; } .status-U { color: #e2c08d; } .status-C { color: #73c991; }
.file-actions { display: none; gap: 1px; flex-shrink: 0; } .file-item:hover .file-actions { display: flex; }
.file-action-btn { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 1px 3px; border-radius: 2px; font-size: 12px; opacity: 0.8; line-height: 1; }
.file-action-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.empty-state { padding: 6px 20px; font-size: 12px; color: var(--vscode-descriptionForeground); font-style: italic; }
.action-item { display: flex; align-items: center; padding: 6px 8px 6px 12px; cursor: pointer; gap: 8px; font-size: 12px; }
.action-item:hover { background: var(--vscode-list-hoverBackground); }
.action-item .ai-icon { font-size: 14px; flex-shrink: 0; } .action-item .ai-label { flex: 1; } .action-item .ai-desc { font-size: 11px; color: var(--vscode-descriptionForeground); }
.chevron { font-size: 15px; transition: transform 0.15s; display: inline-block; }
.collapsed .chevron { transform: rotate(-90deg); } .section-body.hidden { display: none; }
.branch-badge { font-size: 10px; padding: 1px 6px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 10px; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sync-info { padding: 4px 12px; font-size: 11px; color: var(--vscode-descriptionForeground); display: flex; gap: 8px; align-items: center; }
.sync-ahead { color: var(--vscode-gitDecoration-addedResourceForeground, #73c991); }
.sync-behind { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }
.conflict-banner { margin: 4px 8px; padding: 6px 8px; background: var(--vscode-inputValidation-errorBackground, rgba(241,76,76,0.15)); border: 1px solid var(--vscode-inputValidation-errorBorder, #f14c4c); border-radius: 3px; font-size: 11px; display: flex; align-items: center; gap: 6px; color: var(--vscode-errorForeground, #f14c4c); }
.commit-list { list-style: none; }
.commit-item { display: flex; align-items: center; gap: 0; padding: 0 8px 0 0; font-size: 12px; cursor: default; min-height: 22px; }
.commit-item:hover { background: var(--vscode-list-hoverBackground); }
.commit-graph-col { flex-shrink: 0; width: 28px; position: relative; display: flex; align-items: center; justify-content: center; align-self: stretch; }
.commit-graph-col svg { overflow: visible; display: block; }
.commit-info { flex: 1; min-width: 0; padding: 2px 0; }
.commit-subject { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 1.4; }
.commit-subject.unpushed { font-weight: 600; }
.commit-meta { font-size: 10px; color: var(--vscode-descriptionForeground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.commit-sha { font-size: 10px; color: var(--vscode-descriptionForeground); font-family: monospace; flex-shrink: 0; padding-left: 4px; }
.commit-files-row { list-style: none; } .commit-file-list { list-style: none; }
.commit-file-item { display: flex; align-items: center; gap: 4px; padding: 1px 8px 1px 32px; font-size: 11px; cursor: pointer; }
.commit-file-item:hover { background: var(--vscode-list-hoverBackground); }
.commit-file-item .cf-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.commit-file-item .cf-dir { color: var(--vscode-descriptionForeground); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40%; }
.commit-file-item .cf-status { font-size: 10px; font-weight: 600; width: 12px; text-align: center; flex-shrink: 0; }
.commit-item.expanded { background: var(--vscode-list-activeSelectionBackground, rgba(255,255,255,0.05)); }
.commit-item.is-pushed { opacity: 0.65; } .commit-item.is-pushed:hover { opacity: 1; }
.commit-actions { display: none; flex-shrink: 0; } .commit-item.is-local:hover .commit-actions { display: flex; }
.undo-commit-btn { background: none; border: 1px solid var(--vscode-foreground); color: var(--vscode-foreground); border-radius: 2px; padding: 1px 6px; font-size: 10px; cursor: pointer; opacity: 0.7; white-space: nowrap; }
.undo-commit-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.squash-toolbar {
	display: flex; align-items: center; gap: 6px; padding: 4px 8px;
	background: var(--vscode-sideBarSectionHeader-background);
	border-bottom: 1px solid var(--vscode-sideBar-border, transparent);
}
.squash-toolbar .squash-count { font-size: 11px; flex: 1; color: var(--vscode-descriptionForeground); }
.squash-btn {
	background: var(--vscode-button-background); color: var(--vscode-button-foreground);
	border: none; border-radius: 2px; padding: 2px 10px; cursor: pointer;
	font-size: 11px; font-weight: 500; white-space: nowrap;
}
.squash-btn:hover { background: var(--vscode-button-hoverBackground); }
.squash-btn:disabled { opacity: 0.5; cursor: default; }
.squash-cancel-btn {
	background: none; border: 1px solid var(--vscode-foreground); color: var(--vscode-foreground);
	border-radius: 2px; padding: 2px 8px; cursor: pointer; font-size: 11px; opacity: 0.7;
}
.squash-cancel-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.undo-squash-banner {
	display: flex; align-items: center; gap: 6px; padding: 4px 8px;
	background: var(--vscode-inputValidation-infoBackground, rgba(78,201,176,0.15));
	border-bottom: 1px solid var(--vscode-inputValidation-infoBorder, rgba(78,201,176,0.4));
	font-size: 11px; color: var(--vscode-foreground);
}
.undo-squash-banner span { flex: 1; }
.squash-dismiss-btn {
	background: none; border: none; color: var(--vscode-foreground);
	cursor: pointer; opacity: 0.6; font-size: 12px; padding: 0 2px;
}
.squash-dismiss-btn:hover { opacity: 1; }
.commit-checkbox { flex-shrink: 0; cursor: pointer; accent-color: var(--vscode-focusBorder); }
.squash-dialog {
	position: sticky; top: 0; left: 0; right: 0; z-index: 30;
	background: var(--vscode-sideBar-background);
	border-bottom: 2px solid var(--vscode-focusBorder);
}
.squash-dialog-header {
	padding: 6px 8px; font-size: 11px; font-weight: 600;
	text-transform: uppercase; letter-spacing: 0.5px;
	color: var(--vscode-sideBarSectionHeader-foreground);
	background: var(--vscode-sideBarSectionHeader-background);
}
.squash-dialog-body { padding: 6px 8px; }
.squash-msg-input {
	width: 100%; min-height: 60px; max-height: 120px; resize: vertical;
	background: var(--vscode-input-background); color: var(--vscode-input-foreground);
	border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px;
	padding: 6px 8px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
	outline: none; line-height: 1.4; margin-bottom: 6px;
}
.squash-msg-input:focus { border-color: var(--vscode-focusBorder); }
.squash-dialog-actions { display: flex; gap: 4px; align-items: center; }
.squash-dialog-actions .squash-cancel-btn { margin-right: auto; }
.squash-dialog-actions .input-icon-btn { display: flex; align-items: center; gap: 3px; border: 1px solid var(--vscode-foreground); border-radius: 2px; }
.graph-divider { list-style: none; display: flex; align-items: center; padding: 2px 8px; gap: 6px; }
.graph-divider span { font-size: 10px; color: var(--vscode-descriptionForeground); opacity: 0.5; white-space: nowrap; }
.resize-handle {
	position: absolute; top: 0; left: 0; right: 0; height: 4px;
	cursor: ns-resize; z-index: 20;
}
.resize-handle:hover, .resize-handle.active { background: var(--vscode-focusBorder); opacity: 0.6; }
</style>
` + getScriptBody();
}

function getScriptBody(): string {
	return `<script>
const vscode = acquireVsCodeApi();
function sendCommand(cmd, extra) { vscode.postMessage({ command: cmd, ...extra }); }
function doCommit() { const msg = document.getElementById('commit-msg').value; vscode.postMessage({ command: 'commit', message: msg }); }
document.getElementById('commit-msg').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) doCommit(); });
const commitMsg = document.getElementById('commit-msg');
function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px'; }
commitMsg.addEventListener('input', (e) => { autoResize(e.target); vscode.postMessage({ command: 'commit-msg-change', message: e.target.value }); });
function toggleSection(bodyId, headerEl) { document.getElementById(bodyId).classList.toggle('hidden'); headerEl.classList.toggle('collapsed'); }
const STATUS_MAP = { 0:'M', 1:'A', 2:'D', 3:'R', 4:'C', 5:'M', 6:'D', 7:'U', 9:'A' };
function statusLetter(s) { return STATUS_MAP[s] || 'M'; }

function renderStagedList(files) {
	var el = document.getElementById('staged-list');
	document.getElementById('staged-count').textContent = files.length;
	if (!files.length) { el.innerHTML = '<div class="empty-state">No staged changes</div>'; return; }
	el.innerHTML = buildFileTree(files, 'staged');
}
function renderUnstagedList(files) {
	var el = document.getElementById('unstaged-list');
	document.getElementById('unstaged-count').textContent = files.length;
	if (!files.length) { el.innerHTML = '<div class="empty-state">No changes</div>'; return; }
	el.innerHTML = buildFileTree(files, 'unstaged');
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

function renderTreeNode(node, type, depth) {
	var html = '';
	var pad = 12 + depth * 8;
	var folders = Object.keys(node).filter(function(k) { return k !== '_files'; }).sort();
	folders.forEach(function(name) {
		var childIndices = collectIndices(node[name]);
		var folderActions = '';
		if (type === 'staged') {
			folderActions = '<button class="file-action-btn" data-folder-action="unstage" data-folder-indices="'+childIndices.join(',')+'" title="Unstage Folder">−</button>';
		} else {
			folderActions = '<button class="file-action-btn" data-folder-action="discard" data-folder-indices="'+childIndices.join(',')+'" title="Discard Folder">↩</button><button class="file-action-btn" data-folder-action="stage" data-folder-indices="'+childIndices.join(',')+'" title="Stage Folder">+</button>';
		}
		html += '<div class="tree-folder">';
		html += '<div class="tree-folder-header" style="padding-left:'+pad+'px">';
		html += '<span class="tree-chevron">▾</span>';
		html += '<span class="tree-folder-name">'+name+'</span>';
		html += '<div class="folder-actions">'+folderActions+'</div>';
		html += '</div>';
		html += '<div class="tree-folder-children" style="--guide-left:'+(pad+6)+'px">';
		html += renderTreeNode(node[name], type, depth + 1);
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
			html += '<span class="file-name">'+f.fileName+'</span>';
			html += '<div class="file-actions">'+actionBtns+'</div>';
			html += '<span class="status-badge status-'+sl+'">'+sl+'</span>';
			html += '</div>';
		});
	}
	return html;
}

let _staged = [], _unstaged = [];

document.getElementById('commit-list').addEventListener('click', (e) => {
	const undoBtn = e.target.closest('[data-undo]');
	if (undoBtn) { e.stopPropagation(); sendCommand('undo-commit', { sha: undoBtn.dataset.undo }); return; }
	const li = e.target.closest('.commit-item[data-sha]');
	if (!li) return;
	const sha = li.dataset.sha;
	const filesRow = document.getElementById('cf-' + sha);
	if (!filesRow) return;
	if (filesRow.style.display !== 'none') { filesRow.style.display = 'none'; li.classList.remove('expanded'); }
	else {
		filesRow.style.display = 'block'; li.classList.add('expanded');
		const fileList = document.getElementById('cfl-' + sha);
		if (fileList && fileList.children.length === 0) {
			fileList.innerHTML = '<li style="padding:4px 32px;font-size:11px;opacity:0.6">Loading...</li>';
			vscode.postMessage({ command: 'get-commit-files', sha });
		}
	}
});
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
	if (folderHdr) { folderHdr.classList.toggle('collapsed'); folderHdr.nextElementSibling.classList.toggle('hidden'); return; }
	const btn = e.target.closest('[data-action]'); const li = e.target.closest('[data-idx]');
	if (!li) return; const idx = parseInt(li.dataset.idx);
	if (btn) { e.stopPropagation(); const f = _staged[idx]; if (f && btn.dataset.action === 'unstage') sendCommand('unstage-file', { filePath: f.filePath }); }
	else { const f = _staged[idx]; if (f) sendCommand('open-diff', { filePath: f.filePath, isStaged: true }); }
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
	if (folderHdr) { folderHdr.classList.toggle('collapsed'); folderHdr.nextElementSibling.classList.toggle('hidden'); return; }
	const btn = e.target.closest('[data-action]'); const li = e.target.closest('[data-idx]');
	if (!li) return; const idx = parseInt(li.dataset.idx);
	if (btn) { e.stopPropagation(); const f = _unstaged[idx]; if (!f) return; if (btn.dataset.action === 'stage') sendCommand('stage-file', { filePath: f.filePath }); if (btn.dataset.action === 'discard') sendCommand('discard-file', { filePath: f.filePath }); }
	else { const f = _unstaged[idx]; if (f) sendCommand('open-diff', { filePath: f.filePath, isStaged: false }); }
});

function renderGraph(data) {
	const badge = document.getElementById('graph-branch-badge');
	if (data.branch) { badge.textContent = data.branch; badge.style.display = 'inline-block'; }
	const pushBanner = document.getElementById('push-banner');
	const pushText = document.getElementById('push-banner-text');
	if (data.ahead > 0) { pushText.textContent = data.ahead + ' commit' + (data.ahead > 1 ? 's' : '') + ' to push'; pushBanner.style.display = 'flex'; }
	else { pushBanner.style.display = 'none'; }
	const syncEl = document.getElementById('sync-info');
	if (data.upstream && (data.ahead > 0 || data.behind > 0)) {
		let parts = [];
		if (data.ahead > 0) parts.push('<span class="sync-ahead">↑ '+data.ahead+' to push</span>');
		if (data.behind > 0) parts.push('<span class="sync-behind">↓ '+data.behind+' to pull</span>');
		syncEl.innerHTML = parts.join('<span style="opacity:0.4"> · </span>'); syncEl.style.display = 'flex';
	} else if (data.upstream && data.ahead === 0 && data.behind === 0) {
		syncEl.innerHTML = '<span style="opacity:0.6">✓ Up to date with '+data.upstream+'</span>'; syncEl.style.display = 'flex';
	} else { syncEl.style.display = 'none'; }
	const conflictEl = document.getElementById('conflict-banner');
	const conflictText = document.getElementById('conflict-text');
	if (data.conflicts && data.conflicts.length > 0) { conflictText.textContent = data.conflicts.length+' conflict'+(data.conflicts.length>1?'s':'')+' — resolve before committing'; conflictEl.style.display = 'flex'; }
	else { conflictEl.style.display = 'none'; }

	const ul = document.getElementById('commit-list');
	if (!data.commits || data.commits.length === 0) { ul.innerHTML = '<li class="empty-state">No commits</li>'; return; }
	const commits = data.commits; const H = 22; const CX = 10; const R = 4; const LANE_W = 12;
	const lanes = []; const commitLanes = [];
	for (let i = 0; i < commits.length; i++) {
		const c = commits[i]; let lane = lanes.indexOf(c.fullSha);
		if (lane === -1) { lane = lanes.indexOf(null); if (lane === -1) lane = lanes.length; lanes[lane] = c.fullSha; }
		commitLanes.push(lane);
		if (c.parents.length > 0) lanes[lane] = c.parents[0]; else lanes[lane] = null;
		if (c.parents.length > 1) { let fl = lanes.indexOf(null); if (fl === -1) fl = lanes.length; lanes[fl] = c.parents[1]; }
		while (lanes.length > 0 && lanes[lanes.length-1] === null) lanes.pop();
	}
	const maxLane = Math.max(...commitLanes, 0);
	const svgW = CX + maxLane * LANE_W + R + 4;
	const COLORS = ['var(--vscode-foreground)', '#4ec9b0', '#ce9178', '#9cdcfe', '#dcdcaa'];
	let boundaryIdx = -1;
	for (let i = 0; i < commits.length; i++) { if (commits[i].isPushed) { boundaryIdx = i; break; } }

	ul.innerHTML = commits.map((c, i) => {
		const lane = commitLanes[i]; const cx = CX + lane * LANE_W; const cy = H / 2;
		const isPushed = c.isPushed; const isMerge = c.isMerge; const color = COLORS[lane % COLORS.length];
		let svgLines = '';
		const activeLanesHere = new Set();
		const tempLanes = [];
		for (let j = 0; j <= i; j++) {
			const cc = commits[j]; const cl = commitLanes[j];
			while (tempLanes.length <= cl) tempLanes.push(null);
			tempLanes[cl] = cc.parents.length > 0 ? cc.parents[0] : null;
			if (cc.parents.length > 1) { let fl = tempLanes.indexOf(null); if (fl === -1) fl = tempLanes.length; while (tempLanes.length <= fl) tempLanes.push(null); tempLanes[fl] = cc.parents[1]; }
		}
		for (let l = 0; l < tempLanes.length; l++) { if (tempLanes[l] !== null) activeLanesHere.add(l); }
		for (const al of activeLanesHere) {
			if (al === lane) continue;
			const lx = CX + al * LANE_W; const lc = COLORS[al % COLORS.length];
			svgLines += '<line x1="'+lx+'" y1="0" x2="'+lx+'" y2="'+H+'" stroke="'+lc+'" stroke-width="2" opacity="0.5"/>';
		}
		const isFirst = i === 0; const isLast = i === commits.length - 1;
		if (!isFirst) svgLines += '<line x1="'+cx+'" y1="0" x2="'+cx+'" y2="'+(cy-R)+'" stroke="'+color+'" stroke-width="2"/>';
		if (!isLast) svgLines += '<line x1="'+cx+'" y1="'+(cy+R)+'" x2="'+cx+'" y2="'+H+'" stroke="'+color+'" stroke-width="2"/>';
		if (isMerge && c.parents.length > 1) {
			const p2sha = c.parents[1]; let p2lane = -1;
			for (let j = i+1; j < commits.length; j++) { if (commits[j].fullSha === p2sha) { p2lane = commitLanes[j]; break; } }
			if (p2lane === -1) p2lane = lane + 1;
			const p2x = CX + p2lane * LANE_W; const p2c = COLORS[p2lane % COLORS.length];
			svgLines += '<path d="M '+p2x+' '+H+' C '+p2x+' '+cy+' '+cx+' '+cy+' '+cx+' '+cy+'" fill="none" stroke="'+p2c+'" stroke-width="2" opacity="0.7"/>';
		}
		const dotInner = isMerge
			? '<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="none" stroke="'+color+'" stroke-width="2"/><circle cx="'+cx+'" cy="'+cy+'" r="'+(R-2.5)+'" fill="'+(isPushed?color:'none')+'" stroke="'+color+'" stroke-width="1"/>'
			: isPushed
				? '<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="'+color+'" opacity="0.55"/>'
				: '<circle cx="'+cx+'" cy="'+cy+'" r="'+R+'" fill="none" stroke="'+color+'" stroke-width="2"/>';
		const subjectClass = isPushed ? '' : 'unpushed';
		const metaText = isMerge ? 'merge · '+c.date : c.author+' · '+c.date;
		const divider = (i === boundaryIdx && boundaryIdx > 0) ? '<li class="graph-divider"><span>— pushed —</span></li>' : '';
		const undoHtml = !isPushed ? '<div class="commit-actions"><button class="undo-commit-btn" data-undo="'+c.fullSha+'" title="Undo commit">↩ Undo</button></div>' : '';
		const checkboxHtml = '<input type="checkbox" class="commit-checkbox" data-squash-idx="'+i+'" data-pushed="'+(isPushed?'1':'0')+'" onclick="event.stopPropagation();updateSquashSelection('+i+')">';
		return divider + '<li class="commit-item '+(isPushed?'is-pushed':'is-local')+'" data-sha="'+c.fullSha+'" data-idx="'+i+'">'+checkboxHtml+'<div class="commit-graph-col" style="width:'+svgW+'px;min-width:'+svgW+'px"><svg width="'+svgW+'" height="'+H+'" style="overflow:visible">'+svgLines+dotInner+'</svg></div><div class="commit-info"><div class="commit-subject '+subjectClass+'" title="'+c.subject+'">'+c.subject+'</div><div class="commit-meta">'+metaText+'</div></div>'+undoHtml+'<span class="commit-sha">'+c.sha+'</span></li><li class="commit-files-row" id="cf-'+c.fullSha+'" style="display:none"><ul class="commit-file-list" id="cfl-'+c.fullSha+'"></ul></li>';
	}).join('');
}

function updateSquashSelection(changedIdx) {
	const all = Array.from(document.querySelectorAll('.commit-checkbox'));
	const idx = parseInt(changedIdx);
	const isChecked = all[idx] && all[idx].checked;

	// Auto-select logic: selecting index N auto-selects 0..N, deselecting N auto-deselects N..end
	if (isChecked) {
		// Check all from 0 to idx
		for (let i = 0; i <= idx; i++) { if (all[i]) all[i].checked = true; }
	} else {
		// Uncheck all from idx to end
		for (let i = idx; i < all.length; i++) { if (all[i]) all[i].checked = false; }
	}

	const checks = all.filter(cb => cb.checked);
	const toolbar = document.getElementById('squash-toolbar');
	const countText = document.getElementById('squash-count-text');
	const btn = document.getElementById('squash-btn');
	const count = checks.length;
	if (count > 0) {
		toolbar.style.display = 'flex';
		const hasPushed = checks.some(cb => cb.dataset.pushed === '1');
		const warn = hasPushed ? ' (includes pushed ⚠)' : '';
		countText.textContent = count + ' commit' + (count > 1 ? 's' : '') + ' selected' + warn;
		btn.disabled = count < 2;
	} else {
		toolbar.style.display = 'none';
	}
}
function cancelSquash() {
	document.querySelectorAll('.commit-checkbox').forEach(cb => { cb.checked = false; cb.disabled = false; });
	document.getElementById('squash-toolbar').style.display = 'none';
	document.getElementById('squash-dialog').style.display = 'none';
	_squashCount = 0;
}
function lockCheckboxes() {
	document.querySelectorAll('.commit-checkbox').forEach(cb => cb.disabled = true);
}
function unlockCheckboxes() {
	document.querySelectorAll('.commit-checkbox').forEach(cb => cb.disabled = false);
}
let _squashCount = 0;
function doSquash() {
	const checks = Array.from(document.querySelectorAll('.commit-checkbox:checked'));
	if (checks.length < 2) return;
	_squashCount = checks.length;
	// Lock checkboxes while dialog is open
	lockCheckboxes();
	// Pre-fill with combined commit messages
	sendCommand('get-squash-messages', { count: _squashCount });
	document.getElementById('squash-dialog').style.display = 'block';
	document.getElementById('squash-msg').value = '';
	document.getElementById('squash-msg').focus();
}
function closeSquashDialog() {
	document.getElementById('squash-dialog').style.display = 'none';
	unlockCheckboxes();
	_squashCount = 0;
}
function confirmSquash() {
	const msg = document.getElementById('squash-msg').value;
	if (!msg || !msg.trim()) return;
	const count = _squashCount;
	closeSquashDialog();
	cancelSquash();
	sendCommand('squash-commits', { count: count, message: msg });
}
function generateSquashMsg() {
	const btn = document.getElementById('squash-generate-btn');
	btn.disabled = true;
	btn.style.opacity = '0.4';
	sendCommand('generate-squash-msg', { count: _squashCount });
}

let _squashBackup = null;
function undoLastSquash() {
	if (_squashBackup) sendCommand('undo-squash', { backup: _squashBackup });
}
function dismissSquashBackup() {
	if (_squashBackup) sendCommand('dismiss-squash-backup', { backup: _squashBackup });
	_squashBackup = null;
	document.getElementById('undo-squash-banner').style.display = 'none';
}

window.addEventListener('message', (event) => {
	const msg = event.data;
	if (msg.command === 'update-state') {
		_staged = msg.staged || []; _unstaged = msg.unstaged || [];
		renderStagedList(_staged); renderUnstagedList(_unstaged);
		document.getElementById('btn-review-staged').style.display = _staged.length > 0 ? 'flex' : 'none';
		const ta = document.getElementById('commit-msg');
		if (document.activeElement !== ta) { ta.value = msg.commitMsg || ''; autoResize(ta); }
	}
	if (msg.command === 'clear-commit-msg') { const ta = document.getElementById('commit-msg'); ta.value = ''; autoResize(ta); }
	if (msg.command === 'update-graph') { renderGraph(msg); }
	if (msg.command === 'squash-messages') {
		const ta = document.getElementById('squash-msg');
		if (ta) ta.value = msg.text || '';
	}
	if (msg.command === 'squash-msg-generated') {
		const ta = document.getElementById('squash-msg');
		if (ta) ta.value = msg.text || '';
		const btn = document.getElementById('squash-generate-btn');
		if (btn) { btn.disabled = false; btn.style.opacity = '0.8'; }
	}
	if (msg.command === 'squash-done') {
		_squashBackup = msg.backup;
		document.getElementById('undo-squash-banner').style.display = 'flex';
	}
	if (msg.command === 'squash-undone') {
		_squashBackup = null;
		document.getElementById('undo-squash-banner').style.display = 'none';
	}
	if (msg.command === 'commit-files') {
		const ul = document.getElementById('cfl-' + msg.sha);
		if (!ul) return;
		if (!msg.files || msg.files.length === 0) { ul.innerHTML = '<li style="padding:4px 32px;font-size:11px;opacity:0.6">No files changed</li>'; return; }
		const SC = { M: '#e2c08d', A: '#73c991', D: '#f14c4c', R: '#73c991', C: '#73c991' };
		ul.innerHTML = msg.files.map((f, i) => '<li class="commit-file-item" data-sha="'+msg.sha+'" data-file="'+i+'"><span class="cf-name" title="'+f.filePath+'">'+f.fileName+'</span><span class="cf-dir">'+f.dirName+'</span><span class="cf-status" style="color:'+(SC[f.status]||'inherit')+'">'+f.status+'</span></li>').join('');
		ul._commitFiles = msg.files;
		ul.addEventListener('click', (e) => { const li = e.target.closest('.commit-file-item'); if (!li) return; const idx = parseInt(li.dataset.file); const file = ul._commitFiles[idx]; if (file) vscode.postMessage({ command: 'open-commit-diff', sha: msg.sha, filePath: file.filePath }); });
	}
});
vscode.postMessage({ command: 'ready' });

// Graph resize handle
(function() {
	const handle = document.getElementById('graph-resize-handle');
	const graphBody = document.getElementById('graph-body');
	if (!handle || !graphBody) return;
	const MIN_H = 100, MAX_H = 500;
	let startY = 0, startH = 0, dragging = false;
	handle.addEventListener('mousedown', (e) => {
		e.preventDefault();
		dragging = true;
		startY = e.clientY;
		startH = graphBody.offsetHeight;
		handle.classList.add('active');
		document.body.style.cursor = 'ns-resize';
	});
	document.addEventListener('mousemove', (e) => {
		if (!dragging) return;
		const delta = startY - e.clientY;
		const newH = Math.min(MAX_H, Math.max(MIN_H, startH + delta));
		graphBody.style.height = newH + 'px';
		updateFooterPadding();
	});
	document.addEventListener('mouseup', () => {
		if (!dragging) return;
		dragging = false;
		handle.classList.remove('active');
		document.body.style.cursor = '';
	});
})();

function updateFooterPadding() { const f = document.querySelector('.footer'); const m = document.querySelector('.main-content'); if (f && m) m.style.paddingBottom = f.offsetHeight + 'px'; }
updateFooterPadding();
new ResizeObserver(updateFooterPadding).observe(document.querySelector('.footer'));
<\/script>`;
}
