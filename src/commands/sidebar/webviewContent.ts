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
	const svgMerge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor"><path d="M80 104a24 24 0 1 0 0-48 24 24 0 1 0 0 48zm80-24c0 32.8-19.7 61-48 73.3l0 70.7 176 0c26.5 0 48-21.5 48-48l0-22.7c-28.3-12.3-48-40.5-48-73.3 0-44.2 35.8-80 80-80s80 35.8 80 80c0 32.8-19.7 61-48 73.3l0 22.7c0 61.9-50.1 112-112 112l-176 0 0 70.7c28.3 12.3 48 40.5 48 73.3 0 44.2-35.8 80-80 80S0 476.2 0 432c0-32.8 19.7-61 48-73.3l0-205.3C19.7 141 0 112.8 0 80 0 35.8 35.8 0 80 0s80 35.8 80 80zm232 0a24 24 0 1 0 -48 0 24 24 0 1 0 48 0zM80 456a24 24 0 1 0 0-48 24 24 0 1 0 0 48z"/></svg>`;
	const svgHistory = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" fill="currentColor"><path d="M288 64c106 0 192 86 192 192S394 448 288 448c-65.2 0-122.9-32.5-157.6-82.3-10.1-14.5-30.1-18-44.6-7.9s-18 30.1-7.9 44.6C124.1 468.6 201 512 288 512 429.4 512 544 397.4 544 256S429.4 0 288 0C202.3 0 126.5 42.1 80 106.7L80 80c0-17.7-14.3-32-32-32S16 62.3 16 80l0 112c0 17.7 14.3 32 32 32l24.6 0c.5 0 1 0 1.5 0l86 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-38.3 0C154.9 102.6 217 64 288 64zm24 88c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 104c0 6.4 2.5 12.5 7 17l72 72c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-65-65 0-94.1z"/></svg>`;
	const svgRefresh = `<svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M65.9 228.5c13.3-93 93.4-164.5 190.1-164.5 53 0 101 21.5 135.8 56.2 .2 .2 .4 .4 .6 .6l7.6 7.2-47.9 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l128 0c17.7 0 32-14.3 32-32l0-128c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 53.4-11.3-10.7C390.5 28.6 326.5 0 256 0 127 0 20.3 95.4 2.6 219.5 .1 237 12.2 253.2 29.7 255.7s33.7-9.7 36.2-27.1zm443.5 64c2.5-17.5-9.7-33.7-27.1-36.2s-33.7 9.7-36.2 27.1c-13.3 93-93.4 164.5-190.1 164.5-53 0-101-21.5-135.8-56.2-.2-.2-.4-.4-.6-.6l-7.6-7.2 47.9 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L32 320c-8.5 0-16.7 3.4-22.7 9.5S-.1 343.7 0 352.3l1 127c.1 17.7 14.6 31.9 32.3 31.7S65.2 496.4 65 478.7l-.4-51.5 10.7 10.1c46.3 46.1 110.2 74.7 180.7 74.7 129 0 235.7-95.4 253.4-219.5z"/></svg>`;
	const svgPlus = `<svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor"><path d="M256 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 160-160 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l160 0 0 160c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160 160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-160 0 0-160z"/></svg>`;
	const svgSparkle = `<svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path fill="currentColor" d="M480-16c8.8 0 16 7.2 16 16l0 48 48 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-48 0 0 48c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-48-48 0c-8.8 0-16-7.2-16-16s7.2-16 16-16l48 0 0-48c0-8.8 7.2-16 16-16zM192 64c6.2 0 11.9 3.6 14.5 9.3l53.1 115 115 53.1c5.7 2.6 9.3 8.3 9.3 14.5s-3.6 11.9-9.3 14.5l-115 53.1-53.1 115c-2.6 5.7-8.3 9.3-14.5 9.3s-11.9-3.6-14.5-9.3l-53.1-115-115-53.1C3.6 267.9 0 262.2 0 256s3.6-11.9 9.3-14.5l115-53.1 53.1-115c2.6-5.7 8.3-9.3 14.5-9.3zm0 54.2l-41.1 88.9c-1.6 3.5-4.4 6.2-7.8 7.8L54.2 256 143.1 297.1c3.5 1.6 6.2 4.4 7.8 7.8l41.1 88.9 41.1-88.9c1.6-3.4 4.4-6.2 7.8-7.8l88.9-41.1-88.9-41.1c-3.5-1.6-6.2-4.4-7.8-7.8L192 118.2zM464 384l0 48 48 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-48 0 0 48c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-48-48 0c-8.8 0-16-7.2-16-16s7.2-16 16-16l48 0 0-48c0-8.8 7.2-16 16-16s16 7.2 16 16z"/></svg>`;
	const svgPush = `<svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor"><path d="M256 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 160-160 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l160 0 0 160c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160 160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-160 0 0-160z"/></svg>`;
	const svgDash = `<svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path fill="currentColor" d="M0 256c0-17.7 14.3-32 32-32l448 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32z"/></svg>`
	const svgRotateLeft = `<svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M24 192l144 0c9.7 0 18.5-5.8 22.2-14.8s1.7-19.3-5.2-26.2l-46.7-46.7c75.3-58.6 184.3-53.3 253.5 15.9 75 75 75 196.5 0 271.5s-196.5 75-271.5 0c-10.2-10.2-19-21.3-26.4-33-9.5-14.9-29.3-19.3-44.2-9.8s-19.3 29.3-9.8 44.2C49.7 408.7 61.4 423.5 75 437 175 537 337 537 437 437S537 175 437 75C342.8-19.3 193.3-24.7 92.7 58.8L41 7C34.1 .2 23.8-1.9 14.8 1.8S0 14.3 0 24L0 168c0 13.3 10.7 24 24 24z"/></svg>`
	const svgChevonRight = `<svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" fill="currentColor"><path d="M311.1 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L243.2 256 73.9 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"/></svg>`

	return `
<div id="sc-body" class="section-body">
	<div class="commit-area">
		<div class="commit-input-wrap">
			<textarea id="commit-msg" placeholder="Message (Ctrl+Enter to commit on...)"></textarea>
			<div class="input-actions">
				<button class="input-icon-btn" title="Generate commit message with AI" onclick="sendCommand('generate-commit')">${svgSparkle}</button>
			</div>
		</div>
		<div class="btn-row">
			<button class="btn-commit" onclick="doCommit()"><svg width="14" height="14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M434.8 70.1c14.3 10.4 17.5 30.4 7.1 44.7l-256 352c-5.5 7.6-14 12.3-23.4 13.1s-18.5-2.7-25.1-9.3l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l101.5 101.5 234-321.7c10.4-14.3 30.4-17.5 44.7-7.1z"/></svg> Commit</button>
			<button id="btn-review-staged" class="btn-review-staged" style="display:none" onclick="sendCommand('review-staged')" title="Review Staged Changes with AI">Review</button>
		</div>
		<button id="push-banner" style="display:none" class="push-banner" onclick="sendCommand('git-push')" title="Push to remote">
			${svgPush}
			<span id="push-banner-text">1 commit to push</span>
		</button>
		<button id="force-push-banner" style="display:none" class="force-push-banner" onclick="sendCommand('git-force-push')" title="Force push to remote">
			<svg width="14" height="14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 0c14.7 0 28.2 8.1 35.2 21l216 400c6.7 12.4 6.4 27.4-.8 39.5S486.1 480 472 480L40 480c-14.1 0-27.2-7.4-34.4-19.5s-7.5-27.1-.8-39.5l216-400c7-12.9 20.5-21 35.2-21zm0 352a32 32 0 1 0 0 64 32 32 0 1 0 0-64zm0-192c-18.2 0-32.7 15.5-31.4 33.7l7.4 104c.9 12.5 11.4 22.3 23.9 22.3 12.6 0 23-9.7 23.9-22.3l7.4-104c1.3-18.2-13.1-33.7-31.4-33.7z"/></svg>
			<span id="force-push-text">History rewritten — force push required</span>
		</button>
		<div id="sync-banner" style="display:none" class="sync-banner" onclick="sendCommand('git-sync')">
		<svg width="14" height="14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M480.1 192l7.9 0c13.3 0 24-10.7 24-24l0-144c0-9.7-5.8-18.5-14.8-22.2S477.9 .2 471 7L419.3 58.8C375 22.1 318 0 256 0 127 0 20.3 95.4 2.6 219.5 .1 237 12.2 253.2 29.7 255.7s33.7-9.7 36.2-27.1C79.2 135.5 159.3 64 256 64 300.4 64 341.2 79 373.7 104.3L327 151c-6.9 6.9-8.9 17.2-5.2 26.2S334.3 192 344 192l136.1 0zm29.4 100.5c2.5-17.5-9.7-33.7-27.1-36.2s-33.7 9.7-36.2 27.1c-13.3 93-93.4 164.5-190.1 164.5-44.4 0-85.2-15-117.7-40.3L185 361c6.9-6.9 8.9-17.2 5.2-26.2S177.7 320 168 320L24 320c-13.3 0-24 10.7-24 24L0 488c0 9.7 5.8 18.5 14.8 22.2S34.1 511.8 41 505l51.8-51.8C137 489.9 194 512 256 512 385 512 491.7 416.6 509.4 292.5z"/></svg>
			<span id="sync-banner-text">Sync Changes</span>
		</div>
	</div>
	<div id="merge-conflict-banner" style="display:none" class="merge-conflict-banner">
	<svg width="14" height="14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 0c14.7 0 28.2 8.1 35.2 21l216 400c6.7 12.4 6.4 27.4-.8 39.5S486.1 480 472 480L40 480c-14.1 0-27.2-7.4-34.4-19.5s-7.5-27.1-.8-39.5l216-400c7-12.9 20.5-21 35.2-21zm0 352a32 32 0 1 0 0 64 32 32 0 1 0 0-64zm0-192c-18.2 0-32.7 15.5-31.4 33.7l7.4 104c.9 12.5 11.4 22.3 23.9 22.3 12.6 0 23-9.7 23.9-22.3l7.4-104c1.3-18.2-13.1-33.7-31.4-33.7z"/></svg>
		<span id="merge-conflict-text">Resolve conflicts before committing</span>
		<button id="abort-merge-btn" class="abort-merge-btn" style="display:none" onclick="sendCommand('abort-merge')">Abort Merge</button>
	</div>
	<div id="merge-section-header" class="section-header merge-section" style="padding-left:8px;display:none" onclick="toggleSection('merge-body', this)">
		<span class="hdr-left"><span class="chevron">${svgChevonRight}</span> Merge Changes</span>
		<div class="hdr-right" onclick="event.stopPropagation()">
			<button class="icon-btn" title="Stage All Merge Changes" onclick="sendCommand('stage-all-merge')">${svgPush}</button>
			<span class="count merge-count" id="merge-count">0</span>
		</div>
	</div>
	<div id="merge-body" class="section-body" style="display:none">
		<div class="file-list" id="merge-list"></div>
	</div>
	<div id="staged-section-header" class="section-header" style="padding-left:8px;display:none" onclick="toggleSection('staged-body', this)">
		<span class="hdr-left"><span class="chevron">${svgChevonRight}</span> Staged Changes</span>
		<div class="hdr-right" onclick="event.stopPropagation()">
			<button class="icon-btn" title="Unstage All Changes" onclick="sendCommand('unstage-all')">${svgDash}</button>
			<span class="count" id="staged-count">0</span>
		</div>
	</div>
	<div id="staged-body" class="section-body" style="display:none">
		<div class="file-list" id="staged-list"></div>
	</div>
	<div class="section-header" style="padding-left:8px" onclick="toggleSection('unstaged-body', this)">
		<span class="hdr-left"><span class="chevron">${svgChevonRight}</span> Changes</span>
		<div class="hdr-right" onclick="event.stopPropagation()">
			<button class="icon-btn" title="Discard All Changes" onclick="sendCommand('discard-all')">${svgRotateLeft}</button>
			<button class="icon-btn" title="Stage All Changes" onclick="sendCommand('stage-all')">${svgPush}</button>
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
.push-banner { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 5px; padding: 6px 8px; background: transparent; border: 1px solid var(--vscode-inputValidation-warningBorder, #e2c08d); border-radius: 2px; font-size: 11px; color: var(--vscode-inputValidation-warningBorder, #e2c08d); cursor: pointer; width: 100%; transition: background 0.1s; }
.push-banner:hover { background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.05)); }
.push-banner svg { flex-shrink: 0; opacity: 1; fill: var(--vscode-inputValidation-warningBorder, #e2c08d); color: var(--vscode-inputValidation-warningBorder, #e2c08d); } .push-banner span { font-weight: 600; }
.force-push-banner { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 5px; padding: 6px 8px; background: transparent; border: 1px solid var(--vscode-inputValidation-errorBorder, #f14c4c); border-radius: 2px; font-size: 11px; color: var(--vscode-inputValidation-errorBorder, #f14c4c); cursor: pointer; width: 100%; transition: background 0.1s; }
.force-push-banner:hover { background: var(--vscode-toolbar-hoverBackground, rgba(255,255,255,0.05)); }
.force-push-banner svg { flex-shrink: 0; opacity: 1; fill: var(--vscode-inputValidation-errorBorder, #f14c4c); } .force-push-banner span { font-weight: 600; }
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
.file-name.deleted { text-decoration: line-through; opacity: 0.7; }
.file-actions { display: none; gap: 1px; flex-shrink: 0; } .file-item:hover .file-actions { display: flex; }
.file-item.selected { background: var(--vscode-list-activeSelectionBackground, rgba(255,255,255,0.1)); }
.file-item.selected .file-actions { display: flex; }
.file-item.selected:hover { background: var(--vscode-list-activeSelectionBackground, rgba(255,255,255,0.12)); }
.tree-folder-header.selected { background: var(--vscode-list-activeSelectionBackground, rgba(255,255,255,0.1)); }
.tree-folder-header.selected:hover { background: var(--vscode-list-activeSelectionBackground, rgba(255,255,255,0.12)); }
.tree-folder-header.selected .folder-actions { display: flex; }
.file-action-btn { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 2px 4px; border-radius: 3px; font-size: 16px; opacity: 0.8; line-height: 1; display: flex; align-items: center; justify-content: center; min-width: 22px; min-height: 22px; }
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
.conflict-banner { margin: 4px 8px; padding: 6px 8px; background: transparent; border: 1px solid var(--vscode-inputValidation-errorBorder, #f14c4c); border-radius: 3px; font-size: 11px; display: flex; align-items: center; gap: 6px; color: var(--vscode-inputValidation-errorBorder, #f14c4c); }
.merge-conflict-banner { display: flex; align-items: center; gap: 6px; margin: 4px 8px; padding: 5px 8px; background: transparent; border: 1px solid var(--vscode-inputValidation-errorBorder, #f14c4c); border-radius: 2px; font-size: 11px; color: var(--vscode-inputValidation-errorBorder, #f14c4c); }
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
	if (_iconTheme) {
		var nameLower = (fileName || '').toLowerCase();
		var ext = nameLower.split('.').slice(1);
		var uri = _iconTheme.fileMap?.[nameLower];
		if (!uri && ext.length > 1) { uri = _iconTheme.extMap?.[ext.slice(-2).join('.')]; }
		if (!uri && ext.length > 0) { uri = _iconTheme.extMap?.[ext[ext.length - 1]]; }
		if (!uri) { uri = _iconTheme.defaultFile; }
		if (uri) return '<img class="file-icon-img" src="'+uri+'" width="16" height="16"/>';
	}
	var STATUS_COLORS = { 'M': '#e2c08d', 'A': '#73c991', 'D': '#f14c4c', 'R': '#73c991', 'C': '#73c991', 'U': '#e2c08d' };
	var color = STATUS_COLORS[statusLtr] || 'var(--vscode-foreground)';
	return '<svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor"><path d="M176 48L64 48c-8.8 0-16 7.2-16 16l0 384c0 8.8 7.2 16 16 16l256 0c8.8 0 16-7.2 16-16l0-240-88 0c-39.8 0-72-32.2-72-72l0-88zM316.1 160L224 67.9 224 136c0 13.3 10.7 24 24 24l68.1 0zM0 64C0 28.7 28.7 0 64 0L197.5 0c17 0 33.3 6.7 45.3 18.7L365.3 141.3c12 12 18.7 28.3 18.7 45.3L384 448c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 64z"/></svg>';
}

function getFolderIcon(folderName, isExpanded) {
	var nameLower = (folderName || '').toLowerCase();
	if (_iconTheme) {
		var uri = isExpanded
			? (_iconTheme.folderExpandedMap?.[nameLower] || _iconTheme.defaultFolderExpanded || _iconTheme.folderMap?.[nameLower] || _iconTheme.defaultFolder)
			: (_iconTheme.folderMap?.[nameLower] || _iconTheme.defaultFolder);
		if (uri) return '<img class="file-icon-img tree-folder-icon" src="'+uri+'" width="14" height="14" data-folder="'+nameLower+'"/>';
	}
	return '<svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M64 400l384 0c8.8 0 16-7.2 16-16l0-240c0-8.8-7.2-16-16-16l-149.3 0c-17.3 0-34.2-5.6-48-16L212.3 83.2c-2.8-2.1-6.1-3.2-9.6-3.2L64 80c-8.8 0-16 7.2-16 16l0 288c0 8.8 7.2 16 16 16zm384 48L64 448c-35.3 0-64-28.7-64-64L0 96C0 60.7 28.7 32 64 32l138.7 0c13.8 0 27.3 4.5 38.4 12.8l38.4 28.8c5.5 4.2 12.3 6.4 19.2 6.4L448 80c35.3 0 64 28.7 64 64l0 240c0 35.3-28.7 64-64 64z"/></svg> ';
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
		var sl = statusLetter(f.status);
		return '<div class="file-item" data-merge-idx="'+i+'" title="'+escapeHtml(f.filePath)+'" style="padding-left:20px">' +
			'<span class="file-icon">' + getFileIcon(f.fileName, sl) + '</span>' +
			'<span class="file-name' + (sl === 'D' ? ' deleted' : '') + '">' + escapeHtml(f.fileName) + '</span>' +
			'<div class="file-actions">' +
				'<button class="file-action-btn" data-merge-action="open" data-merge-file-idx="'+i+'" title="Open File">○</button>' +
				'<button class="file-action-btn" data-merge-action="stage" data-merge-file-idx="'+i+'" title="Stage Changes"><svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor"><path d="M256 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 160-160 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l160 0 0 160c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160 160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-160 0 0-160z"/></svg></button>' +
			'</div>' +
			'<span class="status-badge status-'+sl+'">'+sl+'</span>' +
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
			folderActions = '<button class="file-action-btn" data-folder-action="unstage" data-folder-indices="'+childIndices.join(',')+'" title="Unstage Folder"><svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path fill="currentColor" d="M0 256c0-17.7 14.3-32 32-32l448 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32z"/></svg></button>';
		} else {
			folderActions = '<button class="file-action-btn" data-folder-action="discard" data-folder-indices="'+childIndices.join(',')+'" title="Discard Folder"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M24 192l144 0c9.7 0 18.5-5.8 22.2-14.8s1.7-19.3-5.2-26.2l-46.7-46.7c75.3-58.6 184.3-53.3 253.5 15.9 75 75 75 196.5 0 271.5s-196.5 75-271.5 0c-10.2-10.2-19-21.3-26.4-33-9.5-14.9-29.3-19.3-44.2-9.8s-19.3 29.3-9.8 44.2C49.7 408.7 61.4 423.5 75 437 175 537 337 537 437 437S537 175 437 75C342.8-19.3 193.3-24.7 92.7 58.8L41 7C34.1 .2 23.8-1.9 14.8 1.8S0 14.3 0 24L0 168c0 13.3 10.7 24 24 24z"/></svg></button><button class="file-action-btn" data-folder-action="stage" data-folder-indices="'+childIndices.join(',')+'" title="Stage Folder"><svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor"><path d="M256 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 160-160 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l160 0 0 160c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160 160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-160 0 0-160z"/></svg></button>';
		}
		html += '<div class="tree-folder">';
		html += '<div class="tree-folder-header" style="padding-left:'+pad+'px">';
		html += '<span class="tree-chevron"><svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" fill="currentColor"><path d="M311.1 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L243.2 256 73.9 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"/></svg></span>';
		html += getFolderIcon(lastSegment, true);
		html += ' <span class="tree-folder-name" title="'+fullName+'">'+displayName+'</span>';
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
			var svgOpenFile = '<svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" fill="currentColor"><path d="M64 48l112 0 0 88c0 39.8 32.2 72 72 72l88 0 0 240c0 8.8-7.2 16-16 16L64 464c-8.8 0-16-7.2-16-16L48 64c0-8.8 7.2-16 16-16zM224 67.9l92.1 92.1-68.1 0c-13.3 0-24-10.7-24-24l0-68.1zM64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-261.5c0-17-6.7-33.3-18.7-45.3L242.7 18.7C230.7 6.7 214.5 0 197.5 0L64 0zm56 256c-13.3 0-24 10.7-24 24s10.7 24 24 24l144 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-144 0zm0 96c-13.3 0-24 10.7-24 24s10.7 24 24 24l144 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-144 0z"/></svg>';
			var actionBtns = type === 'staged'
				? '<button class="file-action-btn" data-action="open-file" data-idx="'+f._idx+'" title="Open File">'+svgOpenFile+'</button><button class="file-action-btn" data-action="unstage" data-idx="'+f._idx+'" title="Unstage"><svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path fill="currentColor" d="M0 256c0-17.7 14.3-32 32-32l448 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32z"/></svg></button>'
				: '<button class="file-action-btn" data-action="open-file" data-idx="'+f._idx+'" title="Open File">'+svgOpenFile+'</button><button class="file-action-btn" data-action="discard" data-idx="'+f._idx+'" title="Discard Changes"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor"><path d="M24 192l144 0c9.7 0 18.5-5.8 22.2-14.8s1.7-19.3-5.2-26.2l-46.7-46.7c75.3-58.6 184.3-53.3 253.5 15.9 75 75 75 196.5 0 271.5s-196.5 75-271.5 0c-10.2-10.2-19-21.3-26.4-33-9.5-14.9-29.3-19.3-44.2-9.8s-19.3 29.3-9.8 44.2C49.7 408.7 61.4 423.5 75 437 175 537 337 537 437 437S537 175 437 75C342.8-19.3 193.3-24.7 92.7 58.8L41 7C34.1 .2 23.8-1.9 14.8 1.8S0 14.3 0 24L0 168c0 13.3 10.7 24 24 24z"/></svg></button><button class="file-action-btn" data-action="stage" data-idx="'+f._idx+'" title="Stage"><svg width="14" height="14" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor"><path d="M256 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 160-160 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l160 0 0 160c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160 160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-160 0 0-160z"/></svg></button>';
			html += '<div class="file-item" data-idx="'+f._idx+'" data-type="'+type+'" title="'+f.filePath+'" style="padding-left:'+filePad+'px">';
			html += '<span class="file-icon">'+getFileIcon(f.fileName, sl)+'</span>';
			html += '<span class="file-name' + (sl === 'D' ? ' deleted' : '') + '">'+f.fileName+'</span>';
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
		if (btn.dataset.action === 'open-file') { const f = _staged[idx]; if (f) sendCommand('open-file', { filePath: f.filePath }); return; }
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
		if (btn.dataset.action === 'open-file') { const f = _unstaged[idx]; if (f) sendCommand('open-file', { filePath: f.filePath }); return; }
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
