#!/usr/bin/env python3
"""
Generate 20 mid-pool levels (clues 24-32) that MUST use XY-Wing and have unique solution.
Efficient strategy:
- Randomly remove clues to a count in [24, 32] (no uniqueness check during digging)
- Require logic_solve (up to XY-Wing) to succeed AND include XY-Wing
- Only then run uniqueness check
"""
from __future__ import annotations

import json
import random
import re
from collections import Counter
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

from generate_and_filter_nirvana import shuffled_solution, UniqueCounterCache
from nirvana_filter import logic_solve, score_trace, DEFAULT_WEIGHTS, count_solutions

LEVELS_PATH = Path("levels.js")
MID_POOL_PATH = Path("mid_pool.js")
OUT_REPORT = Path("output/mid_pool_xy20_report.md")

ALLOWED_TECHNIQUES = [
    "naked_single",
    "hidden_single",
    "locked_candidates",
    "naked_pair",
    "hidden_pair",
    "xy_wing",
]

CLUE_MIN = 24
CLUE_MAX = 32

SEED_LIST = [101, 103, 107, 109, 113]


def load_levels(path: Path) -> List[dict]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"const\s+\w+\s*=\s*(\[[\s\S]*?\]);", text)
    if not match:
        raise ValueError(f"Cannot parse {path}")
    return json.loads(match.group(1))


def dig_to_clues(solution: Sequence[int], target_clues: int, rng: random.Random) -> List[int]:
    puzzle = list(solution)
    indices = list(range(81))
    rng.shuffle(indices)
    remove_count = 81 - target_clues
    for idx in indices[:remove_count]:
        puzzle[idx] = 0
    return puzzle


def make_report(generated: List[dict], attempts: Dict[int, int], rejects: Counter) -> str:
    lines = ["# Mid Pool XY20 Report", "", f"- Generated: **{len(generated)}**", ""]
    lines.append("## Attempts")
    for clue in sorted(attempts):
        lines.append(f"- clues {clue}: {attempts[clue]}")
    lines.append("")
    lines.append("## Rejects")
    if rejects:
        for k, v in rejects.most_common():
            lines.append(f"- {k}: {v}")
    else:
        lines.append("- (none)")
    return "\n".join(lines)


def main() -> int:
    random.seed(20260209)
    levels = load_levels(LEVELS_PATH)
    mid_pool = load_levels(MID_POOL_PATH)

    existing_keys = {"".join(map(str, lv["puzzle"])) for lv in levels}
    existing_keys |= {"".join(map(str, lv["puzzle"])) for lv in mid_pool}

    rngs = [random.Random(s) for s in SEED_LIST]
    unique_cache = UniqueCounterCache()

    generated: List[dict] = []
    rejects: Counter = Counter()
    attempts: Dict[int, int] = {c: 0 for c in range(CLUE_MIN, CLUE_MAX + 1)}

    max_id = max([lv.get("id", 0) for lv in levels + mid_pool], default=0)
    next_id = max_id + 1

    target_total = 20
    total_attempts = 0

    while len(generated) < target_total and total_attempts < 200000:
        clue = rngs[0].randint(CLUE_MIN, CLUE_MAX)
        attempts[clue] += 1
        total_attempts += 1
        rng = rngs[(attempts[clue] - 1) % len(rngs)]

        solution = shuffled_solution(rng)
        puzzle = dig_to_clues(solution, clue, rng)
        key = "".join(map(str, puzzle))
        if key in existing_keys:
            rejects["duplicate_existing"] += 1
            continue

        logic = logic_solve(puzzle, ALLOWED_TECHNIQUES)
        if not logic["solved"]:
            rejects["not_logic_solvable"] += 1
            continue

        score, max_tech, single_ratio, technique_counts = score_trace(logic["trace"], DEFAULT_WEIGHTS)
        if technique_counts.get("xy_wing", 0) <= 0:
            rejects["no_xy_wing"] += 1
            continue

        if not unique_cache.is_unique(puzzle):
            rejects["not_unique"] += 1
            continue

        generated.append(
            {
                "id": next_id,
                "stars": 4,
                "difficultyName": "進階池",
                "displayName": f"進階池-{len(generated)+1:02d}",
                "puzzle": puzzle,
                "solution": solution,
                "logicSolvable": True,
                "difficultyScore": int(score),
                "maxTechnique": max_tech,
                "singleRatio": round(float(single_ratio), 4),
                "techTier": "T4 進階+",
                "advancedTag": "XY-Wing verified",
                "hidden": True,
            }
        )
        next_id += 1
        existing_keys.add(key)

    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUT_REPORT.write_text(make_report(generated, attempts, rejects), encoding="utf-8")

    if len(generated) < 20:
        print(f"WARNING: only generated {len(generated)} levels.")
    else:
        print("Generated 20 levels.")

    if len(mid_pool) < 20:
        raise SystemExit("mid_pool has fewer than 20 levels")
    updated = generated + mid_pool[20:]
    MID_POOL_PATH.write_text(
        "const midPool = " + json.dumps(updated, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Updated {MID_POOL_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
