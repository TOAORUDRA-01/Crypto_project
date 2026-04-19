import { GOOGLE_DRIVE_SCOPE, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_SHARED_FOLDER_ID } from '../config.js';

let accessToken = null;
let tokenClient = null;

function hasGoogleIdentity() {
	return !!(window.google && window.google.accounts && window.google.accounts.oauth2);
}

export function initDriveAuth() {
	if (!hasGoogleIdentity()) {
		return false;
	}
	if (!GOOGLE_OAUTH_CLIENT_ID) {
		console.warn('Missing Google OAuth client ID.');
		return false;
	}
	if (!tokenClient) {
		tokenClient = window.google.accounts.oauth2.initTokenClient({
			client_id: GOOGLE_OAUTH_CLIENT_ID,
			scope: GOOGLE_DRIVE_SCOPE,
			callback: () => {},
		});
	}
	return true;
}

export function getDriveAccessToken() {
	return accessToken;
}

function requestAccessToken(promptMode) {
	return new Promise((resolve, reject) => {
		if (!initDriveAuth()) {
			reject(new Error('Google Identity Services not ready.'));
			return;
		}
		tokenClient.callback = (response) => {
			if (response && response.access_token) {
				accessToken = response.access_token;
				resolve(accessToken);
				return;
			}
			reject(new Error(response && response.error ? response.error : 'Google auth failed.'));
		};
		tokenClient.requestAccessToken({ prompt: promptMode });
	});
}

export async function ensureDriveAccessToken() {
	try {
		return await requestAccessToken('');
	} catch (err) {
		return await requestAccessToken('consent');
	}
}

export async function uploadBlobToDrive(blob, fileName) {
	const token = await ensureDriveAccessToken();
	const metadata = {
		name: fileName,
		mimeType: 'application/octet-stream',
	};
	if (GOOGLE_DRIVE_SHARED_FOLDER_ID) {
		metadata.parents = [GOOGLE_DRIVE_SHARED_FOLDER_ID];
	}

	const form = new FormData();
	form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
	form.append('file', blob);

	const res = await fetch(
		'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
			},
			body: form,
		}
	);

	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const msg = data && data.error && data.error.message ? data.error.message : 'Drive upload failed.';
		throw new Error(msg);
	}

	return data;
}

/**
 * Grant a specific user 'reader' access to a Drive file by email.
 * Uses sendNotificationEmail=false because we send our own Gmail compose.
 * Returns the created permission object on success.
 */
export async function shareDriveFileWithUser(fileId, recipientEmail) {
	const token = await ensureDriveAccessToken();
	const res = await fetch(
		`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				type: 'user',
				role: 'reader',
				emailAddress: recipientEmail,
			}),
		}
	);

	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const msg = data && data.error && data.error.message ? data.error.message : 'Failed to share Drive file.';
		throw new Error(msg);
	}
	return data;
}

/**
 * Fetch a fresh webViewLink for a Drive file (in case we didn't capture it at upload time).
 */
export async function getDriveFileLink(fileId) {
	const token = await ensureDriveAccessToken();
	const res = await fetch(
		`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,webViewLink&supportsAllDrives=true`,
		{
			headers: { Authorization: `Bearer ${token}` },
		}
	);
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		const msg = data && data.error && data.error.message ? data.error.message : 'Failed to fetch Drive file info.';
		throw new Error(msg);
	}
	return data;
}
