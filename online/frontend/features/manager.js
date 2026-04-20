import { currentUser, state, isLoggedIn } from '../core/state.js';
import { cap, esc, escQ, fmtSize, fmtDate } from '../core/utils.js';
import { toast } from '../core/status.js';
import { hideOnlineDecControls, renderFileSelectDropdown, resetFileSelectBox, refreshDriveItems } from '../ui/selector.js';
import { getDecryptionHistory, listFiles, deleteFile, deleteAllFiles, clearDecryptionHistory } from '../core/api.js';
import { deleteDriveFile } from '../core/drive.js';

export function switchMgrTab(t) {
	state.mgrTab = t;
	document.getElementById('mgrEncBtn').classList.toggle('active', t === 'enc');
	document.getElementById('mgrDecBtn').classList.toggle('active', t === 'dec');
	document.getElementById('mgrDeleteBtn').classList.toggle('active', t === 'delete');
	document.getElementById('mgrEncSection').classList.toggle('active', t === 'enc');
	document.getElementById('mgrDecSection').classList.toggle('active', t === 'dec');
	document.getElementById('mgrDeleteSection').classList.toggle('active', t === 'delete');
}

export async function renderMgrTab() {
	const u = currentUser();
	document.getElementById('mgrLoginWall').style.display = 'none';
	const mc = document.getElementById('mgrContent');
	mc.style.display = 'flex';
	if (state.appMode === 'cloud') {
		try {
			await refreshDriveItems();
		} catch (err) {
			console.error('Failed to refresh Drive items:', err);
		}
	}
	
	// Fetch history from backend if logged in
	if (isLoggedIn()) {
		try {
			const histRes = await getDecryptionHistory();
			state.decryptionHistory = histRes.history || [];
		} catch (err) {
			console.error('Failed to fetch decryption history:', err);
		}
	}
	
	renderMgrList('enc');
	renderMgrList('dec');
}

