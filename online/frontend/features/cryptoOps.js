import { currentUser, state, isLoggedIn } from '../core/state.js';
import { fmtDate, fmtSize, genId } from '../core/utils.js';
import { finishProgress, setProgress, setStatus, showProgress, toast, triggerDownload } from '../core/status.js';
import { encryptChaCha20Poly1305, decryptChaCha20Poly1305, deriveChaChaKey } from '../core/crypto.js';
import { renderMgrList } from './manager.js';
import { clearOnlineFileSelection, renderFileSelectDropdown } from '../ui/selector.js';
import { clearDecDropSelection, clearEncDropSelection } from '../ui/dropzone.js';
import { uploadFile, addDecryptionRecord, downloadFile, getDecryptionHistory } from '../core/api.js';
import { uploadBlobToDrive, shareDriveFileWithUser, getDriveFileLink } from '../core/drive.js';
let encEmailPayload = null;
let decEmailPayload = null;
let encDrivePayload = null;
let encDriveFile = null;

function updateDriveButton(visible, enabled) {
	const button = document.getElementById('encDriveBtn');
	if (!button) return;
	button.style.display = visible ? 'block' : 'none';
	button.disabled = !enabled;
}

function updateEncEmailButton(visible, enabled) {
	const button = document.getElementById('encEmailBtn');
	if (!button) return;
	button.style.display = visible ? 'block' : 'none';
	button.disabled = !enabled;
}

// Basic email format check — matches backend's validator shape.
function isValidEmail(value) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getFolderRootName(files) {
	const first = files[0];
	if (!first || !first.webkitRelativePath) return 'folder';
	const parts = first.webkitRelativePath.split('/');
	return parts[0] || 'folder';
}

async function zipFolder(files, onProgress) {
	if (!window.JSZip) {
		throw new Error('JSZip is required for folder uploads. Please refresh the page.');
	}
	const zip = new window.JSZip();
	for (const file of files) {
		const path = file.webkitRelativePath || file.name;
		zip.file(path, file);
	}
	const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
		if (onProgress && metadata && typeof metadata.percent === 'number') {
			onProgress(metadata.percent);
		}
	});
	return { blob, rootName: getFolderRootName(files) };
}

export function triggerDownloadFromManager(id) {
	triggerDownload(state.encryptedBlobs, id);
}

export function resetDriveUpload() {
	encDrivePayload = null;
	encDriveFile = null;
	updateDriveButton(false, false);
	updateEncEmailButton(false, false);
}

export async function uploadEncryptedToDrive() {
	if (!encDrivePayload) {
		setStatus('enc', 'Please encrypt a file first.', 'err');
		return;
	}
	updateDriveButton(true, false);
	setStatus('enc', 'Uploading to Google Drive...', '');
	try {
		const data = await uploadBlobToDrive(encDrivePayload.blob, encDrivePayload.name);
		const fileId = data && data.id ? data.id : null;
		if (!fileId) throw new Error('Drive did not return a file ID.');

		encDriveFile = {
			id: fileId,
			webViewLink: data.webViewLink || null,
			name: data.name || encDrivePayload.name,
		};
		setStatus('enc', `Uploaded to Drive. Ready to share via email.`, 'ok');
		toast('Uploaded to Drive successfully.');
		// Email button becomes available only after Drive upload succeeds.
		updateEncEmailButton(true, true);
	} catch (err) {
		setStatus('enc', 'Drive upload failed: ' + err.message, 'err');
		toast('Drive upload failed.');
	} finally {
		updateDriveButton(true, true);
	}
}

/**
 * Share the uploaded Drive file with a recipient's Google account and open Gmail
 * compose prefilled with the Drive link. No attachment is sent — the recipient
 * uses the link to access the encrypted file (which still requires the password).
 */
