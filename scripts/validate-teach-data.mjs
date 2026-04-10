#!/usr/bin/env node
/**
 * Validate teach-data.json structure and content integrity.
 * Runs in CI and pre-commit to catch broken teach data before deploy.
 */
import fs from 'node:fs';

const errors = [];
const notices = [];
const strictMode = process.env.TEACH_VALIDATE_STRICT === '1';
const BASELINE_NOTICE_SET = new Set();
const warn = (msg) => errors.push(msg);
const softWarn = (msg) => notices.push(msg);

function readBaselineNotices() {
  const filePath = process.env.TEACH_VALIDATE_BASELINE_FILE;
  if (!filePath) return BASELINE_NOTICE_SET;

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const raw = Array.isArray(parsed) ? parsed : parsed?.notices;
    if (!Array.isArray(raw)) {
      throw new Error('baseline file must contain a JSON array or { notices: string[] }');
    }

    const noticesFromFile = new Set();
    for (const item of raw) {
      if (typeof item === 'string' && item.trim()) noticesFromFile.add(item);
    }
    return noticesFromFile;
  } catch (e) {
    warn(`Unable to read baseline notices from "${filePath}": ${e.message}`);
    return new Set();
  }
}

// ── 1. Parse ─────────────────────────────────────────────────────
let TD;
try {
  TD = JSON.parse(fs.readFileSync('teach-data.json', 'utf8'));
} catch (e) {
  console.error('✗ teach-data.json is not valid JSON:', e.message);
  process.exit(1);
}

// ── 2. Top-level: must have keys 1-40 ────────────────────────────
const keys = Object.keys(TD);
for (let i = 1; i <= 40; i++) {
  if (!TD[String(i)]) warn(`Missing technique key "${i}"`);
}
if (keys.length !== 40) warn(`Expected 40 keys, got ${keys.length}`);

// ── 3. Per-module validation ─────────────────────────────────────
for (const [key, mod] of Object.entries(TD)) {
  const prefix = `[${key}]`;

  // Required string fields
  for (const field of ['technique', 'name', 'subtitle']) {
    if (typeof mod[field] !== 'string' || !mod[field].trim()) {
      warn(`${prefix} missing or empty "${field}"`);
    }
  }

  // Explanation: non-empty string array
  if (!Array.isArray(mod.explanation) || mod.explanation.length === 0) {
    warn(`${prefix} "explanation" must be a non-empty array`);
  } else {
    mod.explanation.forEach((line, i) => {
      if (typeof line !== 'string') warn(`${prefix} explanation[${i}] is not a string`);
    });
  }

  // Example
  const ex = mod.example;
  if (!ex) {
    warn(`${prefix} missing "example"`);
  } else {
    if (!Array.isArray(ex.board) || ex.board.length !== 81) {
      warn(`${prefix} example.board must be 81-element array`);
    }
    if (!Array.isArray(ex.given) || ex.given.length !== 81) {
      warn(`${prefix} example.given must be 81-element array`);
    }
    if (!ex.notes || typeof ex.notes !== 'object') {
      warn(`${prefix} example.notes must be an object`);
    }
    if (!Array.isArray(ex.steps) || ex.steps.length === 0) {
      warn(`${prefix} example.steps must be a non-empty array`);
    } else {
      ex.steps.forEach((step, i) => {
        if (typeof step.text !== 'string') warn(`${prefix} step[${i}].text must be string`);
        if (!Array.isArray(step.focusCells)) warn(`${prefix} step[${i}].focusCells must be array`);
      });
    }
  }

  // Practice
  if (!Array.isArray(mod.practice) || mod.practice.length === 0) {
    warn(`${prefix} "practice" must be a non-empty array`);
  } else {
    mod.practice.forEach((p, i) => {
      const pp = `${prefix} practice[${i}]`;
      if (!Array.isArray(p.board) || p.board.length !== 81) warn(`${pp} board must be 81-element array`);
      if (!p.answer) warn(`${pp} missing answer`);
      else {
        const hasEliminates = Array.isArray(p.answer.eliminates) && p.answer.eliminates.length > 0;
        const hasFills = Array.isArray(p.answer.fills) && p.answer.fills.length > 0;
        if (!hasEliminates && !hasFills) {
          softWarn(`${pp} answer.eliminates and answer.fills are empty (practice won't be interactive)`);
        }
        if (!Array.isArray(p.answer.patternCells)) warn(`${pp} answer.patternCells must be array`);
      }
    });
  }
}

// ── 4. Report ────────────────────────────────────────────────────
if (notices.length > 0) {
  console.log(`ℹ ${notices.length} notice(s):`);
  notices.forEach((w) => console.log(`  • ${w}`));
  if (strictMode) {
    const baselineNotices = readBaselineNotices();
    const newNotices = notices.filter((notice) => !baselineNotices.has(notice));
    if (newNotices.length > 0) {
      errors.push(`Strict mode enabled: ${newNotices.length} new notice(s) must be fixed`);
      newNotices.forEach((notice) => errors.push(`New notice: ${notice}`));
    }
  }
}
if (errors.length > 0) {
  console.error(`\n✗ teach-data.json validation failed (${errors.length} errors):\n`);
  errors.forEach((e) => console.error(`  • ${e}`));
  process.exit(1);
} else {
  console.log(`✓ teach-data.json validated: ${keys.length} modules, all checks passed`);
}
