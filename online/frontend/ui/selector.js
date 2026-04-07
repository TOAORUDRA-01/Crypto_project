import { currentUser, state } from '../core/state.js';
import { esc, fmtSize, fmtDate } from '../core/utils.js';
import { setStatus } from '../core/status.js';

export function showDesktopDecControls() {
	document.getElementById('decPassField').style.display = 'flex';
	document.getElementById('decryptBtn').style.display = 'block';
}

export function hideOnlineDecControls() {
	document.getElementById('decPassField').style.display = 'none';
	document.getElementById('decryptBtn').style.display = 'none';
	document.getElementById('decPassword').value = '';
}

export function showOnlineDecControls() {
	document.getElementById('decPassField').style.display = 'flex';
	document.getElementById('decryptBtn').style.display = 'block';
}

export function toggleFileDropdown(e) {
	if (e) e.stopPropagation();
	state.fileDropdownOpen ? closeFileDropdown() : openFileDropdown();
}

export function openFileDropdown() {
	renderFileSelectDropdown();
	document.getElementById('fileSelectDropdown').style.display = 'block';
	document.getElementById('fileSelectBox').classList.add('open');
	state.fileDropdownOpen = true;
}

export function closeFileDropdown() {
	const dd = document.getElementById('fileSelectDropdown');
	if (dd) dd.style.display = 'none';
	const box = document.getElementById('fileSelectBox');
	if (box) box.classList.remove('open');
	state.fileDropdownOpen = false;
}

export function resetFileSelectBox() {
	const l = document.getElementById('fileSelectLabel');
	if (l) {
		l.textContent = 'Choose a file to decrypt';
		l.classList.add('placeholder');
	}
}

export function renderFileSelectDropdown() {
	const dd = document.getElementById('fileSelectDropdown');
	if (!dd) return;
	const u = currentUser();
	if (!u) {
		dd.innerHTML = '<p class="file-select-empty">Please login first.</p>';
		return;
	}
	
	const files = state.serverFiles || [];
	if (!files.length) {
		dd.innerHTML = '<p class="file-select-empty">No encrypted files yet. Encrypt a file in Cloud mode first.</p>';
		return;
	}
	
	dd.innerHTML = files
		.map(
			(h) => {
				const origName = h.original_name || h.file_name || 'File';
				const algo = h.algorithm || 'AES-256-GCM';
				const size = fmtSize(h.file_size || 0);
				const date = h.uploaded_at ? new Date(h.uploaded_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
				return (
					'<div class="file-select-option ' +
					(state.selectedOnlineEncId === h.file_id ? 'selected' : '') +
					'" onclick="selectOnlineFile(event,\'' +
					h.file_id +
					'\')">' +
					'<div class="file-select-option-info">' +
					'<div class="file-select-option-name" title="' +
					esc(origName) +
					'">' +
					esc(origName) +
					'</div>' +
					'<div class="file-select-option-meta">' +
					algo +
					' · ' +
					size +
					' · ' +
					date +
					'</div>' +
					'</div></div>'
				);
			}
		)
		.join('');
}

export function selectOnlineFile(e, id) {
	if (e) e.stopPropagation();
	state.selectedOnlineEncId = id;
	const files = state.serverFiles || [];
	const entry = files.find((h) => h.file_id === id);
	if (entry) {
		const l = document.getElementById('fileSelectLabel');
		const origName = entry.original_name || entry.file_name || 'File';
		l.textContent = origName;
		l.classList.remove('placeholder');
	}
	closeFileDropdown();
	showOnlineDecControls();
	setStatus('dec', '', '');
	document.getElementById('decPassword').focus();
}

export function clearOnlineFileSelection() {
	state.selectedOnlineEncId = null;
	resetFileSelectBox();
	closeFileDropdown();
	hideOnlineDecControls();
}

export function initFileDropdownCloseListener() {
	document.addEventListener('click', (e) => {
		if (!state.fileDropdownOpen) return;
		const wrap = document.getElementById('fileSelectWrap');
		if (wrap && !wrap.contains(e.target)) closeFileDropdown();
	});
}
