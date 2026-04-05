export function getGraphStyles(): string {
	return `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
	font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
	color: var(--vscode-foreground); background: var(--vscode-sideBar-background);
	overflow-x: hidden; position: relative; min-height: 100vh;
}
body.dialog-open { overflow: hidden; }
.icon-btn { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 2px 4px; border-radius: 3px; font-size: 14px; opacity: 0.7; display: flex; align-items: center; }
.icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.sync-info { padding: 4px 12px; font-size: 11px; color: var(--vscode-descriptionForeground); display: flex; gap: 8px; align-items: center; }
.sync-ahead { color: var(--vscode-gitDecoration-addedResourceForeground, #73c991); }
.sync-behind { color: var(--vscode-gitDecoration-modifiedResourceForeground, #e2c08d); }
.conflict-banner { margin: 4px 8px; padding: 6px 8px; background: var(--vscode-inputValidation-errorBackground, rgba(241,76,76,0.15)); border: 1px solid var(--vscode-inputValidation-errorBorder, #f14c4c); border-radius: 3px; font-size: 11px; display: flex; align-items: center; gap: 6px; color: var(--vscode-errorForeground, #f14c4c); }
.commit-list { list-style: none; margin: 0; padding: 0; }
.commit-item { display: flex; align-items: stretch; gap: 0; padding: 0 8px 0 0; margin: 0; font-size: 12px; cursor: default; height: 28px; overflow: hidden; box-sizing: border-box; }
.commit-item:hover { background: var(--vscode-list-hoverBackground); }
.commit-graph-col { flex-shrink: 0; width: 40px; position: relative; display: flex; align-items: stretch; justify-content: center; }
.commit-graph-col svg { overflow: visible; display: block; flex: 1; height: 100%; width: 100%; }
.commit-info { flex: 1; min-width: 0; padding: 0; display: flex; flex-direction: column; justify-content: center; height: 28px; }
.commit-subject { overflow: hidden; white-space: nowrap; font-size: 12px; line-height: 1.2; color: var(--vscode-foreground); display: flex; align-items: center; gap: 4px; }
.commit-subject-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 1; min-width: 0; }
.commit-subject.unpushed { font-weight: 600; }
.commit-meta { font-size: 10px; color: var(--vscode-descriptionForeground); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.commit-sha { font-size: 10px; color: var(--vscode-descriptionForeground); font-family: monospace; flex-shrink: 0; padding-left: 8px; display: flex; align-items: center; opacity: 0.7; }
.commit-subject.unpushed { font-weight: 600; }
.commit-files-row { display: none; gap: 0; }
.commit-files-row.visible { display: flex; }
.commit-files-row .commit-graph-col { position: relative; }
.commit-files-row .commit-graph-col svg { position: absolute; top: 0; left: 0; height: 100%; flex: none; }
.commit-files-row .hidden-spacer { visibility: hidden; height: 0; overflow: hidden; }
.hidden-spacer { visibility: hidden; }
.commit-file-list { flex: 1; list-style: none; padding: 0; margin: 0; border-left: 1px solid var(--vscode-sideBar-border); }
.commit-file-item { display: flex; align-items: center; gap: 6px; padding: 2px 8px 2px 12px; cursor: pointer; font-size: 11px; }
.commit-file-item:hover { background: var(--vscode-list-hoverBackground); }
.commit-file-item .cf-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.commit-file-item .cf-name.deleted { text-decoration: line-through; opacity: 0.7; }
.commit-file-item .cf-dir { color: var(--vscode-descriptionForeground); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40%; }
.commit-file-item .cf-status { font-size: 10px; font-weight: 600; width: 12px; text-align: center; flex-shrink: 0; }
.commit-item.expanded { background: var(--vscode-list-activeSelectionBackground, rgba(255,255,255,0.05)); }
.commit-item.is-pushed { opacity: 0.85; } .commit-item.is-pushed:hover { opacity: 1; }
.commit-actions { display: none; flex-shrink: 0; align-items: center; padding-left: 4px; } 
.commit-item:hover .commit-actions { display: flex; }
.undo-commit-btn { background: none; border: 1px solid var(--vscode-foreground); color: var(--vscode-foreground); border-radius: 2px; padding: 1px 6px; font-size: 10px; cursor: pointer; opacity: 0.7; white-space: nowrap; }
.undo-commit-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.open-changes-btn { background: none; border: none; color: var(--vscode-foreground); border-radius: 2px; padding: 1px 6px; font-size: 10px; cursor: pointer; opacity: 0.7; white-space: nowrap; }
.open-changes-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.edit-commit-btn { background: none; border: 1px solid var(--vscode-foreground); color: var(--vscode-foreground); border-radius: 2px; padding: 1px 6px; font-size: 10px; cursor: pointer; opacity: 0.7; white-space: nowrap; }
.edit-commit-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.empty-state { padding: 0 20px; font-size: 12px; color: var(--vscode-descriptionForeground); font-style: italic; height: 28px; line-height: 28px; }
.graph-divider { height: 16px; margin: 0; padding: 0; display: flex; align-items: center; gap: 0; color: var(--vscode-descriptionForeground); font-size: 10px; opacity: 0.6; pointer-events: none; }
.graph-divider span { padding-left: 8px; flex: 1; border-top: 1px solid var(--vscode-sideBar-border); line-height: 16px; }
.squash-toolbar {
	display: flex; align-items: center; gap: 6px; padding: 4px 8px;
	background: var(--vscode-sideBarSectionHeader-background); border-bottom: 1px solid var(--vscode-sideBar-border, transparent);
	font-size: 11px; position: sticky; top: 0; z-index: 5;
}
.squash-count { flex: 1; }
.squash-btn { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 2px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
.squash-btn:hover { background: var(--vscode-button-hoverBackground); }
.squash-btn:disabled { opacity: 0.5; cursor: default; }
.squash-cancel-btn { background: none; border: 1px solid var(--vscode-foreground); color: var(--vscode-foreground); border-radius: 2px; padding: 1px 6px; font-size: 10px; cursor: pointer; opacity: 0.7; }
.squash-cancel-btn:hover { opacity: 1; }
.squash-dialog { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); z-index: 100; display: flex; align-items: flex-start; justify-content: center; padding-top: 16px; overflow: hidden; }
.squash-dialog-inner { background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background)); border: 1px solid var(--vscode-editorWidget-border, var(--vscode-focusBorder, #007fd4)); border-radius: 6px; width: 92%; max-width: 400px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
.squash-dialog-header { font-size: 13px; font-weight: 600; padding: 10px 12px; border-bottom: 1px solid var(--vscode-editorWidget-border, var(--vscode-sideBar-border, transparent)); background: var(--vscode-editorWidget-background, var(--vscode-sideBarSectionHeader-background)); }
.squash-dialog-body { padding: 10px 12px; }
.squash-msg-input { width: 100%; min-height: 80px; max-height: 200px; resize: vertical; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px; padding: 6px 8px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); outline: none; margin-bottom: 8px; }
.squash-msg-input:focus { border-color: var(--vscode-focusBorder); }
.squash-dialog-actions { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
.undo-squash-banner { display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: var(--vscode-sideBarSectionHeader-background); font-size: 11px; position: sticky; top: 0; z-index: 5; }
.undo-squash-banner span { flex: 1; }
.squash-dismiss-btn { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; opacity: 0.6; font-size: 12px; }
.squash-dismiss-btn:hover { opacity: 1; }
.input-icon-btn { background: none; border: none; color: var(--vscode-input-foreground); cursor: pointer; padding: 3px 4px; border-radius: 3px; opacity: 0.7; display: flex; align-items: center; justify-content: center; font-size: 13px; line-height: 1; }
.input-icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.commit-checkbox { margin: auto 4px auto 6px; cursor: pointer; accent-color: var(--vscode-button-background); flex-shrink: 0; }
.commit-badge { display: inline-flex; align-items: center; gap: 3px; padding: 0 5px; border-radius: 3px; font-size: 10px; font-weight: 600; line-height: 16px; flex-shrink: 0; white-space: nowrap; }
.badge-head { background: #388e3c; color: #fff; }
.badge-remote { background: #1565c0; color: #fff; }
.badge-tag { background: #6a1b9a; color: #fff; }
.badge-icon { font-size: 10px; line-height: 1; }
.commit-badges { display: flex; gap: 3px; align-items: center; flex-shrink: 0; padding-left: 4px; }
`;
}


