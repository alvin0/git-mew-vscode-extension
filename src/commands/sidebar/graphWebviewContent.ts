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
.edit-commit-btn { background: none; border: 1px solid var(--vscode-foreground); color: var(--vscode-foreground); border-radius: 2px; padding: 1px 6px; font-size: 10px; cursor: pointer; opacity: 0.7; white-space: nowrap; }
.edit-commit-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
.empty-state { padding: 0 20px; font-size: 12px; color: var(--vscode-descriptionForeground); font-style: italic; height: 22px; line-height: 22px; }
.graph-divider { text-align: center; font-size: 10px; color: var(--vscode-descriptionForeground); padding: 2px 0; opacity: 0.6; }
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
.commit-checkbox { margin: 0 2px 0 4px; cursor: pointer; accent-color: var(--vscode-button-background); }
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
<ul class="commit-list" id="commit-list"><li class="empty-state">No commits</li></ul>

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

function renderGraph(data) {
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
		const safeSubject = escapeHtml(c.subject);
		const safeAuthor = escapeHtml(c.author);
		const safeDate = escapeHtml(c.date);
		const safeSha = escapeHtml(c.sha);
		const safeFullSha = escapeHtml(c.fullSha);
		const metaText = isMerge ? 'merge · '+safeDate : safeAuthor+' · '+safeDate;
		const divider = (i === boundaryIdx && boundaryIdx > 0) ? '<li class="graph-divider"><span>— pushed —</span></li>' : '';
		const undoHtml = !isPushed ? '<div class="commit-actions"><button class="undo-commit-btn" data-undo="'+safeFullSha+'" title="Undo commit">↩ Undo</button></div>' : '';
		const checkboxHtml = '<input type="checkbox" class="commit-checkbox" data-squash-idx="'+i+'" data-pushed="'+(isPushed?'1':'0')+'" onclick="event.stopPropagation();updateSquashSelection('+i+')">';
		return divider + '<li class="commit-item '+(isPushed?'is-pushed':'is-local')+'" data-sha="'+safeFullSha+'" data-idx="'+i+'">'+checkboxHtml+'<div class="commit-graph-col" style="width:'+svgW+'px;min-width:'+svgW+'px"><svg width="'+svgW+'" height="'+H+'" style="overflow:visible">'+svgLines+dotInner+'</svg></div><div class="commit-info"><div class="commit-subject '+subjectClass+'" title="'+safeSubject+'">'+safeSubject+'</div><div class="commit-meta">'+metaText+'</div></div>'+undoHtml+'<span class="commit-sha">'+safeSha+'</span></li><li class="commit-files-row" id="cf-'+safeFullSha+'" style="display:none"><ul class="commit-file-list" id="cfl-'+safeFullSha+'"></ul></li>';
	}).join('');
}

function updateSquashSelection(changedIdx) {
	const all = Array.from(document.querySelectorAll('.commit-checkbox'));
	const idx = parseInt(changedIdx);
	const isChecked = all[idx] && all[idx].checked;
	if (isChecked) { for (let i = 0; i <= idx; i++) { if (all[i]) all[i].checked = true; } }
	else { for (let i = idx; i < all.length; i++) { if (all[i]) all[i].checked = false; } }
	const checks = all.filter(cb => cb.checked);
	const toolbar = document.getElementById('squash-toolbar');
	const countText = document.getElementById('squash-count-text');
	const btn = document.getElementById('squash-btn');
	const editBtn = document.getElementById('edit-msg-btn');
	const count = checks.length;
	if (count > 0) {
		toolbar.style.display = 'flex';
		const hasPushed = checks.some(cb => cb.dataset.pushed === '1');
		const warn = hasPushed ? ' (includes pushed ⚠)' : '';
		countText.textContent = count + ' commit' + (count > 1 ? 's' : '') + ' selected' + warn;
		editBtn.style.display = count === 1 ? 'inline-block' : 'none';
		btn.style.display = count >= 2 ? 'inline-block' : 'none';
		btn.disabled = false;
	} else { toolbar.style.display = 'none'; }
}

