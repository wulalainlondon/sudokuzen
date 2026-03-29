# Commercial Content Policy (Sudoku)

## Goal
Build a commercial Sudoku catalog with minimal licensing/copyright risk.

## Allowed
1. In-house generated puzzles only (generated inside this repository).
2. In-house metadata/scoring produced by our own scripts.
3. Third-party code only when license is permissive (e.g., BSD/MIT/Apache) and with attribution retained.

## Not Allowed (for production content)
1. Any puzzle dataset imported from third-party repositories/websites/forums, unless explicit commercial redistribution rights are documented.
2. GPL/LGPL repositories as direct production dependency for closed-source distribution path.
3. Unclear-source puzzle bundles (unknown provenance/terms).

## Current License Check (2026-03-22)
- PseudoFish/Hodoku: GPL-3.0 (NOT for production dependency in this path)
- SudokuMonster/SukakuExplainer: LGPL-2.1 (avoid for zero-doubt path)
- denis-berthier/CSP-Rules-Examples: GPL-3.0 (avoid)
- t-dillon/tdoku: BSD-2-Clause (code permissive; dataset provenance still must be checked)

## Operational Rules
1. For 8.75★~10★ generation, do not use `external_data/` as source pool.
2. Every shipped level must include provenance tag: `source: "in-house-generated"`.
3. Every shipped level must pass:
   - unique solution
   - reproducible generation seed/log
   - difficulty classification from in-house solver pipeline

## Notes
This file is an engineering policy, not legal advice.
