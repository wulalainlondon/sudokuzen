#!/usr/bin/env node
/**
 * Integrate generated puzzles into levels-data.json.
 * Reads generated/<technique>.json files, assigns IDs, tier names, and appends to levels.
 */
import fs from 'node:fs';
import path from 'node:path';

// Technique → teach display info (from teach-data.json)
const teachData = JSON.parse(fs.readFileSync('teach-data.json', 'utf8'));
const techToTeach = {};
for (const [key, mod] of Object.entries(teachData)) {
  techToTeach[mod.technique] = { stars: parseFloat(key), name: mod.name, tier: '' };
}

// Technique tier mapping (difficulty tiers for display)
const TECH_TIERS = {
  finned_x_wing: 'T4+ Finned X-Wing',
  skyscraper: 'T4 Skyscraper',
  remote_pairs: 'T5 Remote Pairs',
  two_string_kite: 'T5 Two-String Kite',
  empty_rectangle: 'T5 Empty Rectangle',
  bug_plus_one: 'T5 BUG+1',
  jellyfish: 'T6 Jellyfish',
  finned_jellyfish: 'T6 Finned Jellyfish',
  xy_chain: 'T6 XY-Chain',
  discontinuous_nice_loop: 'T7 Disc. Nice Loop',
  cell_forcing_chain: 'T7 Cell Forcing Chain',
  region_forcing_chain: 'T7 Region Forcing Chain',
  template: 'T8 Template',
  als_xy: 'T8 ALS-XY',
  als_w_wing: 'T8 ALS W-Wing',
  sue_de_coq: 'T9 Sue de Coq',
  death_blossom: 'T9 Death Blossom',
};

// Load existing levels
const levels = JSON.parse(fs.readFileSync('levels-data.json', 'utf8'));
const existingKeys = new Set(levels.map(l => l.puzzle.join('')));
let maxId = Math.max(...levels.map(l => l.id));

// Read generated files
const genDir = 'generated';
const files = fs.readdirSync(genDir).filter(f => f.endsWith('.json'));
let totalAdded = 0;

for (const file of files) {
  const technique = path.basename(file, '.json');
  const puzzles = JSON.parse(fs.readFileSync(path.join(genDir, file), 'utf8'));
  if (!puzzles.length) continue;

  const teach = techToTeach[technique];
  const tierName = teach?.name || technique;
  const techTier = TECH_TIERS[technique] || '';
  const stars = teach?.stars || 10;

  let added = 0;
  for (let i = 0; i < puzzles.length; i++) {
    const p = puzzles[i];
    const key = p.puzzle.join('');
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);

    maxId++;
    levels.push({
      id: maxId,
      stars,
      difficultyName: tierName,
      displayName: `${tierName}-${String(i + 1).padStart(2, '0')}`,
      puzzle: p.puzzle,
      solution: p.solution,
      maxTechnique: technique,
      techTier,
      source: 'in-house-generated',
    });
    added++;
  }

  console.log(`${technique}: +${added} levels (tier: ${tierName}, stars: ${stars})`);
  totalAdded += added;
}

// Write back
fs.writeFileSync('levels-data.json', JSON.stringify(levels, null, 2), 'utf8');
console.log(`\nTotal: +${totalAdded} levels → ${levels.length} total`);