let _editCommitSha = null;
let _editCommitIsPushed = false;
function doEditCommitMsg() {
	const checks = Array.from(document.querySelectorAll('.commit-checkbox:checked'));
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
	document.querySelectorAll('.commit-checkbox').forEach(cb => { cb.checked = false; cb.disabled = false; });
	document.getElementById('squash-toolbar').style.display = 'none';
	document.getElementById('squash-dialog').style.display = 'none';
	document.body.classList.remove('dialog-open');
	_squashCount = 0;
}
function lockCheckboxes() { document.querySelectorAll('.commit-checkbox').forEach(cb => cb.disabled = true); }
function unlockCheckboxes() { document.querySelectorAll('.commit-checkbox').forEach(cb => cb.disabled = false); }
let _squashCount = 0;
function doSquash() {
	const checks = Array.from(document.querySelectorAll('.commit-checkbox:checked'));
	if (checks.length < 2) return;
	_squashCount = checks.length;
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
function confirmSquash() {
	const msg = document.getElementById('squash-msg').value;
	if (!msg || !msg.trim()) return;
	const count = _squashCount;
	closeSquashDialog(); cancelSquash();
	sendCommand('squash-commits', { count: count, message: msg });
}
function generateSquashMsg() {
	const btn = document.getElementById('squash-generate-btn');
	btn.disabled = true; btn.style.opacity = '0.4';
	sendCommand('generate-squash-msg', { count: _squashCount });
}

let _squashBackup = null;
function undoLastSquash() { if (_squashBackup) sendCommand('undo-squash', { backup: _squashBackup }); }
function dismissSquashBackup() {
	if (_squashBackup) sendCommand('dismiss-squash-backup', { backup: _squashBackup });
	_squashBackup = null; document.getElementById('undo-squash-banner').style.display = 'none';
}
let _editMsgBackup = null;
function undoEditMsg() { if (_editMsgBackup) sendCommand('undo-edit-msg', { backup: _editMsgBackup }); }
function dismissEditUndo() {
	if (_editMsgBackup) sendCommand('dismiss-edit-backup', { backup: _editMsgBackup });
	_editMsgBackup = null; document.getElementById('undo-edit-banner').style.display = 'none';
}

window.addEventListener('message', (event) => {
	const msg = event.data;
	if (msg.command === 'update-graph') {
		const hasChecked = document.querySelectorAll('.commit-checkbox:checked').length > 0;
		const squashOpen = document.getElementById('squash-dialog').style.display !== 'none';
		const editOpen = document.getElementById('edit-msg-dialog').style.display !== 'none';
		if (!hasChecked && !squashOpen && !editOpen) { renderGraph(msg); }
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
	}
	if (msg.command === 'edit-msg-done') {
		_editMsgBackup = msg.backup;
		document.getElementById('undo-edit-banner').style.display = 'flex';
	}
	if (msg.command === 'edit-msg-undone') {
		_editMsgBackup = null;
		document.getElementById('undo-edit-banner').style.display = 'none';
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
	}
	if (msg.command === 'commit-files') {
		const ul = document.getElementById('cfl-' + msg.sha);
		if (!ul) return;
		if (!msg.files || msg.files.length === 0) { ul.innerHTML = '<li style="padding:4px 32px;font-size:11px;opacity:0.6">No files changed</li>'; return; }
		const SC = { M: '#e2c08d', A: '#73c991', D: '#f14c4c', R: '#73c991', C: '#73c991' };
		ul.innerHTML = msg.files.map((f, i) => '<li class="commit-file-item" data-sha="'+escapeHtml(msg.sha)+'" data-file="'+i+'"><span class="cf-name" title="'+escapeHtml(f.filePath)+'">'+escapeHtml(f.fileName)+'</span><span class="cf-dir">'+escapeHtml(f.dirName)+'</span><span class="cf-status" style="color:'+(SC[f.status]||'inherit')+'">'+escapeHtml(f.status)+'</span></li>').join('');
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