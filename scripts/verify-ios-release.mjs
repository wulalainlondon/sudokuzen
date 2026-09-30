import { access, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const required = [
  'ios/App/App/PrivacyInfo.xcprivacy',
  'ios/App/App/public/privacy.html',
  'ios/App/App/public/support.html',
  'ios/App/App/public/credits.html',
  'ios/App/App/public/firebase-config.js',
  'ios/App/App/public/firebase-config.local.js',
  'ios/App/App/public/firebase-sdk-manifest.json',
  'node_modules/@capacitor/ios/Capacitor/Capacitor/PrivacyInfo.xcprivacy',
  'node_modules/@capacitor/ios/CapacitorCordova/CapacitorCordova/PrivacyInfo.xcprivacy',
];

const errors = [];
for (const file of required) {
  try {
    await access(path.join(root, file));
  } catch {
    errors.push(`Missing ${file}`);
  }
}

if (errors.length) {
  console.error(`iOS release verification failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

const publicDir = path.join(root, 'ios/App/App/public');
const versionSource = await readFile(path.join(root, 'src/config/version.ts'), 'utf8');
const version = versionSource.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const bundledHtml = await readFile(path.join(publicDir, 'index.html'), 'utf8');
if (!version || !bundledHtml.includes(`var INLINE_VER = '${version}'`)) {
  errors.push('Bundled game version does not match source');
}
const sdkManifest = JSON.parse(await readFile(path.join(publicDir, 'firebase-sdk-manifest.json'), 'utf8'));
if (!Array.isArray(sdkManifest.files) || !sdkManifest.files.length || !sdkManifest.app) {
  errors.push('Firebase recovery SDK manifest is incomplete');
} else {
  for (const file of new Set([sdkManifest.app, ...sdkManifest.files])) {
    try {
      await access(path.join(publicDir, file));
    } catch {
      errors.push(`Missing bundled Firebase recovery module: ${file}`);
    }
  }
}
const bundledManifest = JSON.parse(await readFile(path.join(publicDir, 'data/manifest.json'), 'utf8'));
const sourceManifest = JSON.parse(await readFile(path.join(root, 'public/data/manifest.json'), 'utf8'));
if (bundledManifest.version !== sourceManifest.version) errors.push('Bundled puzzle manifest is stale');
for (let index = 0; index <= 12; index++) {
  const name = `duo-T${String(index).padStart(2, '0')}`;
  const meta = bundledManifest.shards[name];
  if (!meta) {
    errors.push(`Missing Duo shard metadata: ${name}`);
    continue;
  }
  try {
    const bytes = await readFile(path.join(publicDir, 'data', meta.file));
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    if (hash !== meta.hash || JSON.parse(bytes.toString('utf8')).length !== meta.count) {
      errors.push(`Bundled Duo shard does not match manifest: ${name}`);
    }
  } catch {
    errors.push(`Missing or invalid bundled Duo shard: ${name}`);
  }
}

const project = await readFile(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
const plist = await readFile(path.join(root, 'ios/App/App/Info.plist'), 'utf8');
const privacy = await readFile(path.join(root, 'ios/App/App/PrivacyInfo.xcprivacy'), 'utf8');
const firebaseRuntimeConfig = await readFile(path.join(root, 'ios/App/App/public/firebase-config.js'), 'utf8');

if (!project.includes('PRODUCT_BUNDLE_IDENTIFIER = com.wulala.sudokuzen;')) errors.push('Unexpected bundle identifier');
if (!project.includes('TARGETED_DEVICE_FAMILY = 1;')) errors.push('Release target must remain iPhone-only');
if (!project.includes('PrivacyInfo.xcprivacy in Resources')) errors.push('Privacy manifest is not in Resources');
if (!plist.includes('<key>ITSAppUsesNonExemptEncryption</key>')) errors.push('Encryption declaration missing');
if (!privacy.includes('NSPrivacyTracking')) errors.push('Privacy manifest is incomplete');
if (!firebaseRuntimeConfig.includes('window.SUDOKU_FIREBASE_CONFIG')) {
  errors.push('Firebase runtime config is not initialized');
}
for (const key of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']) {
  const pattern = new RegExp(`["']?${key}["']?\\s*:\\s*["'][^"']+["']`);
  if (!pattern.test(firebaseRuntimeConfig)) errors.push(`Firebase runtime config is missing ${key}`);
}

try {
  const xcodeVersion = execFileSync('xcodebuild', ['-version'], { encoding: 'utf8' });
  const xcodeMajor = Number(xcodeVersion.match(/Xcode\s+(\d+)/)?.[1] || 0);
  if (xcodeMajor < 26) errors.push(`Xcode 26 or later required for 2026 submission (found ${xcodeMajor || 'unknown'})`);
} catch {
  errors.push('Unable to inspect Xcode version');
}

try {
  const sdkVersion = execFileSync('xcrun', ['--sdk', 'iphoneos', '--show-sdk-version'], { encoding: 'utf8' });
  const sdkMajor = Number(sdkVersion.trim().split('.')[0] || 0);
  if (sdkMajor < 26) errors.push(`iOS 26 SDK or later required for 2026 submission (found ${sdkVersion.trim()})`);
} catch {
  errors.push('Unable to inspect iOS SDK version');
}

const icon = path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
try {
  const alpha = execFileSync('sips', ['-g', 'hasAlpha', icon], { encoding: 'utf8' });
  if (!alpha.includes('hasAlpha: no')) errors.push('App Store icon must not contain an alpha channel');
} catch {
  errors.push('Unable to inspect the App Store icon');
}

if (errors.length) {
  console.error(`iOS release verification failed:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log('iOS release assets and configuration verified.');
