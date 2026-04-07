import { showAuth, switchAuthMode, closeAuth, submitAuth, logout, openProfile, closeProfile } from './features/auth.js';
import { decryptFile, encryptFile, triggerDownloadFromManager } from './features/cryptoOps.js';
import { initDropzones } from './ui/dropzone.js';
import { askDelete, askDeleteAll, closeConfirm, runConfirm, switchMgrTab, renderMgrTab } from './features/manager.js';
import { setMode } from './ui/modes.js';
import { initFileDropdownCloseListener, toggleFileDropdown, selectOnlineFile, renderFileSelectDropdown } from './ui/selector.js';
import { switchTab } from './ui/tabs.js';
import { EYE_OPEN, EYE_SHUT } from './core/utils.js';
import { state } from './core/state.js';
import { toast } from './core/status.js';
import { getAuthToken, setAuthToken, listFiles, getDecryptionHistory } from './core/api.js';
import { getApiBaseUrl } from './config.js';

function syncThemeUI() {
	const isDark = state.theme === 'dark';
	document.body.classList.toggle('theme-dark', isDark);
	const label = document.getElementById('themeToggleLabel');
	if (label) {
		label.textContent = isDark ? 'Light mode' : 'Dark mode';
	}
}

function setTheme(theme) {
	state.theme = theme === 'dark' ? 'dark' : 'light';
	localStorage.setItem('theme', state.theme);
	syncThemeUI();
}

function toggleTheme() {
	setTheme(state.theme === 'dark' ? 'light' : 'dark');
}

function togglePass(id, btn) {
const inp = document.getElementById(id);
const show = inp.type === 'password';
inp.type = show ? 'text' : 'password';
btn.innerHTML = show ? EYE_SHUT : EYE_OPEN;
}

function initOverlayHandlers() {
document.getElementById('authOverlay').addEventListener('click', (e) => {
if (e.target.id === 'authOverlay') closeAuth();
});
document.getElementById('profileOverlay').addEventListener('click', (e) => {
if (e.target.id === 'profileOverlay') closeProfile();
});
document.getElementById('confirmOverlay').addEventListener('click', (e) => {
if (e.target.id === 'confirmOverlay') closeConfirm();
});
['authName', 'authEmail', 'authPass'].forEach((id) => {
document.getElementById(id).addEventListener('keydown', (e) => {
if (e.key === 'Enter') submitAuth();
});
});
}

function exposeGlobals() {
Object.assign(window, {
		setAppMode,
		toggleTheme,
showAuth,
switchAuthMode,
closeAuth,
submitAuth,
logout,
openProfile,
closeProfile,
switchTab,
switchMgrTab,
setMode,
togglePass,
encryptFile,
decryptFile,
toggleFileDropdown,
selectOnlineFile,
askDelete,
askDeleteAll,
closeConfirm,
runConfirm,
triggerDownloadFromManager,
});
}

function syncAppModeUI() {
	const localBtn = document.getElementById('appLocalModeBtn');
	const cloudBtn = document.getElementById('appCloudModeBtn');
	const toggle = document.getElementById('appModeToggle');
	const hint = document.getElementById('appModeHint');
	const mgrTabBtn = document.getElementById('tabMgr');
	const topbarActions = document.getElementById('topbarActions');

	const isCloud = state.appMode === 'cloud';
	localBtn.classList.toggle('active', !isCloud);
	cloudBtn.classList.toggle('active', isCloud);
	toggle.classList.toggle('cloud', isCloud);
	topbarActions.style.display = isCloud ? 'flex' : 'none';
	if (isCloud && state.userProfile) {
		const init = state.userProfile.name.charAt(0).toUpperCase();
		topbarActions.innerHTML = '<div class="user-chip" onclick="openProfile()"><div class="avatar">' + init + '</div>' + state.userProfile.name.split(' ')[0] + '</div>';
	} else if (isCloud) {
		topbarActions.innerHTML =
			'<button class="btn btn-ghost" onclick="showAuth(\'login\')">Login</button>' +
			'<button class="btn btn-primary" onclick="showAuth(\'signup\')">Sign Up</button>';
	}
	mgrTabBtn.disabled = !isCloud;
	mgrTabBtn.title = isCloud ? '' : 'Switch to Cloud mode to manage server files.';

	if (isCloud) {
		hint.textContent = 'Cloud mode active: encrypted files can be uploaded to server storage and managed with your account.';
	} else {
		hint.textContent = 'Local mode active: files are encrypted/decrypted on this device and are not uploaded.';
	}
}

function setAppMode(mode) {
	if (mode !== 'local' && mode !== 'cloud') return;
	state.appMode = mode;
	localStorage.setItem('app_mode', mode);
	syncAppModeUI();

	if (mode === 'cloud') {
		setMode('enc', 'online');
		setMode('dec', 'online');
		if (!state.userProfile) {
			showAuth('login');
		}
		toast('Cloud mode enabled.');
		return;
	}

	closeAuth();
	setMode('enc', 'desktop');
	setMode('dec', 'desktop');
	if (state.activeTab === 'mgr') {
		switchTab('enc');
	}
	toast('Local mode enabled.');
}

async function restoreAuthToken() {
	// Try to restore auth token from localStorage and rehydrate user + cloud data.
	const token = getAuthToken();
	if (!token) return;

	state.authToken = token;
	setAuthToken(token);

	try {
		const response = await fetch(`${getApiBaseUrl()}/api/auth/profile`, {
			headers: { Authorization: `Bearer ${token}` },
		});

		if (!response.ok) {
			throw new Error('profile restore failed');
		}

		const payload = await response.json();
		state.userProfile = payload.user || null;

		const [filesRes, histRes] = await Promise.all([
			listFiles(),
			getDecryptionHistory(),
		]);

		state.serverFiles = filesRes.files || [];
		state.decryptionHistory = histRes.history || [];

		renderFileSelectDropdown();
		if (state.activeTab === 'mgr') renderMgrTab();
	} catch {
		state.userProfile = null;
		state.authToken = null;
		state.serverFiles = [];
		state.decryptionHistory = [];
		setAuthToken(null);
	}
}

async function init() {
	await restoreAuthToken();
initDropzones();
initFileDropdownCloseListener();
initOverlayHandlers();
exposeGlobals();
	const savedTheme = localStorage.getItem('theme');
	state.theme = savedTheme === 'dark' ? 'dark' : 'light';
	syncThemeUI();
	const savedMode = localStorage.getItem('app_mode');
	state.appMode = savedMode === 'cloud' ? 'cloud' : 'local';
	syncAppModeUI();
	setAppMode(state.appMode);
}

init();
