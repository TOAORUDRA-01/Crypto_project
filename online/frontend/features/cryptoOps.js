import { state } from '../core/state.js';
import { genId } from '../core/utils.js';
import { setStatus, showProgress, setProgress, finishProgress, triggerDownload, toast } from '../core/status.js';
import { clearEncDropSelection, clearDecDropSelection } from '../ui/dropzone.js';
import { clearOnlineFileSelection } from '../ui/selector.js';
import { encryptChaCha20Poly1305, decryptChaCha20Poly1305, deriveChaChaKey } from '../core/crypto.js';
import { uploadBlobToDrive, shareDriveFileWithUser, getDriveFileLink } from '../core/drive.js';

const MAGIC = new TextEncoder().encode('ENC1');
const SALT_LEN = 16;
const NONCE_LEN = 12;
const IV_LEN = 16;
const PBKDF2_ITERS = 100000;
let encEmailPayload = null;
let decEmailPayload = null;
let encDrivePayload = null;
let encDriveFile = null;

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

// let encDrivePayload = null;

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

function setEncUiState({ showDrive, allowEmail }) {
	const driveBtn = document.getElementById('encDriveBtn');
	const emailBtn = document.getElementById('encEmailBtn');
	if (!driveBtn || !emailBtn) return;
	driveBtn.style.display = showDrive ? 'block' : 'none';
	emailBtn.style.display = showDrive ? 'block' : 'none';
	driveBtn.disabled = !showDrive;
	emailBtn.disabled = !allowEmail;
}

export async function encryptFile() {
	const file = state.encFile;
	const password = document.getElementById('encPassword').value || '';
	const algo = document.getElementById('algorithm').value || 'AES-256-GCM';
	if (!file) return setStatus('enc', 'Select a file first.', 'err');
	if (!password) return setStatus('enc', 'Enter a password.', 'err');

	setStatus('enc', 'Encrypting...', '');
	showProgress('enc', 'Encrypting...');
	setProgress('enc', 8);

	try {
		const buffer = await file.arrayBuffer();
		const encrypted = await encryptBytes(buffer, password, algo);
		const payload = buildEncryptedPayload(encrypted);
		const name = buildEncFileName(file.name);
		const blob = new Blob([payload], { type: 'application/octet-stream' });

		setProgress('enc', 80);
		finishProgress('enc', 'Done');

		if (state.appMode === 'cloud') {
			encDrivePayload = { blob, name };
			setEncUiState({ showDrive: true, allowEmail: false });
			setStatus('enc', 'Encrypted. Ready to upload to Drive.', 'ok');
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
			const id = genId();
			state.encryptedBlobs[id] = { blob, name };
			triggerDownload(state.encryptedBlobs, id);
			setStatus('enc', 'Encrypted and downloaded.', 'ok');
		}
		clearEncDropSelection();
	} catch (err) {
		console.error(err);
		finishProgress('enc', 'Failed');
		setStatus('enc', 'Encryption failed.', 'err');
	}
}

export async function decryptFile() {
	const password = document.getElementById('decPassword').value || '';
	if (!password) return setStatus('dec', 'Enter a password.', 'err');

	let fileBlob = null;
	let name = '';
	if (state.appMode === 'cloud') {
		if (!state.selectedDriveItemId) return setStatus('dec', 'Select a file first.', 'err');
		const cached = state.encryptedBlobs[state.selectedDriveItemId];
		if (!cached) return setStatus('dec', 'File not downloaded yet.', 'err');
		fileBlob = cached.blob;
		name = cached.name;
	} else {
		if (!state.decFile) return setStatus('dec', 'Select a file first.', 'err');
		fileBlob = state.decFile;
		name = state.decFile.name;
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
	} catch (err) {
		console.error(err);
		finishProgress('dec', 'Failed');
		setStatus('dec', 'Decryption failed. Check your password.', 'err');
	}
}

export async function uploadEncryptedToDrive() {
	if (!encDrivePayload) {
		toast('Nothing to upload yet.');
		return;
	}
	const driveBtn = document.getElementById('encDriveBtn');
	if (driveBtn) driveBtn.disabled = true;
	setStatus('enc', 'Uploading to Drive...', '');
	try {
		const data = await uploadBlobToDrive(encDrivePayload.blob, encDrivePayload.name);
		encDrivePayload.driveId = data?.id || null;
		setEncUiState({ showDrive: true, allowEmail: !!encDrivePayload.driveId });
		setStatus('enc', 'Uploaded to Drive.', 'ok');
	} catch (err) {
		console.error(err);
		setEncUiState({ showDrive: true, allowEmail: false });
		setStatus('enc', 'Drive upload failed.', 'err');
	} finally {
		if (driveBtn) driveBtn.disabled = false;
	}
}

export async function emailEncryptedFile() {
	if (!encDrivePayload?.driveId) {
		toast('Upload to Drive first.');
		return;
	}
	const email = prompt('Enter recipient email');
	if (!email) return;
	setStatus('enc', 'Sharing...', '');
	try {
		await shareDriveFileWithUser(encDrivePayload.driveId, email);
		const info = await getDriveFileLink(encDrivePayload.driveId);
		const link = info?.webViewLink || '';
		setStatus('enc', `Shared with ${email}.`, 'ok');
		if (link) {
			const subject = encodeURIComponent('Encrypted file from Encryptix');
			const body = encodeURIComponent('Here is the shared file link:\n' + link);
			const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${subject}&body=${body}`;
			window.open(gmailUrl, '_blank', 'noopener');
			toast('Share link: ' + link);
		}
	} catch (err) {
		console.error(err);
		setStatus('enc', 'Share failed.', 'err');
	}
}

export function resetDriveUpload() {
	encDrivePayload = null;
	setEncUiState({ showDrive: false, allowEmail: false });
}

export function triggerDownloadFromManager() {
	toast('Server downloads are disabled for Drive-only mode.');
}
