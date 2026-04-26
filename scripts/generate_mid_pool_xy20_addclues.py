#!/usr/bin/env python3
"""
Generate 20 mid-pool levels (clues 24-32) by ADDING clues to existing XY-Wing puzzles.
Guarantees uniqueness (adding clues to a unique puzzle preserves uniqueness) and
ensures XY-Wing still appears in the logic trace.
"""
from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import List, Sequence
from collections import Counter

from nirvana_filter import logic_solve, score_trace, DEFAULT_WEIGHTS

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
TARGET_TOTAL = 20
SEED = 20260210


def load_levels(path: Path) -> List[dict]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"const\s+\w+\s*=\s*(\[[\s\S]*?\]);", text)
    if not match:
        raise ValueError(f"Cannot parse {path}")
    return json.loads(match.group(1))


def count_clues(puzzle: Sequence[int]) -> int:
    return sum(1 for v in puzzle if v != 0)


def add_clues(puzzle: List[int], solution: Sequence[int], target: int, rng: random.Random) -> List[int]:
    out = puzzle[:]
    zeros = [i for i, v in enumerate(out) if v == 0]
    rng.shuffle(zeros)
    need = target - count_clues(out)
    for idx in zeros[: max(0, need)]:
        out[idx] = solution[idx]
    return out


def make_report(generated: List[dict], attempts: int, rejects: Counter) -> str:
    lines = ["# Mid Pool XY20 Report", "", f"- Generated: **{len(generated)}**", ""]
    lines.append(f"- Attempts: **{attempts}**")
    lines.append("")
    lines.append("## Rejects")
    if rejects:
        for k, v in rejects.most_common():
            lines.append(f"- {k}: {v}")
    else:
        lines.append("- (none)")
    return "\n".join(lines)


def main() -> int:
    rng = random.Random(SEED)
    levels = load_levels(LEVELS_PATH)
    mid_pool = load_levels(MID_POOL_PATH)

    # Use existing XY-Wing verified puzzles as base
    xy_sources = [lv for lv in levels if lv.get("maxTechnique") == "xy_wing" and lv.get("solution")]
    if not xy_sources:
        raise SystemExit("No XY-Wing sources found in levels.js")

    existing_keys = {"".join(map(str, lv["puzzle"])) for lv in levels}
    existing_keys |= {"".join(map(str, lv["puzzle"])) for lv in mid_pool}

    generated: List[dict] = []
    rejects: Counter = Counter()
    attempts = 0
    max_id = max([lv.get("id", 0) for lv in levels + mid_pool], default=0)
    next_id = max_id + 1

    while len(generated) < TARGET_TOTAL and attempts < 50000:
        attempts += 1
        src = rng.choice(xy_sources)
        base_puzzle = src["puzzle"]
        solution = src["solution"]

        target_clues = rng.randint(CLUE_MIN, CLUE_MAX)
        if count_clues(base_puzzle) > target_clues:
            # if base has more clues (unlikely), skip
            rejects["base_too_dense"] += 1
            continue

        puzzle = add_clues(list(base_puzzle), solution, target_clues, rng)
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

    if len(generated) < TARGET_TOTAL:
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
