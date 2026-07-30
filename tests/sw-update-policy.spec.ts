import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('service worker update activation policy', () => {
  it('waits for the client safety gate before skipWaiting', () => {
    const template = fs.readFileSync('src/pwa/sw.template.js', 'utf8');
    const installHandler = template.slice(
      template.indexOf("self.addEventListener('install'"),
      template.indexOf("self.addEventListener('activate'"),
    );
    const messageHandler = template.slice(template.indexOf("self.addEventListener('message'"));

    expect(installHandler).not.toContain('skipWaiting');
    expect(messageHandler).toContain("event.data.type === 'SKIP_WAITING'");
    expect(messageHandler).toContain('self.skipWaiting()');
  });
});
