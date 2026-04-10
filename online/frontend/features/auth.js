import { currentUser, state, isLoggedIn } from '../core/state.js';
import { genId, hashPass } from '../core/utils.js';
import { toast } from '../core/status.js';
import { renderMgrTab } from './manager.js';
import { hideOnlineDecControls, renderFileSelectDropdown } from '../ui/selector.js';
import { signUp, login, logout as apiLogout, setAuthToken, getAuthToken, listFiles, getDecryptionHistory } from '../core/api.js';

export function showAuth(mode) {
	if (state.appMode !== 'cloud') {
		toast('Authentication is available in Cloud mode only.');
		return;
	}

	state.authMode = mode;
	['authError', 'authName', 'authEmail', 'authPass'].forEach((id) => {
		const el = document.getElementById(id);
		if (el.tagName === 'INPUT') el.value = '';
		else el.textContent = '';
	});
	const s = mode === 'signup';
	document.getElementById('authTitle').textContent = s ? 'Create account' : 'Welcome back';
	document.getElementById('authSub').textContent = s ? 'Sign up to save your history.' : 'Login to your account to continue.';
	document.getElementById('nameField').style.display = s ? 'flex' : 'none';
	document.getElementById('authSubmitBtn').textContent = s ? 'Sign Up' : 'Login';
	document.getElementById('authSwitch').innerHTML = s
		? 'Already have an account? <span onclick="switchAuthMode()">Login</span>'
		: 'Don\'t have an account? <span onclick="switchAuthMode()">Sign Up</span>';
	document.getElementById('authOverlay').classList.add('visible');
	setTimeout(() => document.getElementById('authEmail').focus(), 50);
}

export function switchAuthMode() {
	showAuth(state.authMode === 'login' ? 'signup' : 'login');
}

export function closeAuth() {
	document.getElementById('authOverlay').classList.remove('visible');
}

export async function submitAuth() {
	const email = document.getElementById('authEmail').value.trim().toLowerCase();
	const pass = document.getElementById('authPass').value;
	const name = document.getElementById('authName').value.trim();
	const errEl = document.getElementById('authError');
	const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
	errEl.textContent = '';
	
	if (!email || !pass) {
		errEl.textContent = 'Please fill in all fields.';
		return;
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		errEl.textContent = 'Enter a valid email address.';
		return;
	}
	if (pass.length < 8) {
		errEl.textContent = 'Password must be at least 8 characters.';
		return;
	}
	if (!passwordPattern.test(pass)) {
		errEl.textContent = 'Password must include an uppercase letter, a lowercase letter, and a number.';
		return;
	}
	
	try {
		document.getElementById('authSubmitBtn').disabled = true;
		
		if (state.authMode === 'signup') {
			if (!name) {
				errEl.textContent = 'Please enter your name.';
				return;
			}
			const result = await signUp(email, name, pass);
			state.authToken = result.token;
			state.userProfile = result.user;
			setAuthToken(result.token);
			toast('Welcome, ' + name + '!');
		} else {
			const result = await login(email, pass);
			state.authToken = result.token;
			state.userProfile = result.user;
			setAuthToken(result.token);
			toast('Welcome back, ' + result.user.name + '!');
		}
		
		closeAuth();
		onLogin();
	} catch (err) {
		errEl.textContent = err.message || 'Authentication failed. Please try again.';
		console.error('Auth error:', err);
	} finally {
		document.getElementById('authSubmitBtn').disabled = false;
	}
}

export async function logout() {
	try {
		await apiLogout();
	} catch (err) {
		console.error('Logout error:', err);
	} finally {
		state.authToken = null;
		state.userProfile = null;
		state.serverFiles = [];
		state.decryptionHistory = [];
		closeProfile();
		onLogout();
		toast('Logged out.');
	}
}

function onLogin() {
	const u = currentUser();
	if (!u) return;
	const init = u.name.charAt(0).toUpperCase();
	document.getElementById('topbarActions').innerHTML = '<div class="user-chip" onclick="openProfile()"><div class="avatar">' + init + '</div>' + u.name.split(' ')[0] + '</div>';
	
	// Fetch user's server files and history
	fetchUserData();
	
	if (state.appMode === 'cloud') {
		document.getElementById('encLoginWall').style.display = 'none';
		document.getElementById('encMainContent').style.display = 'block';
		document.getElementById('encFormContent').style.display = 'flex';
		document.getElementById('decLoginWall').style.display = 'none';
		document.getElementById('decOnlineContent').style.display = 'block';
		renderFileSelectDropdown();
	}
	if (state.activeTab === 'mgr') renderMgrTab();
}

async function fetchUserData() {
	try {
		const filesRes = await listFiles();
		state.serverFiles = filesRes.files || [];

		const histRes = await getDecryptionHistory();
		state.decryptionHistory = histRes.history || [];

		renderFileSelectDropdown();
		if (state.activeTab === 'mgr') renderMgrTab();
	} catch (err) {
		console.error('Failed to fetch user data:', err);
	}
}

function onLogout() {
	document.getElementById('topbarActions').innerHTML =
		'<button class="btn btn-ghost" onclick="showAuth(\'login\')">Login</button>' + '<button class="btn btn-primary" onclick="showAuth(\'signup\')">Sign Up</button>';
	if (state.appMode === 'cloud') {
		document.getElementById('encLoginWall').style.display = 'flex';
		document.getElementById('encMainContent').style.display = 'none';
		document.getElementById('encFormContent').style.display = 'none';
		document.getElementById('decLoginWall').style.display = 'flex';
		document.getElementById('decOnlineContent').style.display = 'none';
		hideOnlineDecControls();
	}
	if (state.activeTab === 'mgr') renderMgrTab();
}

export function openProfile() {
	const u = currentUser();
	if (!u) return;
	document.getElementById('profileAvatar').textContent = u.name.charAt(0).toUpperCase();
	document.getElementById('profileName').textContent = u.name;
	document.getElementById('profileEmailDisp').textContent = u.email;
	document.getElementById('profileSince').textContent = u.created_at 
		? new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
		: 'Unknown';
	document.getElementById('profileEncCount').textContent = u.total_encrypted_files || 0;
	document.getElementById('profileDecCount').textContent = state.decryptionHistory.length;
	document.getElementById('profileAlgo').textContent = u.default_algorithm || 'AES-256-GCM';
	document.getElementById('profileOverlay').classList.add('visible');
}

export function closeProfile() {
	document.getElementById('profileOverlay').classList.remove('visible');
}