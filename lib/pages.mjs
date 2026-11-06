// Reads public web pages and PDFs ourselves. Used to check links an AI engine reports when the engine does not
// hand back its own search results: a link counts only if the page really loads, and its text is what later checks
// (company named on the page, contact details copied word for word) are run against.
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export function textOf(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}
const titleOf = html => (String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();

/** True for http(s) addresses on the public internet; false for this computer, private networks and odd schemes. */
export function isPublic(u) {
  let h; try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return false; h = x.hostname.toLowerCase().replace(/^\[|\]$/g, ''); } catch { return false; }
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return false;
  if (/^(0|10|127)\./.test(h) || /^169\.254\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return false;
  if (h.includes(':') && (h === '::1' || h === '::' || /^(fc|fd|fe80)/.test(h) || h.startsWith('::ffff:'))) return false;
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return false; // integer or hex forms of an address
  return true;
}

/** One page: { url, ok, status, title, text }. Never throws. */
export async function readPage(url, { timeoutMs = 12000, maxChars = 30000 } = {}) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    // only public web pages: a link the AI reports (or a redirect) must never reach this computer or the local network
    let r, at = url;
    for (let hop = 0; ; hop++) {
      if (!isPublic(at)) return { url, ok: false, status: 0, title: '', text: '', error: 'not a public web address' };
      r = await fetch(at, { redirect: 'manual', signal: ac.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' } });
      const loc = r.status >= 300 && r.status < 400 && r.headers.get('location');
      if (!loc || hop >= 5) break;
      at = new URL(loc, at).href;
    }
    const type = r.headers.get('content-type') || '';
    if (!r.ok) return { url, ok: false, status: r.status, title: '', text: '' };
    if (!/text|html|xml|json/.test(type)) return { url, ok: true, status: r.status, title: '', text: '' };
    const html = (await r.text()).slice(0, 2e6);
    return { url, ok: true, status: r.status, title: titleOf(html), text: textOf(html).slice(0, maxChars) };
  } catch (e) { return { url, ok: false, status: 0, title: '', text: '', error: e.name === 'AbortError' ? 'timed out' : e.message }; }
  finally { clearTimeout(t); }
}

/** Many pages, a few at a time. Returns only pages that loaded. */
export async function readPages(urls, { limit = 40, concurrency = 6 } = {}) {
  const list = [...new Set(urls.filter(u => /^https?:\/\//i.test(u)).map(u => u.split('#')[0]))].slice(0, limit), out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, async () => { while (i < list.length) { const p = await readPage(list[i++]); if (p.ok) out.push(p); } }));
  return out;
}

/** Every http(s) link written in a piece of text (the engine's answer). */
export const linksIn = text => [...String(text || '').matchAll(/https?:\/\/[^\s"'<>)\]}\\]+/g)].map(m => m[0].replace(/[.,;:]+$/, ''));

/** PDF text with page markers, for engines that cannot open the file themselves. */
export async function pdfText(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const c = await (await doc.getPage(n)).getTextContent();
    // rebuild lines from text positions so table rows stay on one line
    const rows = new Map();
    for (const it of c.items) { if (!it.str?.trim()) continue; const y = Math.round(it.transform[5]); (rows.get(y) || rows.set(y, []).get(y)).push(it); }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, its]) => its.sort((a, b) => a.transform[4] - b.transform[4]).map(x => x.str).join('  '));
    pages.push(`=== Page ${n} ===\n${lines.join('\n')}`);
  }
  return { pages: doc.numPages, text: pages.join('\n\n') };
}
