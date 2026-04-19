import { state } from '../core/state.js';
import { esc, fmtSize } from '../core/utils.js';
import { setStatus } from '../core/status.js';
import { hasDriveAccessToken, listSharedDriveItems, downloadDriveFile } from '../core/drive.js';

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

export async function openFileDropdown() {
	const dd = document.getElementById('fileSelectDropdown');
	if (dd) dd.innerHTML = '<p class="file-select-empty">Loading Drive items...</p>';
	document.getElementById('fileSelectDropdown').style.display = 'block';
	document.getElementById('fileSelectBox').classList.add('open');
	state.fileDropdownOpen = true;
	await refreshDriveItems();
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
	if (!hasDriveAccessToken()) {
		dd.innerHTML = '<p class="file-select-empty">Connect to Google Drive to load files.</p>';
		return;
	}

	const items = state.driveItems || [];
	if (!items.length) {
		dd.innerHTML = '<p class="file-select-empty">Shared folder is empty.</p>';
		return;
	}

	dd.innerHTML = items
		.map(
			(h) => {
				const name = h.name || 'File';
				const isFolder = h.mimeType === 'application/vnd.google-apps.folder';
				const size = isFolder ? 'Folder' : fmtSize(Number(h.size || 0));
				const date = h.modifiedTime ? new Date(h.modifiedTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
				return (
					'<div class="file-select-option ' +
					(state.selectedDriveItemId === h.id ? 'selected' : '') +
					'" onclick="selectOnlineFile(event,\'' +
					h.id +
					'\')">' +
					'<div class="file-select-option-info">' +
					'<div class="file-select-option-name" title="' +
					esc(name) +
					'">' +
					esc(name) +
					'</div>' +
					'<div class="file-select-option-meta">' +
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
	state.selectedDriveItemId = id;
	const items = state.driveItems || [];
	const entry = items.find((h) => h.id === id);
	if (entry) {
		const l = document.getElementById('fileSelectLabel');
		l.textContent = entry.name || 'File';
		l.classList.remove('placeholder');
	}
	if (entry && entry.mimeType === 'application/vnd.google-apps.folder') {
		setStatus('dec', 'Folders cannot be decrypted. Please select a file.', 'err');
		state.selectedDriveItemId = null;
		resetFileSelectBox();
		closeFileDropdown();
		return;
	}
	closeFileDropdown();
	showOnlineDecControls();
	setStatus('dec', 'Downloading file from Drive...', '');
	const entryName = entry?.name || 'encrypted.enc';
	downloadDriveFile(id)
		.then((blob) => {
			state.encryptedBlobs[id] = { blob, name: entryName };
			setStatus('dec', 'File ready to decrypt.', '');
			document.getElementById('decPassword').focus();
		})
		.catch((err) => {
			setStatus('dec', 'Drive download failed: ' + err.message, 'err');
			state.selectedDriveItemId = null;
			resetFileSelectBox();
			hideOnlineDecControls();
		});
}

export function clearOnlineFileSelection() {
	state.selectedDriveItemId = null;
	resetFileSelectBox();
	closeFileDropdown();
	hideOnlineDecControls();
}

export async function refreshDriveItems() {
	setStatus('dec', 'Loading Drive items...', '');
	try {
		const items = await listSharedDriveItems();
		state.driveItems = items;
		renderFileSelectDropdown();
		setStatus('dec', '', '');
		return items;
	} catch (err) {
		state.driveItems = [];
		renderFileSelectDropdown();
		setStatus('dec', 'Drive access required. Please authorize.', 'err');
		return [];
	}
}

export function initFileDropdownCloseListener() {
	document.addEventListener('click', (e) => {
		if (!state.fileDropdownOpen) return;
		const wrap = document.getElementById('fileSelectWrap');
		if (wrap && !wrap.contains(e.target)) closeFileDropdown();
	});
}