export function renderMgrList(side) {
	const u = currentUser();
	const isCloud = state.appMode === 'cloud';
	let hist = [];
	if (side === 'enc') {
		// In cloud mode, show Drive items. Otherwise show server files.
		hist = isCloud ? state.driveItems || [] : (u ? state.serverFiles || [] : []);
	} else {
		hist = u ? state.decryptionHistory || [] : [];
	}
	
	const listEl = document.getElementById('mgr' + cap(side) + 'List');
	const foot = document.getElementById('mgr' + cap(side) + 'Footer');
	const countEl = document.getElementById('mgr' + cap(side) + 'Count');
	
	foot.style.display = hist.length ? 'flex' : 'none';
	if (countEl) countEl.textContent = hist.length + ' file' + (hist.length !== 1 ? 's' : '');
	
	if (!hist.length) {
		listEl.innerHTML =
			side === 'enc'
				? '<div class="mgr-empty"><span class="mgr-empty-icon"></span><p>No encrypted files found in Drive yet.</p></div>'
				: '<div class="mgr-empty"><span class="mgr-empty-icon"></span><p>No decryption history yet.</p></div>';
		return;
	}
	
	listEl.innerHTML = hist
		.map((h) => {
			let name, meta, dlBtn;
			
			if (side === 'enc') {
				if (isCloud) {
					name = h.name || 'File';
					const isFolder = h.mimeType === 'application/vnd.google-apps.folder';
					const size = isFolder ? 'Folder' : fmtSize(Number(h.size || 0));
					const date = h.modifiedTime ? new Date(h.modifiedTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
					meta = size + ' · ' + date;
					dlBtn = '';
				} else {
					name = h.original_name || h.file_name || 'File';
					const size = fmtSize(h.file_size || 0);
					const date = h.uploaded_at ? new Date(h.uploaded_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
					meta = (h.algorithm || 'AES-256-GCM') + ' · ' + size + ' · ' + date;
					dlBtn = '<button class="mgr-btn mgr-btn-dl" onclick="triggerDownloadFromManager(\'' + (h.file_id || '') + '\')">↓ Download</button><span class="mgr-btn-sep"></span>';
				}
			} else {
				name = h.original_filename || 'File';
				const size = fmtSize(h.file_size || 0);
				const date = h.decrypted_at ? new Date(h.decrypted_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
				meta = 'From: ' + (h.encrypted_file_name || 'encrypted.enc') + ' · ' + size + ' · ' + date;
				dlBtn = '';
			}
			
			return (
				'<div class="mgr-row">' +
				'<span class="mgr-row-icon"></span>' +
				'<div class="mgr-row-info">' +
				'<div class="mgr-row-name" title="' +
				esc(name) +
				'">' +
				esc(name) +
				'</div>' +
				'<div class="mgr-row-meta">' +
				meta +
				'</div>' +
				'</div>' +
				'<div class="mgr-row-actions">' +
				dlBtn +
				'<button class="mgr-btn mgr-btn-del" onclick="askDelete(\'' + side + '\',\'' + (isCloud ? (h.id || '') : (h.file_id || h.history_id || '')) + '\',\'' + escQ(name) + '\')">🗑 Delete</button>' +
				'</div></div>'
			);
		})
		.join('');
}

export function askDelete(side, id, name) {
	state.pendingAction = () => deleteItem(side, id);
	document.getElementById('confirmTitle').textContent = 'Delete "' + name + '"?';
	const encDesc = state.appMode === 'cloud'
		? 'The file will be removed from the shared Drive folder.'
		: 'The encrypted file will be removed from your account permanently.';
	document.getElementById('confirmDesc').textContent = side === 'enc' ? encDesc : 'This history entry will be removed.';
	document.getElementById('confirmOkBtn').textContent = 'Delete';
	document.getElementById('confirmOverlay').classList.add('visible');
}

export function askDeleteAll(side) {
	state.pendingAction = () => deleteAll(side);
	const isEnc = side === 'enc';
	document.getElementById('confirmTitle').textContent = isEnc ? 'Delete all encrypted files?' : 'Clear all decryption history?';
	document.getElementById('confirmDesc').textContent = isEnc && state.appMode === 'cloud'
		? 'This will delete all items shown from the shared Drive folder.'
		: 'This cannot be undone.';
	document.getElementById('confirmOkBtn').textContent = isEnc ? 'Delete All' : 'Clear All';
	document.getElementById('confirmOverlay').classList.add('visible');
}

export function closeConfirm() {
	state.pendingAction = null;
	document.getElementById('confirmOverlay').classList.remove('visible');
}

export function runConfirm() {
	if (state.pendingAction) state.pendingAction();
	closeConfirm();
}

async function deleteItem(side, id) {
	const u = currentUser();
	if (!u && state.appMode !== 'cloud') return;
	
	try {
		if (side === 'enc') {
			if (state.appMode === 'cloud') {
				await deleteDriveFile(id);
				state.driveItems = state.driveItems.filter((f) => f.id !== id);
				delete state.encryptedBlobs[id];
				if (state.selectedDriveItemId === id) {
					state.selectedDriveItemId = null;
					resetFileSelectBox();
					hideOnlineDecControls();
				}
				renderFileSelectDropdown();
			} else {
				await deleteFile(id);
				state.serverFiles = state.serverFiles.filter((f) => f.file_id !== id);
				delete state.encryptedBlobs[id];
				if (state.selectedOnlineEncId === id) {
					state.selectedOnlineEncId = null;
					resetFileSelectBox();
					hideOnlineDecControls();
				}
				renderFileSelectDropdown();
			}
		} else {
			// For decryption history, we just remove it locally since there's no server delete per record
			state.decryptionHistory = state.decryptionHistory.filter((h) => h.history_id !== id);
		}
		renderMgrList(side);
		toast('Entry deleted.');
	} catch (err) {
		console.error('Delete failed:', err);
		toast('Failed to delete. Please try again.');
	}
}

async function deleteAll(side) {
	const u = currentUser();
	if (!u && state.appMode !== 'cloud') return;
	
	try {
		if (side === 'enc') {
			if (state.appMode === 'cloud') {
				for (const item of state.driveItems || []) {
					await deleteDriveFile(item.id);
				}
				state.driveItems = [];
				state.encryptedBlobs = {};
				state.selectedDriveItemId = null;
				resetFileSelectBox();
				hideOnlineDecControls();
				renderFileSelectDropdown();
			} else {
				await deleteAllFiles();
				state.serverFiles = [];
				state.encryptedBlobs = {};
				state.selectedOnlineEncId = null;
				resetFileSelectBox();
				hideOnlineDecControls();
				renderFileSelectDropdown();
			}
		} else {
			await clearDecryptionHistory();
			state.decryptionHistory = [];
		}
		renderMgrList(side);
		toast(side === 'enc' ? 'All encrypted files deleted.' : 'History cleared.');
	} catch (err) {
		console.error('Delete all failed:', err);
		toast('Failed to delete. Please try again.');
	}
}