export function getGraphHtml(): string {
	const svgWarn = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8.22 1.754a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368L8.22 1.754zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575L6.457 1.047zM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-.25-5.25a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 0 1.5 0v-2.5z"/></svg>`;
	return `
<div id="squash-toolbar" style="display:none" class="squash-toolbar">
	<span class="squash-count" id="squash-count-text">0 selected</span>
	<button class="squash-cancel-btn" onclick="cancelSquash()">Cancel</button>
	<button class="squash-btn" id="edit-msg-btn" style="display:none" onclick="doEditCommitMsg()">Edit Message</button>
	<button class="squash-btn" id="squash-btn" onclick="doSquash()" disabled>Squash</button>
	<button class="squash-btn" id="review-btn" style="display:none" onclick="doReviewSelected()">Review</button>
</div>
<div id="undo-squash-banner" style="display:none" class="undo-squash-banner">
	<span>Squash completed</span>
	<button class="squash-cancel-btn" onclick="undoLastSquash()">Undo Squash</button>
	<button class="squash-dismiss-btn" onclick="dismissSquashBackup()">✕</button>
</div>
<div id="undo-edit-banner" style="display:none" class="undo-squash-banner">
	<span>Message updated</span>
	<button class="squash-cancel-btn" onclick="undoEditMsg()">Undo</button>
	<button class="squash-dismiss-btn" onclick="dismissEditUndo()">✕</button>
</div>
<div id="conflict-banner" style="display:none" class="conflict-banner">${svgWarn}<span id="conflict-text"></span></div>
<div id="sync-info" style="display:none" class="sync-info"></div>
<ul class="commit-list" id="commit-list"><li class="empty-state" id="graph-empty-state">Loading...</li></ul>

<!-- Squash message dialog -->
<div id="squash-dialog" class="squash-dialog" style="display:none">
	<div class="squash-dialog-inner">
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
	</div>
</div>

<!-- Edit commit message dialog -->
<div id="edit-msg-dialog" class="squash-dialog" style="display:none">
	<div class="squash-dialog-inner">
		<div class="squash-dialog-header">Edit Commit Message</div>
		<div class="squash-dialog-body">
			<textarea id="edit-msg-input" class="squash-msg-input" placeholder="Enter commit message..."></textarea>
			<div class="squash-dialog-actions">
				<button class="squash-cancel-btn" onclick="closeEditMsgDialog()">Cancel</button>
				<button class="input-icon-btn" title="Generate message with AI" onclick="generateEditMsg()" id="edit-generate-btn" style="font-size:12px;padding:2px 6px;opacity:0.8">
					<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M7.5 1l1.5 3.5L13 6l-3.5 1.5L8 11l-1.5-3.5L3 6l3.5-1.5L7.5 1zm0 2.18L6.72 5.1 4.5 6l2.22.9.78 1.92.78-1.92L10.5 6l-2.22-.9L7.5 3.18zM2 12l.67 1.33L4 14l-1.33.67L2 16l-.67-1.33L0 14l1.33-.67L2 12zm11 0l.67 1.33L15 14l-1.33.67L13 16l-.67-1.33L11 14l1.33-.67L13 12z"/></svg>
					Generate
				</button>
				<button class="squash-btn" onclick="confirmEditMsg()">Save</button>
			</div>
		</div>
	</div>
</div>`;
}


