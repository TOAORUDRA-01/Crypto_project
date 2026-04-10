import { currentUser, state } from '../core/state.js';
import { setStatus, toast } from '../core/status.js';
import {
	closeFileDropdown,
	hideOnlineDecControls,
	renderFileSelectDropdown,
	resetFileSelectBox,
	showDesktopDecControls,
} from './selector.js';

export function setMode(side, mode) {
	if (state.appMode === 'local' && mode === 'online') {
		toast('Switch app mode to Cloud to use server features.');
		return;
	}

	const desktopBtn = document.getElementById(side + 'DesktopBtn');
	const onlineBtn = document.getElementById(side + 'OnlineBtn');
	if (desktopBtn) desktopBtn.classList.toggle('active', mode === 'desktop');
	if (onlineBtn) onlineBtn.classList.toggle('active', mode === 'online');

	if (side === 'enc') {
		const isLoggedIn = !!currentUser();
		if (mode === 'online') {
			document.getElementById('encLoginWall').style.display = isLoggedIn ? 'none' : 'flex';
			document.getElementById('encMainContent').style.display = isLoggedIn ? 'block' : 'none';
			document.getElementById('encFormContent').style.display = isLoggedIn ? 'flex' : 'none';
		} else {
			document.getElementById('encLoginWall').style.display = 'none';
			document.getElementById('encMainContent').style.display = 'block';
			document.getElementById('encFormContent').style.display = 'flex';
		}
	} else {
		document.getElementById('decDesktopPanel').style.display = mode === 'desktop' ? 'block' : 'none';
		document.getElementById('decOnlinePanel').style.display = mode === 'online' ? 'block' : 'none';
		const isLoggedIn = !!currentUser();
		if (mode === 'online') {
			document.getElementById('decLoginWall').style.display = isLoggedIn ? 'none' : 'flex';
			document.getElementById('decOnlineContent').style.display = isLoggedIn ? 'block' : 'none';
			if (!isLoggedIn) {
				hideOnlineDecControls();
				setStatus('dec', '', '');
			} else {
				state.selectedOnlineEncId = null;
				closeFileDropdown();
				resetFileSelectBox();
				hideOnlineDecControls();
				setStatus('dec', '', '');
				renderFileSelectDropdown();
			}
		} else {
			state.selectedOnlineEncId = null;
			closeFileDropdown();
			showDesktopDecControls();
			setStatus('dec', 'No file selected', '');
		}
	}
}