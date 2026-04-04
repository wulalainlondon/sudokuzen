#!/usr/bin/env python3
"""
Generate technique-gated duo-exclusive puzzles with candidate metadata.

Uses nirvana_filter.logic_solve for technique classification + tdoku for
unique solution verification. Each puzzle gets:
  - gv: givens count
  - cd: total candidates at start
  - ac: avg candidates per empty cell

Tier plan:
  T01: naked_single, hidden_single           (150 each)
  T02: locked_candidates, naked_pair, hidden_pair (100 each)
  T03: naked_triple, hidden_triple            (75 each)
  T04: x_wing, unique_rectangle, bug_plus_one (50 each)
  T05: skyscraper, xy_wing, xyz_wing, w_wing, empty_rectangle, ... (50 each)
  T06: swordfish, finned_swordfish, jellyfish, ... (50 each)
  T07-T12: aic, als, forcing, exocet, ...     (50 each)

Usage:
  python tool/generate_duo_puzzles.py [--count 50] [--timeout 300] [--seed 20260404]
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional

# Add tool/ to path for nirvana_filter
sys.path.insert(0, str(Path(__file__).parent))

from nirvana_filter import (
    DEFAULT_TECHNIQUES,
    count_solutions,
    logic_solve,
    score_trace,
    DEFAULT_WEIGHTS,
)

# ── Tier → technique mapping ─────────────────────────────────────────

TIER_PLAN = {
    "T01": ["naked_single", "hidden_single"],
    "T02": ["locked_candidates", "naked_pair", "hidden_pair"],
    "T03": ["naked_triple", "hidden_triple"],
    "T04": ["x_wing", "unique_rectangle", "bug_plus_one"],
    "T05": [
        "finned_x_wing", "skyscraper", "xy_wing", "xyz_wing",
        "w_wing", "remote_pairs", "two_string_kite", "empty_rectangle",
    ],
    "T06": [
        "x_cycle_simple_coloring", "swordfish", "finned_swordfish",
        "jellyfish", "finned_jellyfish", "medusa_3d",
    ],
    "T07": ["aic", "aic_mid_chain", "xy_chain"],
    "T08": ["aic_long_chain", "discontinuous_nice_loop", "grouped_aic_nice_loop"],
    "T09": ["als_xz", "als_xy", "als_chain", "als_w_wing"],
    "T10": ["cell_forcing_chain", "region_forcing_chain", "forcing_chain_net"],
    "T11": ["sue_de_coq", "template"],
    "T12": ["death_blossom", "exocet_death_blossom"],
}

# Base techniques every puzzle can use freely
BASE_TECHNIQUES = [
    "naked_single", "hidden_single", "locked_candidates",
    "naked_pair", "hidden_pair", "naked_triple", "hidden_triple",
    "naked_quad", "hidden_quad",
]

# Clue ranges per technique (basic needs more clues)
CLUE_RANGE = {
    "naked_single": (28, 40),
    "hidden_single": (26, 36),
    "locked_candidates": (22, 32),
    "naked_pair": (21, 30),
    "hidden_pair": (21, 30),
    "naked_triple": (20, 30),
    "hidden_triple": (20, 30),
}


def techniques_upto(target: str) -> List[str]:
    if target in BASE_TECHNIQUES:
        idx = BASE_TECHNIQUES.index(target)
        return BASE_TECHNIQUES[:idx + 1]
    allowed = list(BASE_TECHNIQUES)
    allowed.append(target)
    return allowed


def techniques_below(target: str) -> List[str]:
    if target in BASE_TECHNIQUES:
        idx = BASE_TECHNIQUES.index(target)
        return BASE_TECHNIQUES[:idx]
    return list(BASE_TECHNIQUES)


# ── Grid generation ──────────────────────────────────────────────────

def generate_filled_grid() -> List[int]:
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


# ── Candidate analysis ───────────────────────────────────────────────

def analyze_candidates(puzzle: List[int]) -> dict:
    total_cands = 0
    empty_cells = 0
    for i in range(81):
        if puzzle[i] != 0:
            continue
        empty_cells += 1
        r, c = divmod(i, 9)
        used = set()
        for j in range(9):
            if puzzle[r * 9 + j]: used.add(puzzle[r * 9 + j])
            if puzzle[j * 9 + c]: used.add(puzzle[j * 9 + c])
        br, bc = (r // 3) * 3, (c // 3) * 3
        for rr in range(br, br + 3):
            for cc in range(bc, bc + 3):
                if puzzle[rr * 9 + cc]: used.add(puzzle[rr * 9 + cc])
        total_cands += 9 - len(used)

    return {
        "givens": 81 - empty_cells,
        "cands": total_cands,
        "avgC": round(total_cands / empty_cells, 2) if empty_cells > 0 else 0,
    }


# ── Puzzle generation ────────────────────────────────────────────────

def make_puzzle(target: str, allowed: List[str], below: List[str],
                min_clues: int = 17, max_clues: int = 30) -> Optional[dict]:
    cr = CLUE_RANGE.get(target)
    if cr:
        min_clues, max_clues = cr

    solution = generate_filled_grid()
    indices = list(range(81))
    random.shuffle(indices)
    puzzle = solution[:]

    for idx in indices:
        if puzzle[idx] == 0:
            continue
        backup = puzzle[idx]
        puzzle[idx] = 0
        cc = sum(1 for v in puzzle if v != 0)
        if cc < min_clues:
            puzzle[idx] = backup
            continue
        if count_solutions(puzzle, 2) != 1:
            puzzle[idx] = backup

    cc = sum(1 for v in puzzle if v != 0)
    if cc > max_clues:
        return None

    # Check solvable with allowed techniques
    result = logic_solve(puzzle, allowed)
    if not result["solved"]:
        return None

    score, max_tech, single_ratio, counts = score_trace(result["trace"], DEFAULT_WEIGHTS)
    if max_tech != target:
        return None

    # Verify technique is truly required
    result_below = logic_solve(puzzle, below)
    if result_below["solved"]:
        return None

    meta = analyze_candidates(puzzle)

    return {
        "puzzle": puzzle,
        "solution": solution,
        "max_technique": target,
        "difficulty_score": int(score),
        "single_ratio": round(float(single_ratio), 4),
        "clue_count": cc,
        "givens": meta["givens"],
        "cands": meta["cands"],
        "avgC": meta["avgC"],
    }


def generate_for_technique(technique: str, count: int, timeout: int) -> List[dict]:
    allowed = techniques_upto(technique)
    below = techniques_below(technique)
    results = []
    attempts = 0
    start = time.time()
    seen = set()

    while len(results) < count:
        elapsed = time.time() - start
        if elapsed > timeout:
            print(f"  ⏱ timeout {elapsed:.0f}s — got {len(results)}/{count}")
            break
        attempts += 1
        p = make_puzzle(technique, allowed, below)
        if p:
            key = tuple(p["puzzle"])
            if key in seen:
                continue
            seen.add(key)
            results.append(p)
            if len(results) % 10 == 0 or len(results) == count:
                print(f"  ✓ {len(results)}/{count} | clues={p['clue_count']} avgC={p['avgC']} | {elapsed:.0f}s")
        if attempts % 500 == 0 and not results:
            print(f"  ... {attempts} grids, 0 found, {time.time()-start:.0f}s")

    return results


# ── Compact shard format ──────────────────────────────────────────────

def to_compact(puzzle_data: dict, tier: str, idx: int) -> dict:
    return {
        "id": -(20000 + idx),  # negative IDs for duo
        "s": 0,
        "dn": "Duo",
        "dp": f"DUO-{tier}-{idx:03d}",
        "p": puzzle_data["puzzle"],
        "sl": puzzle_data["solution"],
        "mt": puzzle_data["max_technique"],
        "tt": tier,
        "ds": puzzle_data["difficulty_score"],
        "ls": True,
        "sr": puzzle_data["single_ratio"],
        "src": "duo-gen-tdoku",
        "gv": puzzle_data["givens"],
        "cd": puzzle_data["cands"],
        "ac": puzzle_data["avgC"],
    }


# ── Main ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate duo-exclusive puzzles")
    parser.add_argument("--count", type=int, default=50, help="Puzzles per technique (default: 50)")
    parser.add_argument("--timeout", type=int, default=300, help="Timeout per technique in seconds")
    parser.add_argument("--seed", type=int, default=20260404, help="Random seed")
    parser.add_argument("--outdir", type=str, default="public/data", help="Output directory")
    parser.add_argument("--tier", type=str, default=None, help="Generate only specific tier (e.g. T01)")
    args = parser.parse_args()

    random.seed(args.seed)
    outdir = Path(args.outdir)

    tiers_to_gen = {args.tier: TIER_PLAN[args.tier]} if args.tier else TIER_PLAN
    grand_total = 0
    global_idx = 0

    for tier, techniques in tiers_to_gen.items():
        print(f"\n{'='*60}")
        print(f"TIER {tier}: {', '.join(techniques)}")
        print(f"{'='*60}")

        tier_puzzles = []
        for tech in techniques:
            if tech not in DEFAULT_TECHNIQUES:
                print(f"  ⚠ Skipping {tech}: not in solver")
                continue
            print(f"\n  → {tech} (target: {args.count})")
            results = generate_for_technique(tech, args.count, args.timeout)
            for r in results:
                global_idx += 1
                tier_puzzles.append(to_compact(r, tier, global_idx))

        # Sort by avgC ascending (easiest first)
        tier_puzzles.sort(key=lambda p: p["ac"])

        outpath = outdir / f"duo-{tier}.json"
        outpath.write_text(json.dumps(tier_puzzles), encoding="utf-8")
        size_kb = outpath.stat().st_size // 1024

        avg_gv = sum(p["gv"] for p in tier_puzzles) / len(tier_puzzles) if tier_puzzles else 0
        avg_ac = sum(p["ac"] for p in tier_puzzles) / len(tier_puzzles) if tier_puzzles else 0
        techs = {}
        for p in tier_puzzles:
            techs[p["mt"]] = techs.get(p["mt"], 0) + 1

        print(f"\n  TIER {tier}: {len(tier_puzzles)} puzzles, {size_kb}KB")
        print(f"  givens={avg_gv:.1f} avgC={avg_ac:.2f}")
        print(f"  techniques: {techs}")
        grand_total += len(tier_puzzles)

    # Update manifest
    manifest_path = outdir / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    for tier in tiers_to_gen:
        key = f"duo-{tier}"
        fp = outdir / f"duo-{tier}.json"
        if fp.exists():
            manifest["shards"][key] = {
                "file": f"duo-{tier}.json",
                "count": len(json.loads(fp.read_text())),
                "size": fp.stat().st_size,
            }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"\n{'='*60}")
    print(f"TOTAL: {grand_total} duo puzzles generated")
    print(f"{'='*60}")


if __name__ == "__main__":
    raise SystemExit(main())
