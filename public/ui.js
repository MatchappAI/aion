// Small shared pieces of the page: corner messages for errors and finished actions.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// errors stay up to 20 seconds (or until closed); other messages 4 seconds
export function toast(msg, kind = 'ok') {
  let box = document.querySelector('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  t.innerHTML = `<span>${esc(msg)}</span><button class="ghost sm" aria-label="Close message">×</button>`;
  t.querySelector('button').onclick = () => t.remove(); box.appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 20000 : 4000);
}
// a button that does one thing at a time: disabled with a working label until the action finishes
export async function busy(btn, label, fn) {
  if (!btn || btn.disabled) return; const was = btn.textContent; btn.disabled = true; btn.textContent = label;
  try { return await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = was; } }
}
