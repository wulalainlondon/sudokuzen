import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(new URL('.', import.meta.url).pathname, '..');
const versionPath = path.join(repoRoot, 'src', 'config', 'version.ts');
const swTemplatePath = path.join(repoRoot, 'src', 'pwa', 'sw.template.js');
const swOutPath = path.join(repoRoot, 'sw.js');

const versionSrc = fs.readFileSync(versionPath, 'utf8');
const match = versionSrc.match(/APP_VERSION\s*=\s*['\"]([^'\"]+)['\"]/);
if (!match) throw new Error('Unable to parse APP_VERSION from src/config/version.ts');
const appVersion = match[1];

const swTemplate = fs.readFileSync(swTemplatePath, 'utf8');
const swText = swTemplate.replaceAll('__APP_VERSION__', appVersion);
fs.writeFileSync(swOutPath, swText, 'utf8');

console.log(`Synced sw.js with APP_VERSION=${appVersion}`);
