// Backend API service configuration and utilities
import { getApiBaseUrl } from '../config.js';

let authToken = null;

function extractErrorMessage(errorPayload, fallbackMessage) {
	if (!errorPayload) return sofallbackMessage;

	if (typeof errorPayload === 'string') return errorPayload;

	if (Array.isArray(errorPayload)) {
		const messages = errorPayload
			.map((item) => item && (item.msg || item.message || item.detail))
			.filter(Boolean);

		return messages.length ? messages.join(', ') : fallbackMessage;
	}

	if (typeof errorPayload === 'object') {
		if (typeof errorPayload.message === 'string') return errorPayload.message;
		if (typeof errorPayload.detail === 'string') return errorPayload.detail;
		if (Array.isArray(errorPayload.detail)) {
			return extractErrorMessage(errorPayload.detail, fallbackMessage);
		}
		if (typeof errorPayload.detail === 'object' && errorPayload.detail) {
			return extractErrorMessage(errorPayload.detail, fallbackMessage);
		}
	}

	return fallbackMessage;
}

export function setAuthToken(token) {
	authToken = token;
	if (token) {
		localStorage.setItem('auth_token', token);
	} else {
		localStorage.removeItem('auth_token');
	}
}

export function getAuthToken() {
	return authToken || localStorage.getItem('auth_token');
}

function getHeaders(includeAuth = true) {
	const headers = {
		'Content-Type': 'application/json',
	};
	const token = getAuthToken();
	if (includeAuth && token) {
		headers['Authorization'] = `Bearer ${token}`;
	}
	return headers;
}

export async function apiCall(endpoint, options = {}) {
	const { method = 'GET', body = null, includeAuth = true, isFormData = false } = options;
	
	const headers = getHeaders(includeAuth);
	if (isFormData) delete headers['Content-Type']; // FormData sets its own Content-Type
	
	const config = {
		method,
		headers,
	};
	
	if (body) {
		config.body = isFormData ? body : JSON.stringify(body);
	}
	
	try {
		const apiBase = getApiBaseUrl();
		const response = await fetch(`${apiBase}${endpoint}`, config);
		
		if (!response.ok) {
			const error = await response.json().catch(() => ({ detail: response.statusText }));
			throw new Error(extractErrorMessage(error, `HTTP ${response.status}`));
		}
		
		return await response.json();
	} catch (err) {
		console.error(`API Error [${endpoint}]:`, err);
		throw err;
	}
}

// Auth endpoints
export async function signUp(email, name, password) {
	const res = await apiCall('/api/auth/signup', {
		method: 'POST',
		body: { email, name, password },
		includeAuth: false,
	});
	if (res.token) setAuthToken(res.token);
	return res;
}

export async function login(email, password) {
	const res = await apiCall('/api/auth/login', {
		method: 'POST',
		body: { email, password },
		includeAuth: false,
	});
	if (res.token) setAuthToken(res.token);
	return res;
}

export async function logout() {
	try {
		await apiCall('/api/auth/logout', { method: 'POST' });
	} finally {
		setAuthToken(null);
	}
}

export async function getProfile() {
	return await apiCall('/api/auth/profile');
}

// File endpoints
export async function uploadFile(blob, originalName, algorithm) {
	const formData = new FormData();
	formData.append('file', blob, originalName);
	formData.append('original_name', originalName);
	formData.append('algorithm', algorithm);
	
	return await apiCall('/api/files/upload', {
		method: 'POST',
		body: formData,
		isFormData: true,
	});
}

export async function listFiles() {
	return await apiCall('/api/files/list');
}

export async function downloadFile(fileId) {
	const token = getAuthToken();
	const url = `${getApiBaseUrl()}/api/files/download/${fileId}`;
	const headers = { 'Authorization': `Bearer ${token}` };
	
	const response = await fetch(url, { headers });
	if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
	return response.blob();
}

export async function deleteFile(fileId) {
	return await apiCall(`/api/files/delete/${fileId}`, { method: 'DELETE' });
}

export async function deleteAllFiles() {
	return await apiCall('/api/files/delete-all', { method: 'DELETE' });
}

// History endpoints
export async function addDecryptionRecord(encryptedFileId, encryptedFileName, originalFilename, fileSize) {
	return await apiCall('/api/history/add-record', {
		method: 'POST',
		body: {
			encrypted_file_id: encryptedFileId,
			encrypted_file_name: encryptedFileName,
			original_filename: originalFilename,
			file_size: fileSize,
		},
	});
}

export async function getDecryptionHistory() {
	return await apiCall('/api/history/list');
}

export async function clearDecryptionHistory() {
	return await apiCall('/api/history/clear', { method: 'DELETE' });
}

// Google OAuth helpers
export async function getGoogleAuthUrl(target = 'gmail') {
	return await apiCall(`/api/google/auth/url?target=${encodeURIComponent(target)}`);
}

export async function googleCallback(code, target = 'gmail') {
	return await apiCall(`/api/google/auth/callback?target=${encodeURIComponent(target)}`, {
		method: 'POST',
		body: { code },
	});
}

export async function sendToGmail(file, originalName, toEmail, subject, body) {
	const formData = new FormData();
	formData.append('file', file, originalName);
	formData.append('to_email', toEmail);
	formData.append('subject', subject);
	formData.append('body', body);
	return await apiCall('/api/files/email-send', {
		method: 'POST',
		body: formData,
		isFormData: true,
	});
}

export async function uploadToDrive(fileId) {
	return await apiCall(`/api/files/drive-upload/${fileId}`, { method: 'POST' });
}

// Health check
export async function healthCheck() {
	try {
		const res = await apiCall('/api/health', { includeAuth: false });
		return res.status === 'healthy';
	} catch {
		return false;
	}
}
