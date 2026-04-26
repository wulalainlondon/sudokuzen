#!/usr/bin/env python3
"""
Generate 40 X-Wing tier levels by random puzzle generation.

Strategy:
1. Generate a random filled sudoku grid
2. Remove clues one by one (random order)
3. After each removal, check: does it still have a unique solution?
4. Check: is x_wing the highest technique needed?
5. Keep puzzles where x_wing is required (not solvable without it)

Target: 20-25 clues, maxTechnique = x_wing
"""

from __future__ import annotations

import json
import random
import re
import sys
import time
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from nirvana_filter import (
    DEFAULT_TECHNIQUES,
    DEFAULT_WEIGHTS,
    count_solutions,
    logic_solve,
    score_trace,
)

LEVELS_PATH = Path("levels.js")

# Techniques up to (but not including) x_wing
TECHNIQUES_BELOW_XWING = [
    "naked_single", "hidden_single", "locked_candidates",
    "naked_pair", "hidden_pair",
]

# Techniques up to and including x_wing (no xy_wing, swordfish, aic)
TECHNIQUES_UPTO_XWING = TECHNIQUES_BELOW_XWING + ["x_wing"]


def load_levels() -> List[dict]:
    text = LEVELS_PATH.read_text(encoding="utf-8")
    match = re.search(r"const levels = (\[[\s\S]*?\]);", text)
    if not match:
        raise ValueError("Cannot parse levels.js")
    return json.loads(match.group(1))


def write_levels(levels: List[dict]) -> None:
    payload = json.dumps(levels, ensure_ascii=False, indent=2)
    out = (
        "const levels = " + payload + ";\n\n"
        "if (typeof module !== 'undefined' && module.exports) {\n"
        "  module.exports = levels;\n"
        "}\n"
    )
    LEVELS_PATH.write_text(out, encoding="utf-8")


