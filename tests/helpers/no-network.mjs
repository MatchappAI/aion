// Loaded with `node --import` for test servers: any request that leaves this computer fails, so a test can never
// reach Gmail, Hunter.io, web search or an AI service by mistake. Only 127.0.0.1 / localhost is allowed.
const real = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = new URL(typeof url === 'string' ? url : url.url || String(url));
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw new Error(`Network blocked in tests: ${u.hostname}`);
  return real(url, opts);
};
