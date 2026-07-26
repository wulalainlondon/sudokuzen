#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error('Usage: node scripts/write-firebase-runtime-config.mjs <sdkconfig.json> <firebase-config.js>');
  process.exit(1);
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const source = JSON.parse(await readFile(inputPath, 'utf8'));
const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const missing = requiredKeys.filter((key) => typeof source[key] !== 'string' || source[key].length === 0);
if (missing.length > 0) {
  throw new Error(`Firebase SDK config is missing: ${missing.join(', ')}`);
}

const runtimeConfig = Object.fromEntries(requiredKeys.map((key) => [key, source[key]]));
await writeFile(
  outputPath,
  `// Generated from Firebase CLI output. This file is gitignored.\n` +
    `window.SUDOKU_FIREBASE_CONFIG = ${JSON.stringify(runtimeConfig, null, 2)};\n`,
  { mode: 0o600 },
);
console.log(`firebase_runtime_config=WRITTEN output=${outputPath} keys=${requiredKeys.join(',')}`);