def generate_filled_grid() -> Optional[List[int]]:
    """Generate a random complete valid sudoku grid via backtracking."""
    grid = [0] * 81
    peers = []
    for idx in range(81):
        r, c = divmod(idx, 9)
        p = set(r * 9 + j for j in range(9)) | set(i * 9 + c for i in range(9))
        br, bc = (r // 3) * 3, (c // 3) * 3
        p |= set((br + dr) * 9 + (bc + dc) for dr in range(3) for dc in range(3))
        p.remove(idx)
        peers.append(p)

    def candidates(i):
        used = {grid[p] for p in peers[i] if grid[p] != 0}
        return [d for d in range(1, 10) if d not in used]

    def fill(pos):
        if pos == 81:
            return True
        vals = candidates(pos)
        random.shuffle(vals)
        for d in vals:
            grid[pos] = d
            if fill(pos + 1):
                return True
            grid[pos] = 0
        return False

    fill(0)
    return grid if all(v != 0 for v in grid) else None


def make_xwing_puzzle(max_attempts=50) -> Optional[dict]:
    """Try to create a puzzle that requires X-Wing."""
    solution = generate_filled_grid()
    if not solution:
        return None

    puzzle = solution[:]
    indices = list(range(81))

    for attempt in range(max_attempts):
        random.shuffle(indices)
        test = puzzle[:]

        # Remove clues one at a time
        for idx in indices:
            if test[idx] == 0:
                continue
            backup = test[idx]
            test[idx] = 0

            clue_count = sum(1 for v in test if v != 0)
            if clue_count < 19:
                test[idx] = backup
                continue

            # Must have unique solution
            if count_solutions(test, 2) != 1:
                test[idx] = backup
                continue

        clue_count = sum(1 for v in test if v != 0)
        if clue_count > 28:
            continue

        # Check if solvable with x_wing as max technique
        result = logic_solve(test, TECHNIQUES_UPTO_XWING)
        if not result["solved"]:
            continue

        score, max_tech, single_ratio, counts = score_trace(result["trace"], DEFAULT_WEIGHTS)
        if max_tech != "x_wing":
            continue

        # Verify x_wing is truly required
        result_no_xw = logic_solve(test, TECHNIQUES_BELOW_XWING)
        if result_no_xw["solved"]:
            continue

        return {
            "puzzle": test,
            "solution": solution,
            "difficulty_score": int(score),
            "max_technique": "x_wing",
            "single_ratio": round(float(single_ratio), 4),
            "counts": dict(counts),
            "clue_count": clue_count,
        }

    return None


def main() -> int:
    random.seed(20260321)
    target = 40
    candidates = []
    attempts = 0
    start = time.time()

    print(f"Generating {target} X-Wing puzzles...")
    print("This may take a while.\n")

    while len(candidates) < target:
        attempts += 1
        result = make_xwing_puzzle()
        if result:
            candidates.append(result)
            elapsed = time.time() - start
            print(
                f"  ✓ #{len(candidates):02d} | "
                f"clues={result['clue_count']} score={result['difficulty_score']} "
                f"x_wing={result['counts'].get('x_wing',0)}x | "
                f"{elapsed:.0f}s elapsed, {attempts} grids tried"
            )
        if attempts % 100 == 0 and not result:
            elapsed = time.time() - start
            print(f"  ... {attempts} grids tried, {len(candidates)} found, {elapsed:.0f}s")

    elapsed = time.time() - start
    print(f"\nGeneration complete: {len(candidates)} puzzles in {elapsed:.0f}s ({attempts} grids)")

    # Sort by difficulty
    candidates.sort(key=lambda x: (x["difficulty_score"], -x["single_ratio"]))

    # Load existing levels
    levels = load_levels()
    existing_keys = {"".join(map(str, lv["puzzle"])) for lv in levels}
    max_id = max(lv["id"] for lv in levels)

    # Deduplicate
    selected = []
    for c in candidates:
        key = "".join(map(str, c["puzzle"]))
        if key not in existing_keys:
            existing_keys.add(key)
            selected.append(c)
        if len(selected) == 40:
            break

    if len(selected) < 40:
        print(f"WARNING: Only {len(selected)} unique puzzles after dedup")

    # Bump existing stars 6→7, 7→8, 8→9
    print("\nRenumbering: 空鏡 6→7, 星潮 7→8, 玄鏈 8→9")
    for lv in levels:
        if lv["stars"] == 8:
            lv["stars"] = 9
    for lv in levels:
        if lv["stars"] == 7:
            lv["stars"] = 8
    for lv in levels:
        if lv["stars"] == 6:
            lv["stars"] = 7

    # Create new levels as stars=6
    next_id = max_id + 1
    new_levels = []
    for i, x in enumerate(selected, 1):
        new_levels.append({
            "id": next_id,
            "stars": 6,
            "difficultyName": "破陣",
            "displayName": f"破陣-{i:02d}",
            "puzzle": x["puzzle"],
            "solution": x["solution"],
            "logicSolvable": True,
            "difficultyScore": x["difficulty_score"],
            "maxTechnique": "x_wing",
            "singleRatio": x["single_ratio"],
            "techTier": "T4+ X-Wing",
            "advancedTag": "X-Wing",
        })
        next_id += 1

    levels.extend(new_levels)
    write_levels(levels)

    print(f"\nDone! Added {len(new_levels)} 破陣 levels (stars=6)")
    print(f"Total levels: {len(levels)}")
    print(f"Score range: {selected[0]['difficulty_score']} ~ {selected[-1]['difficulty_score']}")
    print(f"Clue range: {min(x['clue_count'] for x in selected)} ~ {max(x['clue_count'] for x in selected)}")

    # Also need to update index.html tab count
    print("\n⚠️  Remember to add '破陣' tab in index.html (between 寂滅 and 空鏡)")
    print("    And update any stars-based logic for 10 tiers instead of 9")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
