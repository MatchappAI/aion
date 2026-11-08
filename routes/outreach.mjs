// Outreach routes (moved out of server.mjs with no change in behaviour): the board, drafts, the preview and its
// one-time confirm code, sends, replies, documents and the LOI. server.mjs passes in what these routes use.
import path from 'node:path';

export const OUTREACH_POST = new Set(['outreach/settings', 'outreach/connect', 'outreach/disconnect', 'outreach/create', 'outreach/rewrite', 'outreach/edit', 'outreach/confirm', 'outreach/send', 'outreach/done', 'outreach/stage', 'outreach/sync', 'outreach/answer', 'outreach/answer-send', 'outreach/book', 'outreach/find-email', 'outreach/doc', 'outreach/doc-edit', 'outreach/doc-send', 'outreach/link-deal', 'outreach/batch', 'outreach/mock-reply', 'outreach/finish', 'outreach/delete']);

/** Handles an /api/outreach/... request. Returns true when it answered, false when the server should carry on. */
export async function outreachRoute(req, res, url, p, ctx) {
  const { send, body, OUT, GMAIL, CONFIRM, ownerList, outreachReady, letterHtml, outreachPdf, PORT, SRUN, loadSearch, MODELS, ROOTWS, finderKeys, busy, loadDeal, derive, persist, deal } = ctx;
  if (req.method === 'GET') {
      // Outreach: its own board, senders and drafts (sends only from your connected senders in AION_SENDERS, only with your OK)
      if (req.method === 'GET' && p === 'outreach/state') return send(res, 200, { settings: OUT.settings(), accounts: GMAIL.accounts(), gmailReady: GMAIL.configured(), board: (() => { const { R, list } = ownerList(), off = new Map(R.outside.map(x => [`${x.search}|${x.entity}`, x.box.reasons.join('; ')])), on = new Map(list.map(x => [`${x.search}|${x.entity}`, x]));
          return OUT.board().map(b => { const k = `${b.search}|${b.entity}`, r = on.get(k); return { ...b, outside: off.get(k) || null, rank: r?.nicheRank || null, track: r?.track || null, segmentLabel: r?.segmentLabel || null }; }); })(), ready: outreachReady(), suppressed: OUT.suppressed().length });
      if (req.method === 'GET' && p === 'outreach/results') return send(res, 200, OUT.results());
      if (req.method === 'GET' && p === 'outreach/slots') { try { return send(res, 200, await OUT.openSlots()); } catch (e) { return send(res, 400, { error: e.message }); } }
      if (req.method === 'GET' && p === 'outreach/attachments') { try { return send(res, 200, { files: await OUT.listAttachments(url.searchParams.get('id')) }); } catch (e) { return send(res, 400, { error: e.message }); } }
      if (req.method === 'GET' && p === 'outreach/attachment') { try { const buf = await OUT.getAttachment(url.searchParams.get('id'), url.searchParams.get('m'), url.searchParams.get('a')); return send(res, 200, { data: buf.toString('base64') }); } catch (e) { return send(res, 400, { error: e.message }); } }
      if (req.method === 'GET' && p === 'outreach/print') { try { const html = letterHtml(url.searchParams.get('id'), url.searchParams.get('kind')); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html); } catch (e) { return send(res, 404, { error: e.message }); } } // build the page before the headers go out, so an error can still be reported
      if (req.method === 'GET' && p === 'outreach/pdf') {
        try { const kind = url.searchParams.get('kind'), it = OUT.get(url.searchParams.get('id')); const buf = await outreachPdf(it.id, kind);
          res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${(kind === 'letter' ? 'Letter' : it.docs?.[kind]?.title || kind).replace(/[^\w ()-]+/g, '')} - ${it.name.replace(/[^\w &-]+/g, '')}.pdf"` }); return res.end(buf); } catch (e) { return send(res, 400, { error: e.message }); }
      }
      if (req.method === 'GET' && p === 'outreach/item') { try { return send(res, 200, OUT.item(url.searchParams.get('id'))); } catch (e) { return send(res, 404, { error: e.message }); } }
      if (req.method === 'GET' && p === 'outreach/google/callback') {
        const err = url.searchParams.get('error');
        let msg; try { if (err) throw new Error(err === 'access_denied' ? 'You cancelled the Google sign-in.' : err); msg = `Connected ${await GMAIL.finishConnect(url.searchParams.get('state'), url.searchParams.get('code'))}. You can close this tab and go back to AION.`; } catch (e) { msg = e.message; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(`<!doctype html><meta charset="utf-8"><title>AION</title><body style="font:15px -apple-system,sans-serif;padding:40px;max-width:520px"><h2>AION Outreach</h2><p>${String(msg).replace(/[<>&]/g, '')}</p></body>`);
      }
    return false;
  }
  if (req.method !== 'POST' || !OUTREACH_POST.has(p)) return false;
  const b = await body(req);
  switch (p) {
        case 'outreach/settings': return send(res, 200, OUT.setSettings(b));
        case 'outreach/connect': { try { return send(res, 200, GMAIL.connectUrl(PORT, String(b.email || '').trim())); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/disconnect': GMAIL.disconnect(b.email); return send(res, 200, { ok: true });
        case 'outreach/create': {
          const s2 = SRUN[b.search] || loadSearch(b.search); if (!s2) return send(res, 404, { error: 'Search not found.' });
          const e = (s2.entities || []).find(x => x.id === b.entity); if (!e) return send(res, 404, { error: 'Result not found.' });
          try { const it = await OUT.createDraft({ s: s2, e, pitch: OUT.PITCHES.includes(b.pitch) ? b.pitch : null, model: MODELS.analysis, cwd: path.join(ROOTWS, 'outreach') }); return send(res, 200, { id: it.id }); } catch (err) { return send(res, 400, { error: err.message }); }
        }
        case 'outreach/rewrite': { try { const it = OUT.get(b.id); const s2 = SRUN[it.search] || loadSearch(it.search); OUT.rewrite(b.id, { s: s2, pitch: b.pitch, model: MODELS.analysis, cwd: path.join(ROOTWS, 'outreach') }); return send(res, 200, { id: b.id }); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/edit': { try { return send(res, 200, OUT.editItem(b.id, b)); } catch (e) { return send(res, 400, { error: e.message }); } }
        // the preview: exactly what will be sent, plus a one-time code the send must bring back (nothing sends without it)
        case 'outreach/confirm': { try { const action = ['step', 'answer', 'doc', 'invite'].includes(b.action) ? b.action : 'step', kind = String(b.kind || ''), c = OUT.sendContent(b.id, action, kind, { start: b.start, note: b.note });
          return send(res, 200, { ...c, token: c.ok ? CONFIRM.issue(`${action}:${b.id}:${kind}`, c) : null }); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/send': { try { if (!b.saveOnly) CONFIRM.take(b.token, `step:${b.id}:${b.kind}`, OUT.sendContent(b.id, 'step', String(b.kind || ''))); return send(res, 200, await OUT.sendStep(b.id, b.kind, { confirmed: b.confirmed === true, saveOnly: !!b.saveOnly })); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/done': { try { return send(res, 200, OUT.markDone(b.id, b.kind, b.note)); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/stage': { try { return send(res, 200, OUT.setDealStage(b.id, b.stage, b.note)); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/sync': { try { return send(res, 200, { changed: await OUT.syncReplies() }); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/answer': { try { return send(res, 200, await OUT.draftAnswer(b.id, { model: MODELS.analysis, cwd: path.join(ROOTWS, 'outreach') })); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/answer-send': { try { CONFIRM.take(b.token, `answer:${b.id}:`, OUT.sendContent(b.id, 'answer', '')); return send(res, 200, await OUT.sendAnswer(b.id, { confirmed: b.confirmed === true })); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/book': { try { CONFIRM.take(b.token, `invite:${b.id}:`, OUT.sendContent(b.id, 'invite', '', { start: b.start })); return send(res, 200, await OUT.bookCall(b.id, { start: b.start, minutes: b.minutes, confirmed: b.confirmed === true })); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/find-email': { try { return send(res, 200, await OUT.findEmail(b.id, { hunterKey: finderKeys().hunter || process.env.HUNTER_API_KEY })); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/doc': {
          try {
            const it = OUT.get(b.id);
            if (b.kind === 'loi') {
              if (!it.dealId) return send(res, 400, { error: 'Open their books in Value Creation first (from the attachment in their email, or upload them), then write the LOI.' });
              if (busy()) return send(res, 409, { error: 'An analysis is still running. Try again when it finishes.' });
              // read that deal's numbers, then always put the deal you had open back, even if reading fails
              const was = deal.cur(); let d, deferred = 0; try { loadDeal(it.dealId); d = derive(); deferred = Math.max(0, +deal.S().diligence?.deferred_revenue?.value || 0); } finally { loadDeal(was); }
              if (!d.deal) return send(res, 400, { error: 'That company’s books haven’t been analyzed yet (or it can’t be priced). Open it in Value Creation and press Analyze.' });
              const numbers = { fees: d.deal.fees || 0, ebitda: d.normalization.normalized, price: d.deal.price, multiple: d.deal.multiple, basis: d.deal.basis, senior: d.deal.senior, seller: d.deal.seller, equity: d.deal.equity, revenue: d.pnl?.TTM?.revenue || 0, stake: d.deal.stake ?? 1, rollover: d.deal.rollover || 0, wcPeg: d.wc?.peg != null ? d.wc.peg - deferred : null, deferred };
              // whole thousands, with costs = sources − price, so every figure in the letter adds up exactly
              const k = v => Math.round((+v || 0) / 1000) * 1000;
              for (const f of ['ebitda', 'price', 'senior', 'seller', 'equity', 'revenue']) numbers[f] = k(numbers[f]);
              numbers.fees = Math.max(0, numbers.senior + numbers.seller + numbers.equity - numbers.price);
              return send(res, 200, await OUT.makeLoi(b.id, numbers, { model: MODELS.analysis, cwd: path.join(ROOTWS, 'outreach') }));
            }
            const s2 = loadSearch(it.search);
            return send(res, 200, OUT.makeDoc(b.id, b.kind, s2?.subsector));
          } catch (e) { return send(res, 400, { error: e.message }); }
        }
        case 'outreach/doc-edit': { try { return send(res, 200, OUT.setDoc(b.id, b.kind, b.body)); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/doc-send': { try { CONFIRM.take(b.token, `doc:${b.id}:${b.kind}`, OUT.sendContent(b.id, 'doc', String(b.kind || ''), { note: b.note })); const pdf = b.kind === 'request' ? null : await outreachPdf(b.id, b.kind); return send(res, 200, await OUT.sendDoc(b.id, b.kind, { confirmed: b.confirmed === true, pdf, note: b.note })); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/link-deal': { try { if (!deal.cur()) return send(res, 400, { error: 'No company is open in Value Creation.' }); if (b.name) { deal.S().name = String(b.name).slice(0, 80); persist(); } return send(res, 200, OUT.linkDeal(b.id, deal.cur())); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/batch': {
          const list = []; for (const x of (b.items || []).slice(0, 25)) { const s2 = SRUN[x.search] || loadSearch(x.search); const e = s2?.entities?.find(y => y.id === x.entity); if (s2 && e) list.push({ s: s2, e }); }
          return send(res, 200, await OUT.createMany(list, { model: MODELS.analysis, cwd: path.join(ROOTWS, 'outreach') }));
        }
        case 'outreach/mock-reply': {
          // Test-only (fake Gmail): an answer from them in the thread, optionally with a books file attached.
          if (process.env.AION_GMAIL_MOCK !== '1') return send(res, 404, { error: 'Not found' });
          const it = OUT.get(b.id), first = it.messages.find(m => m.threadId); if (!first) return send(res, 400, { error: 'Send first.' });
          GMAIL.fake.threads[first.threadId].push({ id: 'their' + Date.now(), from: `${it.toName || 'Owner'} <${it.to}>`, subject: `Re: ${first.subject}`, body: b.text || 'Happy to talk.', at: new Date().toISOString(), files: b.file ? [{ filename: b.file.filename, mime: 'text/csv', data: Buffer.from(b.file.data, 'base64') }] : [] });
          return send(res, 200, { changed: await OUT.syncReplies() });
        }
        case 'outreach/finish': { try { return send(res, 200, OUT.finish(b.id, b.why || 'Finished')); } catch (e) { return send(res, 400, { error: e.message }); } }
        case 'outreach/delete': { try { OUT.remove(b.id); return send(res, 200, { ok: true }); } catch (e) { return send(res, 400, { error: e.message }); } }
  }
  send(res, 404, { error: 'unknown endpoint' }); return true;
}