export async function emailEncryptedFile() {
	if (!encDriveFile || !encDriveFile.id) {
		setStatus('enc', 'Please upload the encrypted file to Drive first.', 'err');
		return;
	}

	const recipient = (prompt('Enter recipient Gmail address:') || '').trim().toLowerCase();
	if (!recipient) {
		toast('Email cancelled.');
		return;
	}
	if (!isValidEmail(recipient)) {
		setStatus('enc', 'Invalid email address.', 'err');
		return;
	}

	updateEncEmailButton(true, false);
	setStatus('enc', `Sharing file with ${recipient}...`, '');

	try {
		await shareDriveFileWithUser(encDriveFile.id, recipient);

		// Resolve webViewLink if we don't already have one.
		let link = encDriveFile.webViewLink;
		if (!link) {
			const info = await getDriveFileLink(encDriveFile.id);
			link = info.webViewLink;
			encDriveFile.webViewLink = link;
		}
		if (!link) throw new Error('Could not resolve Drive link.');

		const fileName = encDriveFile.name;
		const subject = `Encrypted file: ${fileName}`;
		const body =
			`Hi,\n\n` +
			`I've shared an encrypted file with you via Google Drive:\n\n` +
			`${fileName}\n${link}\n\n` +
			`The file is encrypted with a password — I'll share the password separately.\n\n` +
			`Sent via Encryptix.`;

		const gmailUrl =
			`https://mail.google.com/mail/?view=cm&fs=1` +
			`&to=${encodeURIComponent(recipient)}` +
			`&su=${encodeURIComponent(subject)}` +
			`&body=${encodeURIComponent(body)}`;

		window.open(gmailUrl, '_blank', 'noopener,noreferrer');
		setStatus('enc', `Shared with ${recipient}. Gmail compose opened.`, 'ok');
		toast('Gmail compose opened with Drive link.');
	} catch (err) {
		const msg = (err && err.message) || 'Failed to share file.';
		// Drive returns a helpful message when the recipient isn't a Google account.
		setStatus('enc', `Email share failed: ${msg}`, 'err');
		toast('Email share failed.');
	} finally {
		updateEncEmailButton(true, true);
	}
}

export async function encryptFile() {
	const hasFolder = Array.isArray(state.encFiles) && state.encFiles.length > 0;
	if (!state.encFile && !hasFolder) {
		setStatus('enc', 'Please select a file or folder first.', 'err');
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
	try {
		let sourceBlob;
		let sourceBaseName;
		if (hasFolder) {
			showProgress('enc', 'Zipping folder...');
			setProgress('enc', 5);
			const zipRes = await zipFolder(state.encFiles, (pct) => {
				const mapped = 5 + Math.round(pct * 0.2);
				setProgress('enc', Math.min(mapped, 25));
			});
			sourceBlob = zipRes.blob;
			sourceBaseName = (zipRes.rootName || 'folder') + '.zip';
			showProgress('enc', 'Reading file...');
			setProgress('enc', 25);
		} else {
			showProgress('enc', 'Reading file...');
			setProgress('enc', 10);
			sourceBlob = state.encFile;
			sourceBaseName = state.encFile.name;
		}
		const buf = await sourceBlob.arrayBuffer();
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
		const encName = sourceBaseName + '.enc';
		const id = genId();
		state.encryptedBlobs[id] = { blob, name: encName };
		encDrivePayload = { blob, name: encName };

		if (isOnline) {
			setProgress('enc', 95);
			const algoMap = { 'AES-128-CTR': 'AES-128-CTR', 'AES-256-GCM': 'AES-256-GCM', 'ChaCha20-Poly1305': 'ChaCha20-Poly1305' };
			try {
				if (isLoggedIn()) {
					await uploadFile(blob, encName, algoMap[algo] || 'AES-256-GCM');
					setStatus('enc', 'Uploaded to account: ' + encName, 'ok');
				} else {
					setStatus('enc', 'Encrypted. Ready to upload to Drive.', 'ok');
				}
			} catch (err) {
				setStatus('enc', 'Server upload skipped: ' + err.message, 'warn');
			}
			// Drive button is enabled; email stays disabled until Drive upload completes.
			updateDriveButton(true, true);
			updateEncEmailButton(false, false);
		} else {
			updateDriveButton(false, false);
			updateEncEmailButton(false, false);
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

		const stored = state.encryptedBlobs[state.selectedOnlineEncId];
		if (stored) {
			sourceBlob = stored.blob;
			sourceName = stored.name;
			fileId = state.selectedOnlineEncId;
		} else {
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
