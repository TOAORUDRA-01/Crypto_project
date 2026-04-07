export function setStatus(side, msg, cls) {
	const el = document.getElementById(side + 'Status');
	if (!el) return;
	el.textContent = msg;
	el.className = 'status-line ' + cls;
}

export function toast(msg) {
	const t = document.getElementById('toast');
	t.textContent = msg;
	t.classList.add('show');
	clearTimeout(t._t);
	t._t = setTimeout(() => t.classList.remove('show'), 3200);
}

export function showProgress(side, label) {
	const w = document.getElementById(side + 'ProgressWrap');
	const f = document.getElementById(side + 'ProgressFill');
	w.classList.add('visible');
	document.getElementById(side + 'ProgressLabel').textContent = label;
	document.getElementById(side + 'ProgressPct').textContent = '0%';
	f.style.width = '0%';
	f.classList.remove('done');
}

export function setProgress(side, pct) {
	document.getElementById(side + 'ProgressFill').style.width = pct + '%';
	document.getElementById(side + 'ProgressPct').textContent = pct + '%';
}

export function finishProgress(side, label) {
	const f = document.getElementById(side + 'ProgressFill');
	f.classList.add('done');
	f.style.width = '100%';
	document.getElementById(side + 'ProgressPct').textContent = '100%';
	document.getElementById(side + 'ProgressLabel').textContent = label;
	setTimeout(() => {
		document.getElementById(side + 'ProgressWrap').classList.remove('visible');
		f.classList.remove('done');
		f.style.width = '0%';
	}, 1800);
}

export function triggerDownload(store, id) {
	const item = store[id];
	if (!item) {
		toast('File no longer available.');
		return;
	}
	const url = URL.createObjectURL(item.blob);
	const a = Object.assign(document.createElement('a'), { href: url, download: item.name });
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(() => URL.revokeObjectURL(url), 3000);
}
