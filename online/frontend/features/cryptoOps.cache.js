import { currentUser, state, isLoggedIn } from '../core/state.js';
import { genId } from '../core/utils.js';
import { finishProgress, setProgress, setStatus, showProgress, toast, triggerDownload } from '../core/status.js';
import { encryptChaCha20Poly1305, decryptChaCha20Poly1305, deriveChaChaKey } from '../core/crypto.js';
import { renderMgrList } from './manager.js';
import { clearOnlineFileSelection, renderFileSelectDropdown } from '../ui/selector.js';
import { clearDecDropSelection, clearEncDropSelection } from '../ui/dropzone.js';
import { uploadFile, addDecryptionRecord, downloadFile, getDecryptionHistory, listFiles } from '../core/api.js';
import { uploadBlobToDrive, shareDriveFileWithUser, getDriveFileLink } from '../core/drive.js';

const MAGIC = new TextEncoder().encode('ENC1');
const SALT_LEN = 16;
const NONCE_LEN = 12;
const IV_LEN = 16;
const PBKDF2_ITERS = 100000;

const ALGO_IDS = {
	'AES-256-GCM': 1,
	'AES-128-CTR': 2,
	'ChaCha20-Poly1305': 3,
};

const ALGO_NAMES = {
	1: 'AES-256-GCM',
	2: 'AES-128-CTR',
	3: 'ChaCha20-Poly1305',
};

let drivePayload = null;
let driveFile = null;

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

function concatBytes(...chunks) {
	const total = chunks.reduce((sum, c) => sum + c.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out;
}

function randomBytes(len) {
	const out = new Uint8Array(len);
	crypto.getRandomValues(out);
	return out;
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

export async function triggerDownloadFromManager(id) {
	if (!id) return;
	try {
		const blob = await downloadFile(id);
		const entry = (state.serverFiles || []).find((f) => f.file_id === id) || {};
		const name = entry.file_name || entry.original_name || 'encrypted.enc';
		const key = genId();
		state.encryptedBlobs[key] = { blob, name };
		triggerDownload(state.encryptedBlobs, key);
	} catch (err) {
		console.error('Download failed:', err);
		toast('Download failed.');
	}
}

export function resetDriveUpload() {
	drivePayload = null;
	driveFile = null;
	updateDriveButton(false, false);
	updateEncEmailButton(false, false);
}

async function deriveAesKey(password, salt, bits, algoName) {
	const material = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
		material,
		{ name: algoName, length: bits },
		false,
		['encrypt', 'decrypt']
	);
}

async function encryptBytes(buffer, password, algo) {
	const salt = randomBytes(SALT_LEN);
	const algoId = ALGO_IDS[algo] || ALGO_IDS['AES-256-GCM'];

	if (algo === 'AES-256-GCM') {
		const iv = randomBytes(NONCE_LEN);
		const key = await deriveAesKey(password, salt, 256, 'AES-GCM');
		const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buffer);
		return { algoId, salt, iv, cipher: new Uint8Array(cipher) };
	}

	if (algo === 'AES-128-CTR') {
		const iv = randomBytes(IV_LEN);
		const key = await deriveAesKey(password, salt, 128, 'AES-CTR');
		const cipher = await crypto.subtle.encrypt({ name: 'AES-CTR', counter: iv, length: 64 }, key, buffer);
		return { algoId, salt, iv, cipher: new Uint8Array(cipher) };
	}

	const nonce = randomBytes(NONCE_LEN);
	const key = await deriveChaChaKey(password, salt);
	const cipher = encryptChaCha20Poly1305(new Uint8Array(buffer), key, nonce);
	return { algoId, salt, iv: nonce, cipher };
}

async function decryptBytes(payload, password) {
	if (payload.length < MAGIC.length + 3 + SALT_LEN + NONCE_LEN) {
		throw new Error('Invalid encrypted file.');
	}
	const magic = payload.subarray(0, 4);
	if (!magic.every((b, i) => b === MAGIC[i])) {
		throw new Error('Unsupported encrypted format.');
	}
	const algoId = payload[4];
	const saltLen = payload[5];
	const ivLen = payload[6];
	const salt = payload.subarray(7, 7 + saltLen);
	const iv = payload.subarray(7 + saltLen, 7 + saltLen + ivLen);
	const cipher = payload.subarray(7 + saltLen + ivLen);

	const algo = ALGO_NAMES[algoId] || 'AES-256-GCM';
	if (algo === 'AES-256-GCM') {
		const key = await deriveAesKey(password, salt, 256, 'AES-GCM');
		const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
		return new Uint8Array(plain);
	}

	if (algo === 'AES-128-CTR') {
		const key = await deriveAesKey(password, salt, 128, 'AES-CTR');
		const plain = await crypto.subtle.decrypt({ name: 'AES-CTR', counter: iv, length: 64 }, key, cipher);
		return new Uint8Array(plain);
	}

	const key = await deriveChaChaKey(password, salt);
	return decryptChaCha20Poly1305(cipher, key, iv);
}

function buildEncryptedPayload({ algoId, salt, iv, cipher }) {
	const header = new Uint8Array(7);
	header.set(MAGIC, 0);
	header[4] = algoId;
	header[5] = salt.length;
	header[6] = iv.length;
	return concatBytes(header, salt, iv, cipher);
}

