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
		if (input.files && input.files.length) cb(input.files);
	});
	drop.addEventListener('dragover', (e) => {
		e.preventDefault();
		drop.classList.add('dragover');
	});
	drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
	drop.addEventListener('drop', (e) => {
		e.preventDefault();
		drop.classList.remove('dragover');
		if (e.dataTransfer.items && e.dataTransfer.items.length) {
			collectDroppedFiles(e.dataTransfer.items)
				.then((files) => {
					if (files.length) {
						cb(files);
						return;
					}
					if (e.dataTransfer.files && e.dataTransfer.files.length) {
						cb(e.dataTransfer.files);
					}
				})
				.catch(() => {
					if (e.dataTransfer.files && e.dataTransfer.files.length) cb(e.dataTransfer.files);
				});
			return;
		}
		if (e.dataTransfer.files && e.dataTransfer.files.length) cb(e.dataTransfer.files);
	});
}

function readAllEntries(reader) {
	return new Promise((resolve, reject) => {
		const entries = [];
		const readBatch = () => {
			reader.readEntries((batch) => {
				if (!batch.length) {
					resolve(entries);
					return;
				}
				entries.push(...batch);
				readBatch();
			}, reject);
		};
		readBatch();
	});
}

function fileEntryToFile(entry, pathPrefix) {
	return new Promise((resolve, reject) => {
		entry.file((file) => {
			const relPath = pathPrefix ? pathPrefix + file.name : file.name;
			try {
				Object.defineProperty(file, 'webkitRelativePath', {
					value: relPath,
					writable: false,
				});
			} catch (err) {
				// Best-effort: keep the file even if path injection fails.
			}
			resolve(file);
		}, reject);
	});
}

async function traverseEntry(entry, pathPrefix) {
	if (entry.isFile) {
		return [await fileEntryToFile(entry, pathPrefix)];
	}
	if (entry.isDirectory) {
		const reader = entry.createReader();
		const entries = await readAllEntries(reader);
		const results = [];
		for (const child of entries) {
			const childPrefix = pathPrefix + entry.name + '/';
			const childFiles = await traverseEntry(child, childPrefix);
			results.push(...childFiles);
		}
		return results;
	}
	return [];
}

async function collectDroppedFiles(items) {
	const entries = [];
	for (const item of Array.from(items)) {
		const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
		if (entry) entries.push(entry);
	}
	if (!entries.length) return [];
	const files = [];
	for (const entry of entries) {
		const entryFiles = await traverseEntry(entry, '');
		files.push(...entryFiles);
	}
	return files;
}

function getRootFolderName(files) {
	const first = files[0];
	if (!first || !first.webkitRelativePath) return 'folder';
	const parts = first.webkitRelativePath.split('/');
	return parts[0] || 'folder';
}

function applyEncSelection(fileList) {
	const files = Array.from(fileList || []);
	if (!files.length) return;
	const fileName = document.getElementById('encFileName');
	const isFolder = files.length > 1 || (files[0] && files[0].webkitRelativePath);
	if (isFolder) {
		state.encFiles = files;
		state.encFile = null;
		const rootName = getRootFolderName(files);
		const totalSize = files.reduce((sum, f) => sum + f.size, 0);
		if (fileName) fileName.textContent = 'Folder: ' + rootName + ' (' + files.length + ' files, ' + fmtSize(totalSize) + ')';
		setStatus('enc', 'Folder ready', '');
		return;
	}
	state.encFile = files[0];
	state.encFiles = null;
	if (fileName) fileName.textContent = files[0].name + ' (' + fmtSize(files[0].size) + ')';
	setStatus('enc', 'File ready', '');
}

export function initDropzones() {
	wireDropZone('encDrop', 'encFileInput', (files) => {
		applyEncSelection(files);
	});
	const encFolderBtn = document.getElementById('encFolderBtn');
	const encFolderInput = document.getElementById('encFolderInput');
	if (encFolderBtn && encFolderInput) {
		encFolderBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			encFolderInput.click();
		});
		encFolderInput.addEventListener('change', () => {
			if (encFolderInput.files && encFolderInput.files.length) {
				applyEncSelection(encFolderInput.files);
			}
		});
	}
	wireDropZone('decDrop', 'decFileInput', (files) => {
		const f = files && files.length ? files[0] : null;
		if (!f) return;
		state.decFile = f;
		document.getElementById('decFileName').textContent = f.name + ' (' + fmtSize(f.size) + ')';
		setStatus('dec', 'File ready', '');
	});
}

export function clearEncDropSelection() {
	state.encFile = null;
	state.encFiles = null;
	const input = document.getElementById('encFileInput');
	if (input) input.value = '';
	const folderInput = document.getElementById('encFolderInput');
	if (folderInput) folderInput.value = '';
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
