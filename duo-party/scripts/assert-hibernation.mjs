import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');

assert.match(source, /static options\s*=\s*\{\s*hibernate:\s*true\s*\}/, 'GameRoom must keep WebSocket hibernation enabled');
assert.match(source, /type ConnState[^\n]+lastSeenAt\??:\s*number/, 'presence timestamps must live in connection attachments');
assert.match(source, /conn\.setState\(\{ \.\.\.conn\.state!, lastSeenAt: now \}\)/, 'heartbeats must persist lastSeenAt');
assert.doesNotMatch(source, /private (?:host|guest)LastSeenAt/, 'presence timestamps must not regress to in-memory fields');

console.log('✓ hibernation and attachment-backed presence invariants verified');
