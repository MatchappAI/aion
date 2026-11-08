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
// keyboard access for clickable things that aren't buttons (link-style spans, clickable table rows, the side menu):
// they get a tab stop and a button role, and Enter or Space clicks them
const CLICKABLE = 'span.link, a.link:not([href]), #nav a:not([href]), tr.qrow, tr[data-nopen], tr[data-open], tr[data-sid], .drop';
export function keyboardAccess(root = document) {
  const mark = () => root.querySelectorAll(CLICKABLE).forEach(el => { if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0'); if (!el.hasAttribute('role')) el.setAttribute('role', 'button'); });
  new MutationObserver(mark).observe(root.body || root, { childList: true, subtree: true }); mark();
  root.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target?.matches?.(CLICKABLE)) { e.preventDefault(); e.target.click(); } });
}
// a button that does one thing at a time: disabled with a working label until the action finishes
export async function busy(btn, label, fn) {
  if (!btn || btn.disabled) return; const was = btn.textContent; btn.disabled = true; btn.textContent = label;
  try { return await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = was; } }
}
