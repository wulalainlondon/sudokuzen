#!/usr/bin/env node
/**
 * Patch audio.ts and zenAudio.ts to use downloaded MP3 files.
 *
 * For each sound function, if the corresponding file exists in public/sounds/,
 * the synthesis body is replaced with a simple playFile() call.
 * Functions whose files are missing are left untouched (synthesis as fallback).
 *
 * Run AFTER download-sfx.mjs:
 *   node scripts/patch-audio-to-files.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SOUNDS_DIR = path.resolve('public/sounds');

// Map: function name → file name (relative to /sounds/)
const SOUND_MAP = {
  playCellSelectSound: 'cell_select.ogg',
  playFillSound: 'fill.ogg',
  playNoteToggleSound: 'note_toggle.ogg',
  playEraseSound: 'erase.ogg',
  playUnitCompleteSound: 'unit_complete.ogg',
  playWinSound: 'win.ogg',
  playErrorFeedback: 'error.ogg',
  playZenEnter: 'zen_bell.ogg',
  playZenEncounter: 'zen_encounter.ogg',
  playZenBoss: 'zen_boss.ogg',
  playZenMentor: 'zen_mentor.ogg',
  playZenComplete: 'zen_complete.ogg',
  playZenDiscover: 'zen_discover.ogg',
};

// Volume levels per function (tuned to match synthesized loudness)
const VOLUMES = {
  playCellSelectSound: 0.55,
  playFillSound: 0.65,
  playNoteToggleSound: 0.45,
  playEraseSound: 0.50,
  playUnitCompleteSound: 0.70,
  playWinSound: 0.75,
  playErrorFeedback: 0.60,
  playZenEnter: 0.70,
  playZenEncounter: 0.55,
  playZenBoss: 0.65,
  playZenMentor: 0.50,
  playZenComplete: 0.70,
  playZenDiscover: 0.55,
};

// ── Check which files are ready ────────────────────────────────────────────

const ready = new Set();
const missing = new Set();

for (const [fn, file] of Object.entries(SOUND_MAP)) {
  if (fs.existsSync(path.join(SOUNDS_DIR, file))) {
    ready.add(fn);
  } else {
    missing.add(fn);
  }
}

console.log(`\n🎵 Patch Audio — file status`);
console.log(`   ✓ Ready:   ${ready.size}`);
console.log(`   ✗ Missing: ${missing.size}`);
if (missing.size > 0) {
  for (const fn of missing) console.log(`     · ${fn} → ${SOUND_MAP[fn]}`);
}

if (ready.size === 0) {
  console.log('\nNo files found. Run download-sfx.mjs first.');
  process.exit(0);
}

// ── Patch helper ───────────────────────────────────────────────────────────
//
// Replaces the function body (between first { and matching }) with a playFile call.
// Keeps the export keyword and signature intact.

function buildFileBody(fnName) {
  const file = SOUND_MAP[fnName];
  const vol = VOLUMES[fnName] ?? 0.6;
  return `  playFile('/sounds/${file}', ${vol});`;
}

/**
 * Given source text and a function name, replaces the body of
 * `export function fnName(...): void { ... }` with newBody.
 * Returns the patched source.
 */
function patchFunction(source, fnName, newBody) {
  // Match the function declaration line
  const declRe = new RegExp(
    `(export function ${fnName}\\([^)]*\\)[^{]*\\{)`,
    's'
  );
  const declMatch = declRe.exec(source);
  if (!declMatch) return source; // function not found

  const declEnd = declMatch.index + declMatch[0].length;

  // Find matching closing brace
  let depth = 1;
  let i = declEnd;
  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }

  const before = source.slice(0, declEnd);
  const after = source.slice(i - 1); // includes closing }
  return `${before}\n${newBody}\n${after}`;
}

// ── Patch audio.ts ─────────────────────────────────────────────────────────

const audioPath = path.resolve('src/game/audio.ts');
let audioSrc = fs.readFileSync(audioPath, 'utf8');

// Add playFile helper after the connectDryOnly block (if not already present)
const PLAY_FILE_HELPER = `
// ── File-based playback (replaces synthesis when files are present) ──────────

function playFile(src: string, volume = 0.6): void {
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

`;

if (!audioSrc.includes('function playFile(')) {
  // Insert before the first exported sound function
  const insertAt = audioSrc.indexOf('// ── Sound:');
  if (insertAt !== -1) {
    audioSrc = audioSrc.slice(0, insertAt) + PLAY_FILE_HELPER + audioSrc.slice(insertAt);
  }
}

const audioFunctions = [
  'playCellSelectSound',
  'playFillSound',
  'playNoteToggleSound',
  'playEraseSound',
  'playUnitCompleteSound',
  'playWinSound',
  'playErrorFeedback',
];

let audioPatched = 0;
for (const fn of audioFunctions) {
  if (!ready.has(fn)) continue;
  const before = audioSrc;
  audioSrc = patchFunction(audioSrc, fn, buildFileBody(fn));
  if (audioSrc !== before) {
    audioPatched++;
    console.log(`  ✓ audio.ts  :: ${fn}()`);
  } else {
    console.log(`  ? audio.ts  :: ${fn}() — function not found in source`);
  }
}

fs.writeFileSync(audioPath, audioSrc);
console.log(`\n  audio.ts: ${audioPatched} functions patched`);

// ── Patch zenAudio.ts ──────────────────────────────────────────────────────

const zenPath = path.resolve('src/game/zenAudio.ts');
let zenSrc = fs.readFileSync(zenPath, 'utf8');

// Add import for playFile or inline the helper
const ZEN_PLAY_FILE_HELPER = `
// ── File-based playback ──────────────────────────────────────────────────────

function playFile(src: string, volume = 0.6): void {
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

`;

if (!zenSrc.includes('function playFile(')) {
  // Insert before the first export function
  const insertAt = zenSrc.indexOf('// ── 1.');
  if (insertAt !== -1) {
    zenSrc = zenSrc.slice(0, insertAt) + ZEN_PLAY_FILE_HELPER + zenSrc.slice(insertAt);
  }
}

const zenFunctions = [
  'playZenEnter',
  'playZenEncounter',
  'playZenBoss',
  'playZenMentor',
  'playZenComplete',
  'playZenDiscover',
];

let zenPatched = 0;
for (const fn of zenFunctions) {
  if (!ready.has(fn)) continue;
  const before = zenSrc;
  zenSrc = patchFunction(zenSrc, fn, buildFileBody(fn));
  if (zenSrc !== before) {
    zenPatched++;
    console.log(`  ✓ zenAudio.ts :: ${fn}()`);
  } else {
    console.log(`  ? zenAudio.ts :: ${fn}() — function not found in source`);
  }
}

fs.writeFileSync(zenPath, zenSrc);
console.log(`  zenAudio.ts: ${zenPatched} functions patched`);

// ── Final summary ──────────────────────────────────────────────────────────

const total = audioPatched + zenPatched;
console.log(`\n✅ Done — ${total} functions updated to file-based playback`);

if (missing.size > 0) {
  console.log(`⚠  ${missing.size} functions still use synthesis (files not found)`);
}

console.log('\nNext: npm run build && check audio in browser');
