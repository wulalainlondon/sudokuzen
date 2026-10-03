import { spawn } from 'node:child_process';

const qaPort = Number(process.env.DUO_QA_PORT || 8794);
const wrangler = spawn(
  process.platform === 'win32' ? 'node_modules\\.bin\\wrangler.cmd' : './node_modules/.bin/wrangler',
  [
    'dev',
    '--port',
    String(qaPort),
    '--inspector-port',
    '0',
    '--var',
    'FORFEIT_GRACE_MS:1500',
    '--var',
    'WAITING_CLOSE_GRACE_MS:1500',
    '--var',
    'AUTH_REQUIRED:false',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

let ready = false;
let settled = false;
const output = [];

function capture(chunk) {
  const text = chunk.toString();
  output.push(text);
  if (output.join('').includes(`Ready on http://localhost:${qaPort}`)) ready = true;
}

wrangler.stdout.on('data', capture);
wrangler.stderr.on('data', capture);
wrangler.once('exit', () => {
  settled = true;
});

const deadline = Date.now() + 30_000;
while (!ready && !settled && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

if (!ready) {
  wrangler.kill('SIGTERM');
  console.error(output.join(''));
  throw new Error('Timed out waiting for the local Duo worker');
}

let qaCode = 0;
for (const script of ['src/phase3-qa.mjs', 'src/round-exit-qa.mjs']) {
  const qa = spawn(process.execPath, [script, `ws://localhost:${qaPort}`], {
    stdio: 'inherit',
  });
  qaCode = await new Promise((resolve) => qa.once('exit', resolve));
  if (qaCode !== 0) break;
}
settled = true;
wrangler.kill('SIGTERM');
await new Promise((resolve) => {
  const timer = setTimeout(resolve, 2_000);
  wrangler.once('exit', () => {
    clearTimeout(timer);
    resolve();
  });
});

if (qaCode !== 0) process.exit(Number(qaCode) || 1);
