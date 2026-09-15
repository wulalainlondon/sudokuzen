// Production bundle regression: transient boot failures must recover without a document reload.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
const root = process.cwd();
const dist = path.join(root, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(dist, '.vite/manifest.json'), 'utf8'));
const sdk = Object.entries(manifest).find(([key]) => key.includes('firebase/compat/app/'))?.[1].file;
assert(sdk);
const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(dist, name === '/' ? 'index.html' : name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
fs.mkdirSync('output/firebase-recovery', { recursive: true });
const results = [];
try {
  for (const [engineName, engine] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await engine.launch();
    try {
      for (const fault of ['config', 'sdk', 'auth']) {
        const c = await browser.newContext({
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
          serviceWorkers: fault === 'config' ? 'allow' : 'block',
        });
        await c.addInitScript(() => {
          localStorage.setItem('sudoku_e2e_mode', '1');
          localStorage.setItem('sudoku_legacy_player_id', 'recovery-fixture');
        });
        let failing = true,
          blocked = 0,
          requests = 0;
        const pattern =
          fault === 'config'
            ? '**/firebase-config.js'
            : fault === 'sdk'
              ? `**/${sdk}`
              : 'https://identitytoolkit.googleapis.com/**';
        await c.route(pattern, async (route) => {
          requests++;
          if (failing) {
            blocked++;
            if (fault === 'auth')
              await route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ error: { code: 400, message: 'NETWORK_REQUEST_FAILED' } }),
              });
            else await route.abort('internetdisconnected');
          } else await route.continue();
        });
        const p = await c.newPage();
        const logs = [];
        let requestEvents = 0;
        p.on('request', (r) => {
          if (
            fault === 'config'
              ? r.url().includes('/firebase-config.js')
              : fault === 'sdk'
                ? r.url().includes(sdk)
                : r.url().includes('identitytoolkit.googleapis.com')
          )
            requestEvents++;
        });
        p.on('console', (m) => {
          if (m.type() === 'warning' || m.type() === 'error') logs.push(m.text());
        });
        await p.goto(url);
        await p.waitForFunction(() => typeof window.openDuoLobby === 'function');
        await p.locator('#stage-map .stage-node').first().waitFor({ state: 'visible' });
        await p.evaluate(() => window.openDuoLobby());
        assert(blocked > 0, `${fault} must actually fail`);
        assert.equal(await p.locator('#duo-lobby').isVisible(), false);
        const documentId = await p.evaluate(() => (window.__recoveryDocument = crypto.randomUUID()));
        const before = requestEvents;
        failing = false;
        await p.locator('#duo-entry-btn').click();
        await p.waitForFunction(
          () =>
            !document.querySelector('#duo-lobby')?.classList.contains('hidden') &&
            document.querySelector('#duo-conn-state')?.style.display === 'none',
          null,
          { timeout: 20000 },
        );
        assert.equal(
          await p.locator('#duo-lobby').isVisible(),
          true,
          `${engineName}/${fault} retry failed: ${logs.join('\n')}`,
        );
        if (fault === 'sdk')
          assert.notEqual(
            await p.evaluate(() => window.__recoveryDocument),
            documentId,
            'failed module registry needs one safe automatic refresh',
          );
        else
          assert.equal(
            await p.evaluate(() => window.__recoveryDocument),
            documentId,
            'config/auth recovery must not reload',
          );
        assert(requestEvents > before, 'retry must request the resource again, including a SW cache hit');
        await p.screenshot({ path: `output/firebase-recovery/${engineName}-${fault}.png` });
        results.push({
          engine: engineName,
          fault,
          blocked,
          requests,
          recoveredWithoutManualRestart: true,
          automaticSdkRefresh: fault === 'sdk',
        });
        console.log(JSON.stringify(results.at(-1)));
        await c.close();
      }
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync('output/firebase-recovery/result.json', JSON.stringify(results, null, 2));
} finally {
  await new Promise((r) => server.close(r));
}
