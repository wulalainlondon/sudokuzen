// Build two real releases without editing source files, then exercise first-
// install offline play and a guarded update on one browser origin.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { chromium, webkit } from 'playwright';
import { getBuildAssetGraph } from './build-asset-graph.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseArg = process.argv.find(arg => arg.startsWith('--base='))?.split('=')[1] || '/sudokuzen/';
const base = `/${baseArg.split('/').filter(Boolean).join('/')}${baseArg === '/' ? '' : '/'}`;
const browserName = process.argv.includes('--browser=webkit') ? 'webkit' : 'chromium';
const disconnectNetwork = process.argv.includes('--network=disconnect');
const legacyDist = process.argv.find(arg => arg.startsWith('--legacy-dist='))?.slice('--legacy-dist='.length);
const artifacts = path.join(root, 'output', 'pwa-offline', `${browserName}-${base === '/' ? 'root' : 'subpath'}${legacyDist ? '-legacy' : ''}`);
fs.mkdirSync(artifacts, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sudoku-pwa-upgrade-'));
const versions = ['offline-fixture-a', 'offline-fixture-b'];
if (legacyDist) versions[0] = fs.readFileSync(path.join(legacyDist, 'sw.js'), 'utf8').match(/const CACHE_VERSION = ['"]([^'"]+)/)[1];
const dataCache = fs.readFileSync(path.join(root, 'src/pwa/cachePolicy.ts'), 'utf8').match(/DATA_CACHE_NAME\s*=\s*['"]([^'"]+)['"]/)[1];
let current;
let server;
let browser;
let page;
let passed = false;
let serverOffline = false;
const requests = [];

// waitForFunction treats the Promise returned by an async predicate as truthy
// in our Playwright version. Evaluate and await each result before polling.
async function waitForBrowserState(predicate, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (!await page.evaluate(predicate)) {
    assert(Date.now() < deadline, 'Timed out waiting for browser state');
    await page.waitForTimeout(100);
  }
}

try {
  for (const version of versions) {
    const destination = path.join(temporary, version);
    if (legacyDist && version === versions[0]) {
      fs.cpSync(legacyDist, destination, { recursive: true });
      fs.writeFileSync(path.join(destination, 'firebase-config.js'), '// Isolated legacy migration fixture.\n');
      continue;
    }
    await build({
      root,
      configFile: path.join(root, 'vite.config.ts'),
      base,
      logLevel: 'error',
      build: { outDir: destination, emptyOutDir: true },
      plugins: [{
        name: 'offline-test-version',
        enforce: 'pre',
        transform(code, id) {
          if (id.split('?')[0].endsWith('/src/config/version.ts')) return `export const APP_VERSION = ${JSON.stringify(version)};`;
          // The offline fixture isolates application caching from the optional
          // live Firebase backend (and must never create real anonymous users).
          if (id.split('?')[0].endsWith('/src/firebase/client.ts')) return code.replace(
            'export async function initFirebase(): Promise<boolean> {',
            'export async function initFirebase(): Promise<boolean> { return false;',
          );
        },
        transformIndexHtml: {
          order: 'pre',
          handler: html => html.replace(/var INLINE_VER = '[^']+';/, `var INLINE_VER = '${version}';`),
        },
      }],
    });
    const graph = getBuildAssetGraph(destination);
    const worker = fs.readFileSync(path.join(root, 'src/pwa/sw.template.js'), 'utf8')
      .replaceAll('__APP_VERSION__', version)
      .replaceAll('__DATA_CACHE_NAME__', dataCache)
      .replace('/* __BUILD_ASSETS__ */ []', JSON.stringify(graph.offlineAssets));
    fs.writeFileSync(path.join(destination, 'sw.js'), worker);
    // CI creates the public config; an isolated local fixture may not have one.
    const configPath = path.join(destination, 'firebase-config.js');
    if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, '// Offline fixture disables Firebase.\n');
  }
  current = versions[0];
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };
  server = http.createServer((req, res) => {
    if (serverOffline) { req.socket.destroy(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(base)) { res.writeHead(404); res.end(); return; }
    const relative = pathname.slice(base.length) || 'index.html';
    if (relative === 'sw.js') console.log(`Worker request: ${current}`);
    const directory = path.join(temporary, current);
    const file = path.resolve(directory, relative);
    requests.push({ version: current, path: relative, url: req.url });
    if (!file.startsWith(`${directory}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    // Deliberately disable HTTP cache: success must come from the SW caches.
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}${base}`;
  browser = await (browserName === 'webkit' ? webkit : chromium).launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => localStorage.setItem('sudoku_e2e_mode', '1'));
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  page = await context.newPage();
  const errors = [];
  let navigations = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.isNavigationRequest() && request.resourceType() === 'document' && request.frame() === page.mainFrame()) navigations++;
  });
  await page.goto(url);
  await page.waitForFunction(version => document.getElementById('version-badge')?.textContent === `v${version}`, versions[0]);
  await waitForBrowserState(async () => !!navigator.serviceWorker.controller && (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
  await page.locator('#stage-map .stage-node').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(200); // Allow the version handshake after first claim.
  const firstInstallNavigations = navigations;
  if (!legacyDist) {
    assert.equal(navigations, 1, 'first install must not restart an already-current page');
    assert.equal(requests.some(request => request.path === 'levels.js' || request.path === 'style.css'), false);
  }

  const reconnect = async () => {
    if (disconnectNetwork) serverOffline = false;
    else await context.setOffline(false);
  };
  const playOffline = async (label, returnOnline = true) => {
    if (disconnectNetwork) serverOffline = true;
    else await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#stage-map .stage-node:not(.locked)').first().click();
    await page.locator('#level-list .level-item:not(.locked)').first().click();
    await page.locator('#pre-level-start-btn').click();
    await page.locator('.game-container').waitFor({ state: 'visible' });
    const cell = page.locator('#grid .cell:not(.is-fixed)').first();
    await cell.tap();
    if (await page.locator('#note-toggle').getAttribute('aria-pressed') !== 'true') await page.locator('#note-toggle').tap();
    await page.locator('.num-btn:not([disabled])').first().tap();
    assert.equal(await cell.locator('.note-num.active').count(), 1, 'offline note input must work');
    await page.screenshot({ path: path.join(artifacts, `${label}.png`) });
    await page.locator('#quit-btn').click();
    if (returnOnline) await reconnect();
  };
  if (!legacyDist) await playOffline('before-upgrade', false);
  await page.evaluate(async () => {
    await (await caches.open('unrelated-app')).put('preserved', new Response('keep'));
    localStorage.setItem('sudoku_duo_active_room_id', 'guarded-fixture');
    localStorage.setItem('sudoku_duo_active_role', 'host');
  });
  const normalReads = requests.filter(request => request.path === 'data/normal.json').length;
  current = versions[1];
  console.log(`Serving upgrade: ${current}`);
  // Deploy before restoring connectivity. Otherwise the online auto-check
  // starts against A and an immediate explicit update can join that old check.
  await reconnect();
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await waitForBrowserState(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state === 'installed');
  assert.equal(await page.locator('#version-badge').textContent(), `v${versions[0]}`, 'active Duo seat must delay activation');
  await page.evaluate(() => {
    localStorage.removeItem('sudoku_duo_active_room_id');
    localStorage.removeItem('sudoku_duo_active_role');
    window.dispatchEvent(new Event('focus'));
  });
  if (legacyDist) {
    // The already-running V2 script has a session-wide reload-once guard.
    // Verify the supported migration on the next user reload after safe activation.
    await waitForBrowserState(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return !registration?.waiting && registration?.active?.state === 'activated';
    });
    await page.reload();
  }
  await page.waitForFunction(() => document.getElementById('version-badge')?.textContent === 'voffline-fixture-b', undefined, { timeout: 30_000 });
  await page.locator('#stage-map .stage-node').first().waitFor({ state: 'visible' });
  const cacheNames = await page.evaluate(() => caches.keys());
  assert(cacheNames.includes(dataCache));
  assert(cacheNames.includes('unrelated-app'));
  if (!legacyDist) assert(!cacheNames.includes(`sudoku-zen-${versions[0]}`));
  const additionalNormalDownloadsOnUpgrade = requests.filter(request => request.path === 'data/normal.json').length - normalReads;
  if (!legacyDist) assert.equal(additionalNormalDownloadsOnUpgrade, 0, 'unchanged puzzle must not be downloaded during upgrade');
  await playOffline('after-upgrade');
  assert.deepEqual(errors, [], 'no unhandled runtime errors during offline play or upgrade');
  const result = { browser: browserName, base, networkFailure: disconnectNetwork ? 'connection-reset' : 'browser-offline', firstInstallNavigations, offlinePlayBeforeUpgrade: !legacyDist, offlinePlayAfterUpgrade: true, activationBlockedByDuoSeat: true, additionalNormalDownloadsOnUpgrade, dataCachePreserved: !legacyDist, unrelatedCachePreserved: true, noLegacyPrecache: !legacyDist, legacyMigrationFrom: legacyDist ? versions[0] : null, manualReloadForLegacyMigration: !!legacyDist };
  fs.writeFileSync(path.join(artifacts, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  passed = true;
} catch (error) {
  const state = await page?.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return {
      version: document.getElementById('version-badge')?.textContent,
      gameDisplay: document.querySelector('.game-container')?.style.display,
      seat: localStorage.getItem('sudoku_duo_active_room_id'),
      reloadOnce: sessionStorage.getItem('sudoku_reload_once'),
      worker: registration?.active?.state,
      waiting: registration?.waiting?.state,
      caches: await caches.keys(),
    };
  }).catch(() => null);
  console.error(JSON.stringify(state));
  await page?.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
  fs.writeFileSync(path.join(artifacts, 'requests.json'), JSON.stringify(requests, null, 2));
  console.error(`Offline/update verification failed: ${error.stack || error}`);
  console.error(`Fixtures retained at ${temporary}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (passed) fs.rmSync(temporary, { recursive: true, force: true });
}
