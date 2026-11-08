// Prints a local page to PDF with Google Chrome, invisibly: headless, in its own throwaway profile (so it never joins
// the Chrome window you have open), and stopped after a minute if it hangs.
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** Prints `url` to the file `out`. Resolves when the PDF exists; rejects with a plain message otherwise. */
export function printPdf(url, out, { budgetMs = 8000, timeoutMs = 60000, failMsg = 'The PDF was not created. Is Google Chrome installed?' } = {}) {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'aion-print-'));
  return new Promise((ok, bad) => {
    const c = spawn(CHROME, ['--headless=new', '--disable-gpu', `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--no-pdf-header-footer', `--virtual-time-budget=${budgetMs}`, `--print-to-pdf=${out}`, url], { stdio: 'ignore' });
    const timer = setTimeout(() => c.kill('SIGKILL'), timeoutMs);
    c.on('close', () => { clearTimeout(timer); fs.existsSync(out) ? ok() : bad(new Error(failMsg)); });
    c.on('error', e => { clearTimeout(timer); bad(new Error(failMsg)); });
  }).finally(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} });
}
