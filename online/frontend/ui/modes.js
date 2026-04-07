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

	document.getElementById(side + 'DesktopBtn').classList.toggle('active', mode === 'desktop');
	document.getElementById(side + 'OnlineBtn').classList.toggle('active', mode === 'online');
	if (side === 'enc') {
		const li = !!currentUser();
		if (mode === 'online') {
			document.getElementById('encLoginWall').style.display = li ? 'none' : 'flex';
			document.getElementById('encMainContent').style.display = li ? 'block' : 'none';
			document.getElementById('encFormContent').style.display = li ? 'flex' : 'none';
		} else {
			document.getElementById('encLoginWall').style.display = 'none';
			document.getElementById('encMainContent').style.display = 'block';
			document.getElementById('encFormContent').style.display = 'flex';
		}
	} else {
		document.getElementById('decDesktopPanel').style.display = mode === 'desktop' ? 'block' : 'none';
		document.getElementById('decOnlinePanel').style.display = mode === 'online' ? 'block' : 'none';
		const li = !!currentUser();
		if (mode === 'online') {
			document.getElementById('decLoginWall').style.display = li ? 'none' : 'flex';
			document.getElementById('decOnlineContent').style.display = li ? 'block' : 'none';
			if (!li) {
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
