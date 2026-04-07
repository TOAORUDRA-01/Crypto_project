import { currentUser, state, isLoggedIn } from '../core/state.js';
import { fmtDate, fmtSize, genId } from '../core/utils.js';
import { finishProgress, setProgress, setStatus, showProgress, toast, triggerDownload } from '../core/status.js';
import { renderMgrList } from './manager.js';
import { clearOnlineFileSelection, renderFileSelectDropdown } from '../ui/selector.js';
import { clearDecDropSelection, clearEncDropSelection } from '../ui/dropzone.js';
import { uploadFile, addDecryptionRecord, downloadFile, getDecryptionHistory } from '../core/api.js';

export function triggerDownloadFromManager(id) {
	triggerDownload(state.encryptedBlobs, id);
}

export async function encryptFile() {
	if (!state.encFile) {
		setStatus('enc', 'Please select a file first.', 'err');
		return;
	}
	const pass = document.getElementById('encPassword').value;
	if (!pass) {
		setStatus('enc', 'Please enter a password.', 'err');
		return;
	}
	const algo = document.getElementById('algorithm').value;
	const btn = document.getElementById('encryptBtn');
	const isOnline = document.getElementById('encOnlineBtn').classList.contains('active');
	btn.disabled = true;
	setStatus('enc', '', '');
	showProgress('enc', 'Reading file...');
	setProgress('enc', 10);
	try {
		const buf = await state.encFile.arrayBuffer();
		setProgress('enc', 30);
		const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
		setProgress('enc', 50);
		const salt = crypto.getRandomValues(new Uint8Array(16));
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const keyLen = algo === 'AES-128-CTR' ? 128 : 256;
		const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: keyLen }, false, ['encrypt']);
		setProgress('enc', 70);
		const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf);
		setProgress('enc', 90);
		const out = new Uint8Array(1 + 16 + 12 + cipher.byteLength);
		out[0] = keyLen === 256 ? 1 : 0;
		out.set(salt, 1);
		out.set(iv, 17);
		out.set(new Uint8Array(cipher), 29);
		const blob = new Blob([out], { type: 'application/octet-stream' });
		const encName = state.encFile.name + '.enc';
		const id = genId();
		state.encryptedBlobs[id] = { blob, name: encName };
		
		if (isOnline) {
			// Upload to server
			setProgress('enc', 95);
			const algoMap = { 'AES-128-CTR': 'AES-128-CTR', 'AES-256-GCM': 'AES-256-GCM', 'ChaCha20-Poly1305': 'ChaCha20-Poly1305' };
			await uploadFile(blob, encName, algoMap[algo] || 'AES-256-GCM');
			setStatus('enc', 'Uploaded to account: ' + encName, 'ok');
		} else {
			triggerDownload(state.encryptedBlobs, id);
			setStatus('enc', 'Encrypted & downloaded: ' + encName, 'ok');
		}
		
		finishProgress('enc', 'Done');
		toast('File encrypted successfully.');
		document.getElementById('encPassword').value = '';
		clearEncDropSelection();
	} catch (e) {
		document.getElementById('encProgressWrap').classList.remove('visible');
		setStatus('enc', e.message || 'Encryption failed. Please try again.', 'err');
		console.error(e);
	}
	btn.disabled = false;
}

export async function decryptFile() {
	const isOnline = document.getElementById('decOnlineBtn').classList.contains('active');
	const pass = document.getElementById('decPassword').value;
	if (!pass) {
		setStatus('dec', 'Please enter the password.', 'err');
		return;
	}
	let sourceBlob;
	let sourceName;
	let fileId = null;
	if (isOnline) {
		if (!state.selectedOnlineEncId) {
			setStatus('dec', 'Please select a file to decrypt.', 'err');
			return;
		}
		
		// Try to get from local cache first
		const stored = state.encryptedBlobs[state.selectedOnlineEncId];
		if (stored) {
			sourceBlob = stored.blob;
			sourceName = stored.name;
			fileId = state.selectedOnlineEncId;
		} else {
			// Download from server
			try {
				setStatus('dec', 'Downloading file from server...', '');
				sourceBlob = await downloadFile(state.selectedOnlineEncId);
				sourceName = 'encrypted.enc';
				fileId = state.selectedOnlineEncId;
			} catch (err) {
				setStatus('dec', 'Failed to download file: ' + err.message, 'err');
				return;
			}
		}
	} else {
		if (!state.decFile) {
			setStatus('dec', 'Please select a .enc file first.', 'err');
			return;
		}
		if (!state.decFile.name.endsWith('.enc')) {
			setStatus('dec', 'File must be a .enc file encrypted by Encryptix.', 'err');
			return;
		}
		sourceBlob = state.decFile;
		sourceName = state.decFile.name;
	}
	const btn = document.getElementById('decryptBtn');
	btn.disabled = true;
	setStatus('dec', '', '');
	showProgress('dec', 'Reading file...');
	setProgress('dec', 10);
	try {
		const buf = await sourceBlob.arrayBuffer();
		const data = new Uint8Array(buf);
		setProgress('dec', 30);
		if (data.length < 30) throw new Error('Invalid file');
		const keyLen = data[0] === 1 ? 256 : 128;
		const salt = data.slice(1, 17);
		const iv = data.slice(17, 29);
		const cipher = data.slice(29);
		const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
		setProgress('dec', 55);
		const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: keyLen }, false, ['decrypt']);
		setProgress('dec', 75);
		const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
		setProgress('dec', 90);
		const origName = sourceName.replace(/\.enc$/, '');
		const blob = new Blob([plain], { type: 'application/octet-stream' });
		const id = genId();
		triggerDownload({ [id]: { blob, name: origName } }, id);
		
		// Record decryption history if logged in
		if (isLoggedIn()) {
			try {
				await addDecryptionRecord(fileId || 'local', sourceName, origName, blob.size);
			} catch (err) {
				console.error('Failed to record decryption:', err);
			}
		}
		
		finishProgress('dec', 'Done');
		setStatus('dec', 'Decrypted & downloaded: ' + origName, 'ok');
		toast('File decrypted successfully.');
		document.getElementById('decPassword').value = '';
		if (isOnline) {
			clearOnlineFileSelection();
		} else {
			clearDecDropSelection();
		}
	} catch (e) {
		document.getElementById('decProgressWrap').classList.remove('visible');
		setStatus('dec', e.name === 'OperationError' ? 'Wrong password or corrupted file.' : 'Decryption failed. Is this a valid .enc file?', 'err');
		console.error(e);
	}
	btn.disabled = false;
}
