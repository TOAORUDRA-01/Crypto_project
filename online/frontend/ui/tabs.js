import { state } from '../core/state.js';
import { cap } from '../core/utils.js';
import { toast } from '../core/status.js';
import { renderMgrTab } from '../features/manager.js';

export function switchTab(tab) {
	if (tab === 'mgr' && state.appMode !== 'cloud') {
		toast('Manage Files is available in Cloud mode only.');
		tab = 'enc';
	}

	state.activeTab = tab;
	['enc', 'dec', 'mgr'].forEach((t) => {
		const panel = document.getElementById('panel' + cap(t));
		panel.classList.toggle('active', t === tab);
		const btn = document.getElementById('tab' + cap(t));
		btn.className = 'tab-btn' + (t === tab ? ' active-' + t : '');
	});
	if (tab === 'mgr') renderMgrTab();
}
