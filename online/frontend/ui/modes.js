import { state } from '../core/state.js';
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
		document.getElementById('encLoginWall').style.display = 'none';
		document.getElementById('encMainContent').style.display = 'block';
		document.getElementById('encFormContent').style.display = 'flex';
	} else {
		document.getElementById('decDesktopPanel').style.display = mode === 'desktop' ? 'block' : 'none';
		document.getElementById('decOnlinePanel').style.display = mode === 'online' ? 'block' : 'none';
		if (mode === 'online') {
			document.getElementById('decLoginWall').style.display = 'none';
			document.getElementById('decOnlineContent').style.display = 'block';
			state.selectedOnlineEncId = null;
			closeFileDropdown();
			resetFileSelectBox();
			hideOnlineDecControls();
			setStatus('dec', '', '');
			renderFileSelectDropdown();
		} else {
			state.selectedOnlineEncId = null;
			closeFileDropdown();
			showDesktopDecControls();
			setStatus('dec', 'No file selected', '');
		}
	}
}