import { currentUser, state, isLoggedIn } from '../core/state.js';
import { fmtDate, fmtSize, genId } from '../core/utils.js';
import { finishProgress, setProgress, setStatus, showProgress, toast, triggerDownload } from '../core/status.js';
import { encryptChaCha20Poly1305, decryptChaCha20Poly1305, deriveChaChaKey } from '../core/crypto.js';
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
	const isOnline = state.appMode === 'cloud';
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
		const iv = algo === 'AES-128-CTR' ? crypto.getRandomValues(new Uint8Array(16)) : crypto.getRandomValues(new Uint8Array(12));
		let cipher;
		let algorithmId;
		if (algo === 'AES-256-GCM') {
			const key = await crypto.subtle.deriveKey(
				{ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
				km,
				{ name: 'AES-GCM', length: 256 },
				false,
				['encrypt']
			);
			cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf);
			algorithmId = 1;
		} else if (algo === 'AES-128-CTR') {
			const key = await crypto.subtle.deriveKey(
				{ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
				km,
				{ name: 'AES-CTR', length: 128 },
				false,
				['encrypt']
			);
			cipher = await crypto.subtle.encrypt({ name: 'AES-CTR', counter: iv, length: 64 }, key, buf);
			algorithmId = 2;
		} else if (algo === 'ChaCha20-Poly1305') {
			const keyBytes = await deriveChaChaKey(pass, salt);
			cipher = encryptChaCha20Poly1305(new Uint8Array(buf), keyBytes, iv);
			algorithmId = 3;
		} else {
			throw new Error('Unsupported algorithm selected');
		}
		setProgress('enc', 90);
		const out = new Uint8Array(1 + 16 + iv.length + cipher.byteLength);
		out[0] = algorithmId;
		out.set(salt, 1);
		out.set(iv, 17);
		out.set(new Uint8Array(cipher), 17 + iv.length);
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
	const isOnline = state.appMode === 'cloud';
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
		const algorithmId = data[0];
		const salt = data.slice(1, 17);
		let nonceSize = 12;
		let algorithmName;
		if (algorithmId === 2) {
			nonceSize = 16;
			algorithmName = 'AES-128-CTR';
		} else if (algorithmId === 3) {
			nonceSize = 12;
			algorithmName = 'ChaCha20-Poly1305';
		} else {
			nonceSize = 12;
			algorithmName = 'AES-256-GCM';
		}
		const iv = data.slice(17, 17 + nonceSize);
		const cipher = data.slice(17 + nonceSize);
		const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
		setProgress('dec', 55);
		let plain;
		if (algorithmId === 1) {
			const key = await crypto.subtle.deriveKey(
				{ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
				km,
				{ name: 'AES-GCM', length: 256 },
				false,
				['decrypt']
			);
			setProgress('dec', 75);
			plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
		} else if (algorithmId === 2) {
			const key = await crypto.subtle.deriveKey(
				{ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
				km,
				{ name: 'AES-CTR', length: 128 },
				false,
				['decrypt']
			);
			setProgress('dec', 75);
			plain = await crypto.subtle.decrypt({ name: 'AES-CTR', counter: iv, length: 64 }, key, cipher);
		} else if (algorithmId === 3) {
			const keyBytes = await deriveChaChaKey(pass, salt);
			setProgress('dec', 75);
			plain = decryptChaCha20Poly1305(cipher, keyBytes, iv);
		} else {
			throw new Error('Unsupported encryption algorithm');
		}
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