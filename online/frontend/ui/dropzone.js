import { state } from '../core/state.js';
import { fmtSize } from '../core/utils.js';
import { setStatus } from '../core/status.js';

function wireDropZone(dropId, inputId, cb) {
	const drop = document.getElementById(dropId);
	const input = document.getElementById(inputId);
	drop.addEventListener('click', (e) => {
		e.stopPropagation();
		input.click();
	});
	input.addEventListener('change', () => {
		if (input.files[0]) cb(input.files[0]);
	});
	drop.addEventListener('dragover', (e) => {
		e.preventDefault();
		drop.classList.add('dragover');
	});
	drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
	drop.addEventListener('drop', (e) => {
		e.preventDefault();
		drop.classList.remove('dragover');
		if (e.dataTransfer.files[0]) cb(e.dataTransfer.files[0]);
	});
}

export function initDropzones() {
	wireDropZone('encDrop', 'encFileInput', (f) => {
		state.encFile = f;
		document.getElementById('encFileName').textContent = f.name + ' (' + fmtSize(f.size) + ')';
		setStatus('enc', 'File ready', '');
	});
	wireDropZone('decDrop', 'decFileInput', (f) => {
		state.decFile = f;
		document.getElementById('decFileName').textContent = f.name + ' (' + fmtSize(f.size) + ')';
		setStatus('dec', 'File ready', '');
	});
}

export function clearEncDropSelection() {
	state.encFile = null;
	const input = document.getElementById('encFileInput');
	if (input) input.value = '';
	const fileName = document.getElementById('encFileName');
	if (fileName) fileName.textContent = 'No file selected';
}

export function clearDecDropSelection() {
	state.decFile = null;
	const input = document.getElementById('decFileInput');
	if (input) input.value = '';
	const fileName = document.getElementById('decFileName');
	if (fileName) fileName.textContent = 'No file selected';
}
