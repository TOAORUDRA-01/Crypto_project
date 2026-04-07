export function hashPass(p) {
	let h = 5381;
	for (let i = 0; i < p.length; i++) h = ((h << 5) + h) ^ p.charCodeAt(i);
	return (h >>> 0).toString(36);
}

export function genId() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function cap(s) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export function esc(s) {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function escQ(s) {
	return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export function fmtSize(b) {
	if (b < 1024) return b + ' B';
	if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
	return (b / 1048576).toFixed(1) + ' MB';
}

export function fmtDate() {
	return new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const EYE_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
export const EYE_SHUT = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