export function getGraphScript(): string {
	return `<script>
const vscode = acquireVsCodeApi();
function sendCommand(cmd, extra) { vscode.postMessage({ command: cmd, ...extra }); }
function escapeHtml(str) {
	if (typeof str !== 'string') return '';
	return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

let _graphBranch = '';
let _graphUpstream = '';

document.getElementById('commit-list').addEventListener('click', (e) => {
	const undoBtn = e.target.closest('[data-undo]');
	if (undoBtn) { e.stopPropagation(); sendCommand('undo-commit', { sha: undoBtn.dataset.undo }); return; }
	const changesBtn = e.target.closest('[data-changes-sha]');
	if (changesBtn) { e.stopPropagation(); sendCommand('open-commit-all-diffs', { sha: changesBtn.dataset.changesSha }); return; }
	const li = e.target.closest('.commit-item[data-sha]');
	if (!li) return;
	const sha = li.dataset.sha;
	const filesRow = document.getElementById('cf-' + sha);
	if (!filesRow) return;
	if (filesRow.classList.contains('visible')) { filesRow.classList.remove('visible'); li.classList.remove('expanded'); }
	else {
		filesRow.classList.add('visible'); li.classList.add('expanded');
		const fileList = document.getElementById('cfl-' + sha);
		if (fileList && fileList.children.length === 0) {
			fileList.innerHTML = '<li style="padding:4px 32px;font-size:11px;opacity:0.6">Loading...</li>';
			vscode.postMessage({ command: 'get-commit-files', sha });
		}
	}
});

function renderGraph(data) {
	_graphBranch = data.branch || '';
	_graphUpstream = data.upstream || '';
	const syncEl = document.getElementById('sync-info');
	if (data.upstream && (data.ahead > 0 || data.behind > 0)) {
		let parts = [];
		if (data.ahead > 0) parts.push('<span class="sync-ahead">↑ '+data.ahead+' to push</span>');
		if (data.behind > 0) parts.push('<span class="sync-behind">↓ '+data.behind+' to pull</span>');
		syncEl.innerHTML = parts.join('<span style="opacity:0.4"> · </span>'); syncEl.style.display = 'flex';
	} else if (data.upstream && data.ahead === 0 && data.behind === 0) {
		syncEl.innerHTML = '<span style="opacity:0.6">✓ Up to date with '+escapeHtml(data.upstream)+'</span>'; syncEl.style.display = 'flex';
	} else { syncEl.style.display = 'none'; }
	const conflictEl = document.getElementById('conflict-banner');
	const conflictText = document.getElementById('conflict-text');
	if (data.conflicts && data.conflicts.length > 0) { conflictText.textContent = data.conflicts.length+' conflict'+(data.conflicts.length>1?'s':'')+' — resolve before committing'; conflictEl.style.display = 'flex'; }
	else { conflictEl.style.display = 'none'; }

	const ul = document.getElementById('commit-list');
	if (!data.commits || data.commits.length === 0) {
		let msg = 'No commits';
		if (data.emptyReason === 'no-git') msg = 'Git not available';
		else if (data.emptyReason === 'no-repo') msg = 'No repository found';
		else if (data.emptyReason === 'no-head') msg = 'No commits yet';
		else if (data.emptyReason === 'error') msg = 'Could not load commits';
		ul.innerHTML = '<li class="empty-state">' + escapeHtml(msg) + '</li>';
		return;
	}

	const commits = data.commits;
	const ROW_H = 28;
	const LANE_W = 12;
	const DOT_R = 4;
	const START_X = 14;
	const COLORS = [
		'#52a1ff', // Light Blue
		'#61db40', // Light Green
		'#ff5f5f', // Light Red
		'#b167e3', // Purple
		'#ff9d42', // Orange
		'#00d1e6', // Cyan
		'#ff6ec7', // Pink
		'#d4d4d4'  // Grey
	];

	// --- Lane Tracking ---
	const commitLanes = [];
	const rowLanes = [];
	let currentLanes = [];

	for (let i = 0; i < commits.length; i++) {
		const c = commits[i];
		const sha = c.fullSha;
		const incomingLanes = [...currentLanes]; // Save incoming state for connecting lines from above

		// 1. Where does this commit live?
		let laneIdx = currentLanes.indexOf(sha);
		if (laneIdx === -1) {
			laneIdx = currentLanes.indexOf(null);
			if (laneIdx === -1) laneIdx = currentLanes.length;
			currentLanes[laneIdx] = sha;
		}
		commitLanes[i] = laneIdx;
		rowLanes[i] = [...currentLanes];

		// 2. Prepare for next row
		if (c.parents.length > 0) {
			const p0 = c.parents[0];
			const existIdx = currentLanes.indexOf(p0);
			if (existIdx !== -1 && existIdx !== laneIdx) {
				currentLanes[laneIdx] = null;
			} else {
				currentLanes[laneIdx] = p0;
			}
			for (let p = 1; p < c.parents.length; p++) {
				const pSha = c.parents[p];
				if (currentLanes.indexOf(pSha) === -1) {
					let emptyIdx = currentLanes.indexOf(null);
					if (emptyIdx === -1) emptyIdx = currentLanes.length;
					currentLanes[emptyIdx] = pSha;
				}
			}
		} else {
			currentLanes[laneIdx] = null;
		}
		while (currentLanes.length > 0 && currentLanes[currentLanes.length - 1] === null) currentLanes.pop();
	}
	// For the very last row connector, we need the final state
	const finalLanes = [...currentLanes];

	const maxLanes = Math.max(...rowLanes.map(rl => rl.length), 0);
	const svgW = START_X + maxLanes * LANE_W + 4;

	let boundaryIdx = -1;
	for (let i = 0; i < commits.length; i++) { if (commits[i].isPushed) { boundaryIdx = i; break; } }

	// We need to track incoming lanes per row to draw top-half lines correctly
	let lastLanes = [];
	ul.innerHTML = commits.map((c, i) => {
		const lane = commitLanes[i];
		const myLanes = rowLanes[i];
		const incomingLanes = lastLanes;
		lastLanes = myLanes;
		const nextLanes = (i < commits.length - 1) ? rowLanes[i + 1] : finalLanes;
		
		const cx = START_X + lane * LANE_W;
		const cy = ROW_H / 2;
		const color = COLORS[lane % COLORS.length];

		let svgPaths = '';

		// Draw connections from current row to next row
		// 1. Regular lanes passing through or starting from this commit
		for (let l = 0; l < myLanes.length; l++) {
			const sha = myLanes[l];
			if (!sha) continue;

			const startX = START_X + l * LANE_W;
			const lColor = COLORS[l % COLORS.length];

			if (l === lane) {
				// This is our commit's lane - connect to all parents in the next row
				c.parents.forEach(pSha => {
					const nextIdx = nextLanes.indexOf(pSha);
					if (nextIdx !== -1) {
						const endX = START_X + nextIdx * LANE_W;
						const endColor = COLORS[nextIdx % COLORS.length];
						// Smooth S-curve from dot to next row's start
						if (startX === endX) {
							svgPaths += '<line x1="' + startX + '" y1="' + cy + '" x2="' + endX + '" y2="' + ROW_H + '" stroke="' + endColor + '" stroke-width="2" />';
						} else {
							const cp1y = cy + (ROW_H - cy) / 2;
							svgPaths += '<path d="M ' + startX + ' ' + cy + ' C ' + startX + ' ' + cp1y + ', ' + endX + ' ' + cp1y + ', ' + endX + ' ' + ROW_H + '" stroke="' + endColor + '" stroke-width="2" fill="none" />';
						}
					}
				});
			} else {
				// Regular lane passing through
				const nextIdx = nextLanes.indexOf(sha);
				if (nextIdx !== -1) {
					const endX = START_X + nextIdx * LANE_W;
					if (startX === endX) {
						svgPaths += '<line x1="' + startX + '" y1="0" x2="' + startX + '" y2="' + ROW_H + '" stroke="' + lColor + '" stroke-width="2" opacity="0.5" />';
					} else {
						const midY = ROW_H / 2;
						svgPaths += '<path d="M ' + startX + ' 0 C ' + startX + ' ' + midY + ', ' + endX + ' ' + midY + ', ' + endX + ' ' + ROW_H + '" stroke="' + lColor + '" stroke-width="2" fill="none" opacity="0.5" />';
					}
				}
			}
		}

		// Also draw the top half of the line for the current commit's lane if it came from above
		if (i > 0) {
			// nextLanes of the PREVIOUS row is exactly the incoming state we need
			const prevNextLanes = rowLanes[i]; // Wait. The 'prepare for next row' logic stores its output into rowLanes[i+1] essentially since rowLanes[i] is saved early.
			// Actually, rowLanes[i] is EXACTLY the state of currentLanes AFTER previous rows have processed their parents, but BEFORE we process ours!
			// YES! rowLanes[i] = [...currentLanes] at the top of the loop!
			// So rowLanes[i] contains the exactly correct incoming lanes.
			const incomingLanes = rowLanes[i];
			for (let pl = 0; pl < incomingLanes.length; pl++) {
				if (incomingLanes[pl] === c.fullSha) {
					const startX = START_X + pl * LANE_W;
					if (startX === cx) {
						svgPaths += '<line x1="' + startX + '" y1="0" x2="' + cx + '" y2="' + cy + '" stroke="' + color + '" stroke-width="2" />';
					} else {
						const midY = cy / 2;
						svgPaths += '<path d="M ' + startX + ' 0 C ' + startX + ' ' + midY + ', ' + cx + ' ' + midY + ', ' + cx + ' ' + cy + '" stroke="' + color + '" stroke-width="2" fill="none" />';
					}
				}
			}
		}

		const isPushed = c.isPushed;
		const isMerge = c.isMerge;

		// Dot styling - remove background circle to ensure connections touch the dot
		let dotInner = '';
		if (isMerge) {
			dotInner = '<circle cx="' + cx + '" cy="' + cy + '" r="' + DOT_R + '" fill="var(--vscode-sideBar-background)" stroke="' + color + '" stroke-width="2" />' +
				'<circle cx="' + cx + '" cy="' + cy + '" r="' + (DOT_R - 2.5) + '" fill="' + (isPushed ? color : 'none') + '" />';
		} else {
			dotInner = '<circle cx="' + cx + '" cy="' + cy + '" r="' + DOT_R + '" fill="' + (isPushed ? color : 'var(--vscode-sideBar-background)') + '" stroke="' + color + '" stroke-width="2" />';
		}

		const subjectClass = isPushed ? '' : 'unpushed';
		const safeSubject = escapeHtml(c.subject);
		const safeAuthor = escapeHtml(c.author);
		const safeDate = escapeHtml(c.date);
		const safeSha = escapeHtml(c.sha);
		const safeFullSha = escapeHtml(c.fullSha);
		const metaText = isMerge ? 'merge · ' + safeDate : safeAuthor + ' · ' + safeDate;

		// Badges
		let badgesHtml = '';
		const badges = [];
		if (c.isHead) {
			badges.push('<span class="commit-badge badge-head"><span class="badge-icon"><svg width="10" height="10" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M448 256a192 192 0 1 0 -384 0 192 192 0 1 0 384 0zM0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0zm256 80a80 80 0 1 0 0-160 80 80 0 1 0 0 160zm0-224a144 144 0 1 1 0 288 144 144 0 1 1 0-288zM224 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg></span>' + escapeHtml(_graphBranch) + '</span>');
		}
		if (c.isRemoteHead && _graphUpstream) {
			badges.push('<span class="commit-badge badge-remote"><span class="badge-icon"><svg width="10" height="10" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><path d="M80 192c0-88.4 71.6-160 160-160 47.1 0 89.4 20.4 118.7 52.7 10.6-3.1 21.8-4.7 33.3-4.7 66.3 0 120 53.7 120 120 0 13.2-2.1 25.9-6.1 37.8 41.6 21.1 70.1 64.3 70.1 114.2 0 70.7-57.3 128-128 128l-304 0c-79.5 0-144-64.5-144-144 0-56.8 32.9-105.9 80.7-129.4-.4-4.8-.7-9.7-.7-14.6zM240 80c-61.9 0-112 50.1-112 112 0 8.4 .9 16.6 2.7 24.5 2.7 12.1-4.3 24.3-16.1 28.1-38.7 12.4-66.6 48.7-66.6 91.4 0 53 43 96 96 96l304 0c44.2 0 80-35.8 80-80 0-37.4-25.7-68.9-60.5-77.6-7.5-1.9-13.6-7.2-16.5-14.3s-2.1-15.2 2-21.7c7-11.1 11-24.2 11-38.3 0-39.8-32.2-72-72-72-11.1 0-21.5 2.5-30.8 6.9-10.5 5-23.1 1.7-29.8-7.8-20.3-28.6-53.7-47.1-91.3-47.1z"/></svg></span>' + escapeHtml(_graphUpstream) + '</span>');
		}
		// Parse tags from refs
		const refsStr = c.refs || '';
		const tagMatches = refsStr.match(/tag:\\s*([^,)]+)/g);
		if (tagMatches) {
			tagMatches.forEach(function(t) {
				const tagName = t.replace('tag:', '').trim();
				badges.push('<span class="commit-badge badge-tag"><svg width="10" height="10" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M96.5 160L96.5 309.5C96.5 326.5 103.2 342.8 115.2 354.8L307.2 546.8C332.2 571.8 372.7 571.8 397.7 546.8L547.2 397.3C572.2 372.3 572.2 331.8 547.2 306.8L355.2 114.8C343.2 102.7 327 96 310 96L160.5 96C125.2 96 96.5 124.7 96.5 160zM208.5 176C226.2 176 240.5 190.3 240.5 208C240.5 225.7 226.2 240 208.5 240C190.8 240 176.5 225.7 176.5 208C176.5 190.3 190.8 176 208.5 176z"/></svg> ' + escapeHtml(tagName) + '</span>');
			});
		}
		if (badges.length > 0) {
			badgesHtml = '<div class="commit-badges">' + badges.join('') + '</div>';
		}

		const divider = (i === boundaryIdx && boundaryIdx > 0) ? 
			('<li class="graph-divider">' +
				'<div class="commit-graph-col" style="width:' + svgW + 'px;min-width:' + svgW + 'px">' +
					'<svg width="' + svgW + '" height="16">' + 
						myLanes.map((sha, l) => {
							if (!sha) return '';
							const lx = START_X + l * LANE_W;
							const lColor = COLORS[l % COLORS.length];
							return '<line x1="' + lx + '" y1="0" x2="' + lx + '" y2="16" stroke="' + lColor + '" stroke-width="2" opacity="0.5" />';
						}).join('') + 
					'</svg>' +
				'</div>' +
				'<span>— pushed —</span>' +
			'</li>') : '';
		const undoBtn = (!isPushed && !_squashBackup && !_editMsgBackup) ? '<button class="undo-commit-btn" data-undo="' + safeFullSha + '" title="Undo commit">↩ Undo</button>' : '';
		const openChangesBtn = '<button class="open-changes-btn" data-changes-sha="' + safeFullSha + '" title="Open Changes"><svg width="14" height="14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path fill="currentColor" d="M197.5 16c3.6 0 7.1 .4 10.5 1.2L208 120c0 30.9 25.1 56 56 56l102.8 0c.8 3.4 1.2 6.9 1.2 10.5L368 448c0 26.5-21.5 48-48 48L64 496c-26.5 0-48-21.5-48-48L16 64c0-26.5 21.5-48 48-48l133.5 0zM353.9 152.6c2.3 2.3 4.3 4.8 6.1 7.4l-96 0c-22.1 0-40-17.9-40-40l0-96c2.7 1.8 5.1 3.8 7.4 6.1L353.9 152.6zM64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-261.5c0-17-6.7-33.3-18.7-45.3L242.7 18.7C230.7 6.7 214.5 0 197.5 0L64 0zM200 232c0-4.4-3.6-8-8-8s-8 3.6-8 8l0 48-48 0c-4.4 0-8 3.6-8 8s3.6 8 8 8l48 0 0 48c0 4.4 3.6 8 8 8s8-3.6 8-8l0-48 48 0c4.4 0 8-3.6 8-8s-3.6-8-8-8l-48 0 0-48zM136 400c-4.4 0-8 3.6-8 8s3.6 8 8 8l112 0c4.4 0 8-3.6 8-8s-3.6-8-8-8l-112 0z"/></svg></button>';
		const actionsHtml = '<div class="commit-actions">' + openChangesBtn + undoBtn + '</div>';
		const checkboxHtml = '<input type="checkbox" class="commit-checkbox" data-squash-idx="' + i + '" data-pushed="' + (isPushed ? '1' : '0') + '" onclick="event.stopPropagation();updateSquashSelection(' + i + ')">';
		
		return divider + 
			'<li class="commit-item ' + (isPushed ? 'is-pushed' : 'is-local') + '" data-sha="' + safeFullSha + '" data-idx="' + i + '">' +
				checkboxHtml +
				'<div class="commit-graph-col" style="width:' + svgW + 'px;min-width:' + svgW + 'px">' +
					'<svg width="' + svgW + '" height="' + ROW_H + '">' + svgPaths + dotInner + '</svg>' +
				'</div>' +
				'<div class="commit-info">' +
					'<div class="commit-subject ' + subjectClass + '"><span class="commit-subject-text">' + safeSubject + '</span>' + badgesHtml + '</div>' +
					'<div class="commit-meta">' + metaText + '</div>' +
				'</div>' +
				actionsHtml +
				'<span class="commit-sha">' + safeSha + '</span>' +
			'</li>' +
			'<li class="commit-files-row" id="cf-' + safeFullSha + '">' +
				'<input type="checkbox" class="commit-checkbox hidden-spacer">' +
				'<div class="commit-graph-col" style="width:' + svgW + 'px;min-width:' + svgW + 'px">' +
					'<svg width="' + svgW + '" style="position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible" class="files-row-svg">' +
						nextLanes.map((sha, l) => {
							if (!sha) return '';
							const lx = START_X + l * LANE_W;
							const lColor = COLORS[l % COLORS.length];
							return '<line x1="' + lx + '" y1="0" x2="' + lx + '" y2="100%" stroke="' + lColor + '" stroke-width="2" opacity="0.5" />';
						}).join('') +
					'</svg>' +
				'</div>' +
				'<ul class="commit-file-list" id="cfl-' + safeFullSha + '"></ul>' +
			'</li>';
	}).join('');
}

function updateSquashSelection(changedIdx) {
	const all = Array.from(document.querySelectorAll('.commit-checkbox:not(.hidden-spacer)'));
	const idx = parseInt(changedIdx);
	const isChecked = all[idx] && all[idx].checked;

	// Get currently checked indices
	const checkedIndices = [];
	all.forEach(function(cb, i) { if (cb.checked) checkedIndices.push(i); });

	if (isChecked) {
		// Adding a checkbox - validate adjacency
		if (checkedIndices.length > 1) {
			const minIdx = Math.min.apply(null, checkedIndices);
			const maxIdx = Math.max.apply(null, checkedIndices);
			// Must be adjacent to existing group
			if (idx !== minIdx - 1 && idx !== maxIdx + 1 && checkedIndices.indexOf(idx) === -1) {
				// Not adjacent - check if it fills a gap
				var isContiguous = true;
				for (var ci = minIdx; ci <= maxIdx; ci++) {
					if (checkedIndices.indexOf(ci) === -1 && ci !== idx) { isContiguous = false; break; }
				}
				if (!isContiguous) {
					all[idx].checked = false;
					return;
				}
			}
		}
	}

	// Recalculate checked indices after potential uncheck
	const finalChecked = [];
	all.forEach(function(cb, i) { if (cb.checked) finalChecked.push(i); });
	const count = finalChecked.length;

	const toolbar = document.getElementById('squash-toolbar');
	const countText = document.getElementById('squash-count-text');
	const btn = document.getElementById('squash-btn');
	const editBtn = document.getElementById('edit-msg-btn');
	const reviewBtn = document.getElementById('review-btn');

	if (count > 0) {
		toolbar.style.display = 'flex';
		const checks = finalChecked.map(function(i) { return all[i]; });
		const hasPushed = checks.some(function(cb) { return cb.dataset.pushed === '1'; });
		const warn = hasPushed ? ' (includes pushed ⚠)' : '';
		countText.textContent = count + ' commit' + (count > 1 ? 's' : '') + ' selected' + warn;

		// Determine which actions are available
		// 1. Review: always available when any commits selected
		reviewBtn.style.display = 'inline-block';

		// 2. Edit Message: only when exactly 1 commit selected AND it's the first commit (HEAD)
		editBtn.style.display = (count === 1 && finalChecked[0] === 0) ? 'inline-block' : 'none';

		// 3. Squash: only when 2+ commits selected AND contiguous from top (index 0)
		var canSquash = false;
		if (count >= 2) {
			canSquash = finalChecked[0] === 0;
			if (canSquash) {
				for (var si = 1; si < finalChecked.length; si++) {
					if (finalChecked[si] !== finalChecked[si - 1] + 1) { canSquash = false; break; }
				}
			}
		}
		btn.style.display = canSquash ? 'inline-block' : 'none';
		btn.disabled = !canSquash;
	} else {
		toolbar.style.display = 'none';
	}
}

let _editCommitSha = null;
let _editCommitIsPushed = false;
function doEditCommitMsg() {
	const checks = Array.from(document.querySelectorAll('.commit-checkbox:not(.hidden-spacer):checked'));
	if (checks.length !== 1) return;
	const li = checks[0].closest('.commit-item[data-sha]');
	if (!li) return;
	_editCommitSha = li.dataset.sha;
	_editCommitIsPushed = checks[0].dataset.pushed === '1';
	lockCheckboxes();
	sendCommand('get-commit-message', { sha: _editCommitSha });
}
function openEditMsgDialog(currentMsg) {
	document.getElementById('edit-msg-input').value = currentMsg || '';
	document.getElementById('edit-msg-dialog').style.display = 'flex';
	document.body.classList.add('dialog-open');
	document.getElementById('edit-msg-input').focus();
}
function closeEditMsgDialog() {
	document.getElementById('edit-msg-dialog').style.display = 'none';
	document.body.classList.remove('dialog-open');
	unlockCheckboxes(); cancelSquash(); _editCommitSha = null;
}
function closeEditMsgDialogSilent() {
	document.getElementById('edit-msg-dialog').style.display = 'none';
	document.body.classList.remove('dialog-open');
	_editCommitSha = null;
}
function confirmEditMsg() {
	const msg = document.getElementById('edit-msg-input').value;
	if (!msg || !msg.trim()) return;
	sendCommand('edit-commit', { sha: _editCommitSha, isPushed: _editCommitIsPushed, message: msg.trim() });
	closeEditMsgDialog();
}
function generateEditMsg() {
	const btn = document.getElementById('edit-generate-btn');
	btn.disabled = true; btn.style.opacity = '0.4';
	sendCommand('generate-edit-msg', { sha: _editCommitSha });
}
function cancelSquash() {
	document.querySelectorAll('.commit-checkbox:not(.hidden-spacer)').forEach(cb => { cb.checked = false; cb.disabled = false; });
	document.getElementById('squash-toolbar').style.display = 'none';
	document.getElementById('squash-dialog').style.display = 'none';
	document.body.classList.remove('dialog-open');
	_squashCount = 0;
}
function lockCheckboxes() { document.querySelectorAll('.commit-checkbox:not(.hidden-spacer)').forEach(cb => cb.disabled = true); }
function unlockCheckboxes() { document.querySelectorAll('.commit-checkbox:not(.hidden-spacer)').forEach(cb => cb.disabled = false); }
let _squashCount = 0;
let _squashHasPushed = false;
function doSquash() {
	const checks = Array.from(document.querySelectorAll('.commit-checkbox:not(.hidden-spacer):checked'));
	if (checks.length < 2) return;
	_squashCount = checks.length;
	_squashHasPushed = checks.some(function(cb) { return cb.dataset.pushed === '1'; });
	lockCheckboxes();
	sendCommand('get-squash-messages', { count: _squashCount });
	document.getElementById('squash-dialog').style.display = 'flex';
	document.body.classList.add('dialog-open');
	document.getElementById('squash-msg').value = '';
	document.getElementById('squash-msg').focus();
}
function closeSquashDialog() {
	document.getElementById('squash-dialog').style.display = 'none';
	document.body.classList.remove('dialog-open');
	unlockCheckboxes(); _squashCount = 0;
}
function closeSquashDialogSilent() {
	document.getElementById('squash-dialog').style.display = 'none';
	document.body.classList.remove('dialog-open');
	_squashCount = 0;
}
function confirmSquash() {
	const msg = document.getElementById('squash-msg').value;
	if (!msg || !msg.trim()) return;
	const count = _squashCount;
	const hasPushed = _squashHasPushed;
	closeSquashDialog(); cancelSquash();
	sendCommand('squash-commits', { count: count, message: msg, hasPushed: hasPushed });
}
function generateSquashMsg() {
	const btn = document.getElementById('squash-generate-btn');
	btn.disabled = true; btn.style.opacity = '0.4';
	sendCommand('generate-squash-msg', { count: _squashCount });
}
function doReviewSelected() {
	const checks = Array.from(document.querySelectorAll('.commit-checkbox:not(.hidden-spacer):checked'));
	if (checks.length < 1) return;
	const commits = [];
	checks.forEach(function(cb) {
		const li = cb.closest('.commit-item[data-sha]');
		if (!li) return;
		const subject = li.querySelector('.commit-subject') ? li.querySelector('.commit-subject').textContent : '';
		const meta = li.querySelector('.commit-meta');
		var author = '';
		var date = '';
		if (meta) {
			var text = meta.textContent || '';
			var parts = text.split(' · ');
			if (parts.length >= 2) {
				// For merge commits, meta is "merge · date" — author is not shown
				// For normal commits, meta is "author · date"
				var first = parts[0].trim();
				author = (first === 'merge') ? '' : first;
				date = parts[parts.length - 1].trim();
			} else if (parts.length === 1) {
				date = parts[0].trim();
			}
		}
		commits.push({
			sha: li.dataset.sha,
			subject: subject,
			author: author,
			date: date
		});
	});
	if (commits.length === 0) return;
	sendCommand('review-selected-commits', { commits: commits });
	cancelSquash();
}

let _squashBackup = null;
function undoLastSquash() { if (_squashBackup) sendCommand('undo-squash', { backup: _squashBackup }); }
function dismissSquashBackup() {
	if (_squashBackup) sendCommand('dismiss-squash-backup', { backup: _squashBackup });
	_squashBackup = null; document.getElementById('undo-squash-banner').style.display = 'none';
	showUndoCommitButtons();
}
let _editMsgBackup = null;
function undoEditMsg() { if (_editMsgBackup) sendCommand('undo-edit-msg', { backup: _editMsgBackup }); }
function dismissEditUndo() {
	if (_editMsgBackup) sendCommand('dismiss-edit-backup', { backup: _editMsgBackup });
	_editMsgBackup = null; document.getElementById('undo-edit-banner').style.display = 'none';
	showUndoCommitButtons();
}

function hideUndoCommitButtons() {
	document.querySelectorAll('.undo-commit-btn').forEach(function(btn) { btn.style.display = 'none'; });
}
function showUndoCommitButtons() {
	if (!_squashBackup && !_editMsgBackup) {
		document.querySelectorAll('.undo-commit-btn').forEach(function(btn) { btn.style.display = ''; });
	}
}

let _graphInitialized = false;

window.addEventListener('message', (event) => {
	const msg = event.data;
	if (msg.command === 'update-graph') {
		if (!_graphInitialized) {
			// First load: always render and reset any stale UI state
			_graphInitialized = true;
			cancelSquash();
			closeEditMsgDialogSilent();
			closeSquashDialogSilent();
			document.getElementById('undo-squash-banner').style.display = 'none';
			document.getElementById('undo-edit-banner').style.display = 'none';
			_squashBackup = null;
			_editMsgBackup = null;
			renderGraph(msg);
		} else {
			const hasChecked = document.querySelectorAll('.commit-checkbox:not(.hidden-spacer):checked').length > 0;
			const squashOpen = document.getElementById('squash-dialog').style.display !== 'none';
			const editOpen = document.getElementById('edit-msg-dialog').style.display !== 'none';
			if (!hasChecked && !squashOpen && !editOpen) { renderGraph(msg); }
		}
	}
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
		hideUndoCommitButtons();
	}
	if (msg.command === 'edit-msg-done') {
		_editMsgBackup = msg.backup;
		document.getElementById('undo-edit-banner').style.display = 'flex';
		hideUndoCommitButtons();
	}
	if (msg.command === 'edit-msg-undone') {
		_editMsgBackup = null;
		document.getElementById('undo-edit-banner').style.display = 'none';
		showUndoCommitButtons();
	}
	if (msg.command === 'commit-message') { openEditMsgDialog(msg.text); }
	if (msg.command === 'edit-msg-generated') {
		const ta = document.getElementById('edit-msg-input');
		if (ta) ta.value = msg.text || '';
		const btn = document.getElementById('edit-generate-btn');
		if (btn) { btn.disabled = false; btn.style.opacity = '0.8'; }
	}
	if (msg.command === 'squash-undone') {
		_squashBackup = null;
		document.getElementById('undo-squash-banner').style.display = 'none';
		showUndoCommitButtons();
	}
	if (msg.command === 'commit-files') {
		const ul = document.getElementById('cfl-' + msg.sha);
		if (!ul) return;
		if (!msg.files || msg.files.length === 0) { ul.innerHTML = '<li style="padding:4px 32px;font-size:11px;opacity:0.6">No files changed</li>'; return; }
		const SC = { M: '#e2c08d', A: '#73c991', D: '#f14c4c', R: '#73c991', C: '#73c991' };
		ul.innerHTML = msg.files.map((f, i) => {
			const isDeleted = f.status === 'D';
			return '<li class="commit-file-item" data-sha="'+escapeHtml(msg.sha)+'" data-file="'+i+'">' +
				'<span class="cf-name' + (isDeleted ? ' deleted' : '') + '" title="'+escapeHtml(f.filePath)+'">'+escapeHtml(f.fileName)+'</span>' +
				'<span class="cf-dir">'+escapeHtml(f.dirName)+'</span>' +
				'<span class="cf-status" style="color:'+(SC[f.status]||'inherit')+'">'+escapeHtml(f.status)+'</span>' +
			'</li>';
		}).join('');
		ul._commitFiles = msg.files;
		ul.addEventListener('click', (e) => { const li = e.target.closest('.commit-file-item'); if (!li) return; const idx = parseInt(li.dataset.file); const file = ul._commitFiles[idx]; if (file) vscode.postMessage({ command: 'open-commit-diff', sha: msg.sha, filePath: file.filePath }); });
	}
});
// Close dialogs on backdrop click
document.getElementById('squash-dialog').addEventListener('click', (e) => {
	if (e.target === e.currentTarget) closeSquashDialog();
});
document.getElementById('edit-msg-dialog').addEventListener('click', (e) => {
	if (e.target === e.currentTarget) closeEditMsgDialog();
});
vscode.postMessage({ command: 'ready' });
<\/script>`;
}