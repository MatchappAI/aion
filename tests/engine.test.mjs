// The AI helper programs never see AION's secrets, and Claude Code runs without personal MCP servers or settings.
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { childEnv, CLAUDE_LOCKDOWN } from '../lib/engine.mjs';

test('child processes get a minimal environment', () => {
  const env = childEnv({ PATH: '/usr/bin', HOME: '/Users/x', LANG: 'en_US.UTF-8', GOOGLE_CLIENT_SECRET: 's', HUNTER_API_KEY: 'h', ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', APOLLO_API_KEY: 'p', PDL_API_KEY: 'q', AION_SENDERS: 'x@y.test' });
  assert.deepEqual(Object.keys(env).sort(), ['HOME', 'LANG', 'PATH']);
});

test('Claude Code is locked down: no MCP servers, no personal settings', () => {
  assert.ok(CLAUDE_LOCKDOWN.includes('--strict-mcp-config'));
  assert.equal(CLAUDE_LOCKDOWN[CLAUDE_LOCKDOWN.indexOf('--mcp-config') + 1], '{"mcpServers":{}}');
  assert.equal(CLAUDE_LOCKDOWN[CLAUDE_LOCKDOWN.indexOf('--setting-sources') + 1], 'project');
});
