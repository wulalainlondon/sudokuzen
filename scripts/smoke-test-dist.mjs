/**
 * Smoke test: serves dist/ locally and verifies the app boots without
 * freezing the main thread. Catches infinite loops, missing assets,
 * and fatal JS errors that only manifest in production builds.
 *
 * Usage: node scripts/smoke-test-dist.mjs [--base /sudokuzen/]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');
const baseArg = process.argv.find(a => a.startsWith('--base='));
const basePath = baseArg ? baseArg.split('=')[1].replace(/\/$/, '') : '';

// ── Minimal static file server ──────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (basePath && urlPath.startsWith(basePath)) urlPath = urlPath.slice(basePath.length) || '/';
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(distDir, urlPath.split('?')[0]);
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

async function run() {
  if (!fs.existsSync(distDir)) {
    console.error('ERROR: dist/ not found. Run "npm run build" first.');
    process.exit(1);
  }

  // Dynamic import playwright (may not be installed in all envs)
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('SKIP: playwright not installed, skipping smoke test.');
    process.exit(0);
  }

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}${basePath}/`;
  console.log(`Serving dist/ at ${url}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  try {
    await page.goto(url, { waitUntil: 'commit', timeout: 15000 });
    // Wait for boot + async level screen render
    await new Promise(r => setTimeout(r, 6000));

    // Verify main thread is responsive via CDP
    const client = await context.newCDPSession(page);
    const result = await Promise.race([
      client.send('Runtime.evaluate', {
        expression: 'document.getElementById("version-badge")?.textContent || "NO_BADGE"',
        timeout: 5000,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Main thread blocked — possible infinite loop')), 5000)),
    ]);

    const badge = result.result?.value;
    if (!badge || badge === 'NO_BADGE' || badge === 'v--') {
      throw new Error(`App did not boot. version-badge = "${badge}"`);
    }

    if (errors.length > 0) {
      const fatal = errors.filter(e => !e.includes('Firebase') && !e.includes('SW init'));
      if (fatal.length > 0) {
        throw new Error(`Fatal JS errors:\n${fatal.join('\n')}`);
      }
    }

    console.log(`✅ Smoke test passed (${badge})`);
  } catch (err) {
    console.error(`❌ Smoke test FAILED: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
    server.close();
  }
}

run();
