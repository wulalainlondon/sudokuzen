#!/usr/bin/env python3
"""
Universal puzzle generator — produces N puzzles requiring a specific technique.

Usage:
  python generate_by_technique.py --technique skyscraper --count 25
  python generate_by_technique.py --technique remote_pairs --count 25 --timeout 3600
  python generate_by_technique.py --all --count 25

Output: generated_<technique>.json
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path
from typing import List, Optional

from nirvana_filter import (
    DEFAULT_TECHNIQUES,
    DEFAULT_WEIGHTS,
    count_solutions,
    logic_solve,
    score_trace,
)

# ── Technique ordering (matches teach-data.json 1-40) ────────────────

TEACH_TECHNIQUES = [
    "naked_single", "hidden_single", "locked_candidates",
    "naked_pair", "hidden_pair", "naked_triple", "hidden_triple",
    "x_wing", "finned_x_wing", "skyscraper",
    "xy_wing", "xyz_wing", "w_wing", "unique_rectangle",
    "x_cycle_simple_coloring", "swordfish", "finned_swordfish",
    "aic", "aic_mid_chain", "grouped_aic_nice_loop", "aic_long_chain",
    "als_xz", "als_chain", "forcing_chain_net", "exocet_death_blossom",
    "remote_pairs", "two_string_kite", "empty_rectangle", "bug_plus_one",
    "jellyfish", "finned_jellyfish", "xy_chain",
    "discontinuous_nice_loop", "cell_forcing_chain", "region_forcing_chain",
    "template", "als_xy", "als_w_wing", "sue_de_coq", "death_blossom",
]

# Base techniques that every puzzle can use freely
BASE_TECHNIQUES = [
    "naked_single", "hidden_single", "locked_candidates",
    "naked_pair", "hidden_pair", "naked_triple", "hidden_triple",
    "naked_quad", "hidden_quad",
]

def techniques_upto(target: str) -> List[str]:
    """Return techniques up to and including target.

    For base techniques: cumulative (naked_single only, then +hidden_single, etc.)
    For advanced techniques: all base + target only.
    """
    if target in BASE_TECHNIQUES:
        idx = BASE_TECHNIQUES.index(target)
        return BASE_TECHNIQUES[:idx + 1]
    allowed = list(BASE_TECHNIQUES)
    allowed.append(target)
    return allowed

def techniques_below(target: str) -> List[str]:
    """Return techniques strictly below target.

    For base techniques: all base techniques before it.
    For advanced techniques: all base techniques.
    """
    if target in BASE_TECHNIQUES:
        idx = BASE_TECHNIQUES.index(target)
        return BASE_TECHNIQUES[:idx]
    return list(BASE_TECHNIQUES)


# ── Grid generation ──────────────────────────────────────────────────

def generate_filled_grid() -> List[int]:
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
    return grid


# Per-technique clue range overrides (basic techniques need more clues)
CLUE_RANGE = {
    "naked_single": (28, 40),
    "hidden_single": (26, 36),
    "locked_candidates": (22, 32),
    "naked_pair": (21, 30),
    "hidden_pair": (21, 30),
    "naked_triple": (20, 30),
    "hidden_triple": (20, 30),
    "naked_quad": (19, 30),
    "hidden_quad": (19, 30),
}

def make_puzzle(target_technique: str, allowed: List[str], below: List[str],
                min_clues: int = 17, max_clues: int = 30,
                max_dig_attempts: int = 3) -> Optional[dict]:
    clue_range = CLUE_RANGE.get(target_technique)
    if clue_range:
        min_clues, max_clues = clue_range
    """Try to create a puzzle that requires target_technique."""
    solution = generate_filled_grid()
    indices = list(range(81))

    for _ in range(max_dig_attempts):
        random.shuffle(indices)
        puzzle = solution[:]

        # Remove clues one at a time
        for idx in indices:
            if puzzle[idx] == 0:
                continue
            backup = puzzle[idx]
            puzzle[idx] = 0

            clue_count = sum(1 for v in puzzle if v != 0)
            if clue_count < min_clues:
                puzzle[idx] = backup
                continue

            if count_solutions(puzzle, 2) != 1:
                puzzle[idx] = backup
                continue

        clue_count = sum(1 for v in puzzle if v != 0)
        if clue_count > max_clues:
            continue

        # Check if solvable with allowed techniques
        result = logic_solve(puzzle, allowed)
        if not result["solved"]:
            continue

        score, max_tech, single_ratio, counts = score_trace(result["trace"], DEFAULT_WEIGHTS)
        if max_tech != target_technique:
            continue

        # Verify technique is truly required (not solvable without it)
        result_below = logic_solve(puzzle, below)
        if result_below["solved"]:
            continue

        return {
            "puzzle": puzzle,
            "solution": solution,
            "difficulty_score": int(score),
            "max_technique": target_technique,
            "single_ratio": round(float(single_ratio), 4),
            "counts": dict(counts),
            "clue_count": clue_count,
        }

    return None


def generate_for_technique(technique: str, count: int, timeout: int, seed: int) -> List[dict]:
    """Generate `count` puzzles requiring `technique`."""
    random.seed(seed)
    allowed = techniques_upto(technique)
    below = techniques_below(technique)

    results = []
    attempts = 0
    start = time.time()
    seen_keys = set()

    print(f"\n{'='*60}")
    print(f"Generating {count} puzzles for: {technique}")
    print(f"Allowed techniques: {', '.join(allowed[-5:])}{'...' if len(allowed) > 5 else ''}")
    print(f"Timeout: {timeout}s")
    print(f"{'='*60}\n")

    while len(results) < count:
        elapsed = time.time() - start
        if elapsed > timeout:
            print(f"\n⏱ Timeout after {elapsed:.0f}s — got {len(results)}/{count}")
            break

        attempts += 1
        puzzle = make_puzzle(technique, allowed, below)

        if puzzle:
            key = "".join(map(str, puzzle["puzzle"]))
            if key in seen_keys:
                continue
            seen_keys.add(key)
            results.append(puzzle)
            print(
                f"  ✓ #{len(results):02d} | "
                f"clues={puzzle['clue_count']} score={puzzle['difficulty_score']} "
                f"{technique}={puzzle['counts'].get(technique, 0)}x | "
                f"{elapsed:.0f}s, {attempts} grids"
            )

        if attempts % 200 == 0 and not puzzle:
            elapsed = time.time() - start
            print(f"  ... {attempts} grids tried, {len(results)} found, {elapsed:.0f}s")

    elapsed = time.time() - start
    print(f"\nResult: {len(results)}/{count} puzzles in {elapsed:.0f}s ({attempts} grids)")
    return results


def main():
    parser = argparse.ArgumentParser(description="Generate puzzles by technique")
    parser.add_argument("--technique", type=str, help="Target technique name")
    parser.add_argument("--all", action="store_true", help="Generate for all 40 techniques")
    parser.add_argument("--missing", action="store_true", help="Generate only for techniques with 0 levels")
    parser.add_argument("--count", type=int, default=25, help="Puzzles per technique (default: 25)")
    parser.add_argument("--timeout", type=int, default=600, help="Timeout per technique in seconds (default: 600)")
    parser.add_argument("--seed", type=int, default=20260327, help="Random seed")
    parser.add_argument("--outdir", type=str, default="generated", help="Output directory")
    args = parser.parse_args()

    if not args.technique and not args.all and not args.missing:
        parser.error("Must specify --technique, --all, or --missing")

    outdir = Path(args.outdir)
    outdir.mkdir(exist_ok=True)

    # Determine which techniques to generate
    if args.technique:
        techniques = [args.technique]
    elif args.missing:
        # Find techniques with 0 levels
        levels = json.loads(Path("levels-data.json").read_text())
        existing = set()
        for lv in levels:
            if lv.get("maxTechnique"):
                existing.add(lv["maxTechnique"])
        techniques = [t for t in TEACH_TECHNIQUES if t not in existing]
        print(f"Missing techniques: {len(techniques)}")
        for t in techniques:
            print(f"  • {t}")
    else:
        techniques = list(TEACH_TECHNIQUES)

    # Generate
    summary = {}
    for tech in techniques:
        if tech not in DEFAULT_TECHNIQUES and tech not in [t for t in DEFAULT_TECHNIQUES]:
            print(f"\n⚠ Skipping {tech}: not in solver's DEFAULT_TECHNIQUES")
            continue

        results = generate_for_technique(tech, args.count, args.timeout, args.seed)

        # Sort by difficulty
        results.sort(key=lambda x: (x["difficulty_score"], -x["single_ratio"]))

        # Save
        outfile = outdir / f"{tech}.json"
        outfile.write_text(json.dumps(results, indent=2), encoding="utf-8")
        summary[tech] = len(results)
        print(f"  → Saved to {outfile}")

    # Summary
    print(f"\n{'='*60}")
    print("GENERATION SUMMARY")
    print(f"{'='*60}")
    total = 0
    for tech, count in summary.items():
        status = "✓" if count >= args.count else f"⚠ {count}/{args.count}"
        print(f"  {status} {tech}: {count} puzzles")
        total += count
    print(f"\nTotal: {total} puzzles generated")
    if any(c < args.count for c in summary.values()):
        print("⚠ Some techniques didn't reach target — may need more time or reverse seeding")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
