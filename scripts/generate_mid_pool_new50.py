#!/usr/bin/env python3
"""Generate 50 new mid-pool levels (unique, logic-solvable up to XY-Wing, must use XY-Wing)."""
from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Dict, List, Sequence, Tuple
from collections import Counter

from generate_and_filter_nirvana import UniqueCounterCache, shuffled_solution, dig_unique_puzzle_two_stage
from nirvana_filter import logic_solve, score_trace, DEFAULT_WEIGHTS

LEVELS_PATH = Path("levels.js")
MID_POOL_PATH = Path("mid_pool.js")
OUT_REPORT = Path("output/mid_pool_new50_report.md")

ALLOWED_TECHNIQUES = [
    "naked_single",
    "hidden_single",
    "locked_candidates",
    "naked_pair",
    "hidden_pair",
    "xy_wing",
]

TARGETS: Dict[int, int] = {
    24: 4,
    25: 4,
    26: 4,
    27: 4,
    28: 4,
}

SEED_LIST = [31, 37, 41, 43, 47]


def load_levels(path: Path) -> List[dict]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"const\s+\w+\s*=\s*(\[[\s\S]*?\]);", text)
    if not match:
        raise ValueError(f"Cannot parse {path}")
    return json.loads(match.group(1))


def make_report(generated: List[dict], attempts: Dict[int, int], rejects: Counter) -> str:
    lines = ["# Mid Pool New50 Report", "", f"- Generated: **{len(generated)}**", ""]
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
    attempts: Dict[int, int] = {c: 0 for c in TARGETS}
    remaining: Dict[int, int] = dict(TARGETS)

    max_id = max([lv.get("id", 0) for lv in levels + mid_pool], default=0)
    next_id = max_id + 1

    def attempt_one(clue: int, rng: random.Random, level_id: int, display_index: int) -> dict | None:
        solution = shuffled_solution(rng)
        puzzle = dig_unique_puzzle_two_stage(
            solution=solution,
            target_clues=clue,
            rng=rng,
            unique_cache=unique_cache,
            max_restarts=5,
            probe_limit=60,
            bridge_extra=4,
            bridge_floor=30,
            backtrack_branch_limit=10,
            backtrack_node_limit=8000,
        )
        if puzzle is None:
            rejects["dig_failed"] += 1
            return None
        key = "".join(map(str, puzzle))
        if key in existing_keys:
            rejects["duplicate_existing"] += 1
            return None
        if not unique_cache.is_unique(puzzle):
            rejects["not_unique"] += 1
            return None

        logic = logic_solve(puzzle, ALLOWED_TECHNIQUES)
        if not logic["solved"]:
            rejects["not_logic_solvable"] += 1
            return None
        score, max_tech, single_ratio, technique_counts = score_trace(logic["trace"], DEFAULT_WEIGHTS)
        if technique_counts.get("xy_wing", 0) <= 0:
            rejects["no_xy_wing"] += 1
            return None

        return {
            "id": level_id,
            "stars": 4,
            "difficultyName": "進階池",
            "displayName": f"進階池-{display_index:02d}",
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

    target_list: List[Tuple[int, int]] = [(c, TARGETS[c]) for c in sorted(TARGETS)]
    target_index = 0

    while any(remaining[c] > 0 for c in remaining):
        clue, _cnt = target_list[target_index]
        target_index = (target_index + 1) % len(target_list)
        if remaining[clue] <= 0:
            continue
        attempts[clue] += 1
        rng = rngs[(attempts[clue] - 1) % len(rngs)]
        item = attempt_one(clue, rng, next_id, len(generated) + 1)
        if item is None:
            if attempts[clue] > 25000:
                break
            continue
        generated.append(item)
        remaining[clue] -= 1
        next_id += 1

    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUT_REPORT.write_text(make_report(generated, attempts, rejects), encoding="utf-8")

    if len(generated) < 20:
        print(f"WARNING: only generated {len(generated)} levels.")
    print(f"Generated {len(generated)} new levels")

    # Replace first 50 in mid_pool
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
