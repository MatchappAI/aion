// Links the AI reports are opened by the app; they must never reach this computer or the local network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublic, readPage } from '../lib/pages.mjs';

test('public web addresses are allowed', () => {
  for (const u of ['https://example.com/', 'http://www.valueline.com/about', 'https://sub.domain.co.uk/x?y=1', 'https://8.8.8.8/']) assert.equal(isPublic(u), true, u);
});

test('this computer, private networks and odd schemes are refused', () => {
  for (const u of ['http://127.0.0.1:8811/api/state', 'http://localhost:3000/', 'http://app.localhost/', 'http://0.0.0.0/', 'http://10.1.2.3/', 'http://172.16.0.1/', 'http://172.31.255.1/', 'http://192.168.1.4/', 'http://169.254.169.254/latest/meta-data', 'http://100.64.0.1/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/', 'http://2130706433/', 'http://0x7f000001/', 'http://intranet/', 'http://printer.local/', 'file:///etc/passwd', 'javascript:alert(1)', 'ftp://example.com/', 'not a url'])
    assert.equal(isPublic(u), false, u);
});

test('readPage refuses a local address without making a request', async () => {
  const r = await readPage('http://127.0.0.1:9/api/state');
  assert.equal(r.ok, false); assert.match(r.error, /not a public web address/);
});