function buildEncFileName(name) {
	if (!name) return 'file.enc';
	return name.endsWith('.enc') ? name : `${name}.enc`;
}

function buildDecFileName(name) {
	if (!name) return 'file';
	if (name.endsWith('.enc')) return name.slice(0, -4);
	return name;
}

export async function uploadEncryptedToDrive() {
	if (!drivePayload) {
		setStatus('enc', 'Please encrypt a file first.', 'err');
		return;
	}
	updateDriveButton(true, false);
	setStatus('enc', 'Uploading to Google Drive...', '');
	try {
		const data = await uploadBlobToDrive(drivePayload.blob, drivePayload.name);
		const fileId = data && data.id ? data.id : null;
		if (!fileId) throw new Error('Drive did not return a file ID.');

		driveFile = {
			id: fileId,
			webViewLink: data.webViewLink || null,
			name: data.name || drivePayload.name,
		};
		setStatus('enc', 'Uploaded to Drive. Ready to share via email.', 'ok');
		toast('Uploaded to Drive successfully.');
		updateEncEmailButton(true, true);
	} catch (err) {
		setStatus('enc', 'Drive upload failed: ' + err.message, 'err');
		toast('Drive upload failed.');
	} finally {
		updateDriveButton(true, true);
	}
}

export async function emailEncryptedFile() {
	if (!driveFile || !driveFile.id) {
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
		await shareDriveFileWithUser(driveFile.id, recipient);

		let link = driveFile.webViewLink;
		if (!link) {
			const info = await getDriveFileLink(driveFile.id);
			link = info.webViewLink;
			driveFile.webViewLink = link;
		}
		if (!link) throw new Error('Could not resolve Drive link.');

		const fileName = driveFile.name;
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
	const algo = document.getElementById('algorithm').value || 'AES-256-GCM';
	const btn = document.getElementById('encryptBtn');
	if (btn) btn.disabled = true;
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
		setProgress('enc', 35);
		const encrypted = await encryptBytes(buf, pass, algo);
		setProgress('enc', 85);

		const payload = buildEncryptedPayload(encrypted);
		const encName = buildEncFileName(sourceBaseName);
		const blob = new Blob([payload], { type: 'application/octet-stream' });

		const localId = genId();
		state.encryptedBlobs[localId] = { blob, name: encName };

		finishProgress('enc', 'Done');

		if (state.appMode === 'cloud') {
			drivePayload = { blob, name: encName };
			updateDriveButton(true, true);
			updateEncEmailButton(true, false);
			setStatus('enc', 'Encrypted. Ready to upload to Drive.', 'ok');

			if (isLoggedIn()) {
				try {
					await uploadFile(blob, encName, algo);
					const filesRes = await listFiles();
					state.serverFiles = filesRes.files || [];
					if (state.activeTab === 'mgr') renderMgrList('enc');
				} catch (err) {
					console.error('Server upload failed:', err);
				}
			}
		} else {
			triggerDownload(state.encryptedBlobs, localId);
			setStatus('enc', 'Encrypted and downloaded.', 'ok');
		}

		clearEncDropSelection();
	} catch (err) {
		console.error(err);
		finishProgress('enc', 'Failed');
		setStatus('enc', 'Encryption failed.', 'err');
	} finally {
		if (btn) btn.disabled = false;
	}
}

export async function decryptFile() {
	const password = document.getElementById('decPassword').value || '';
	if (!password) return setStatus('dec', 'Enter a password.', 'err');

	let fileBlob = null;
	let name = '';
	let encId = '';
	if (state.appMode === 'cloud') {
		if (!state.selectedDriveItemId) return setStatus('dec', 'Select a file first.', 'err');
		const cached = state.encryptedBlobs[state.selectedDriveItemId];
		if (!cached) return setStatus('dec', 'File not downloaded yet.', 'err');
		fileBlob = cached.blob;
		name = cached.name;
		encId = state.selectedDriveItemId;
	} else {
		if (!state.decFile) return setStatus('dec', 'Select a file first.', 'err');
		fileBlob = state.decFile;
		name = state.decFile.name;
		encId = name;
	}

	setStatus('dec', 'Decrypting...', '');
	showProgress('dec', 'Decrypting...');
	setProgress('dec', 10);

	try {
		const buffer = await fileBlob.arrayBuffer();
		const plain = await decryptBytes(new Uint8Array(buffer), password);
		setProgress('dec', 80);
		finishProgress('dec', 'Done');

		const outName = buildDecFileName(name);
		const blob = new Blob([plain], { type: 'application/octet-stream' });
		const id = genId();
		state.encryptedBlobs[id] = { blob, name: outName };
		triggerDownload(state.encryptedBlobs, id);
		setStatus('dec', 'Decrypted and downloaded.', 'ok');
		clearDecDropSelection();
		clearOnlineFileSelection();

		if (isLoggedIn()) {
			try {
				await addDecryptionRecord(encId, name, outName, blob.size);
				const histRes = await getDecryptionHistory();
				state.decryptionHistory = histRes.history || [];
				if (state.activeTab === 'mgr') renderMgrList('dec');
			} catch (err) {
				console.error('Failed to record decryption:', err);
			}
		}
	} catch (err) {
		console.error(err);
		finishProgress('dec', 'Failed');
		setStatus('dec', 'Decryption failed. Check your password.', 'err');
	}
}
