#!/usr/bin/env python3
"""
Generate a 100-level random pool between 無我 (advanced) and 空鏡 (master).
Constraints:
- Unique solution
- Logic-solvable with techniques up to XY-Wing
- Must use XY-Wing at least once
- Not appended to levels.js; outputs mid_pool.js
"""
from __future__ import annotations

import json
import random
from collections import Counter
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

from generate_and_filter_nirvana import (
    UniqueCounterCache,
    shuffled_solution,
    dig_unique_puzzle_two_stage,
)
from nirvana_filter import logic_solve, score_trace, DEFAULT_WEIGHTS

LEVELS_PATH = Path("levels.js")
OUT_JS = Path("mid_pool.js")
OUT_REPORT = Path("output/mid_pool_report.md")

ALLOWED_TECHNIQUES = [
    "naked_single",
    "hidden_single",
    "locked_candidates",
    "naked_pair",
    "hidden_pair",
    "xy_wing",
]

TARGETS: Dict[int, int] = {
    24: 20,
    25: 20,
    26: 20,
    27: 20,
    28: 20,
}

SEED_LIST = [11, 13, 17, 19, 23]


def load_levels() -> List[dict]:
    text = LEVELS_PATH.read_text(encoding="utf-8")
    start = text.find("const levels = ")
    if start < 0:
        raise ValueError("Cannot parse levels.js")
    payload = text[start + len("const levels = ") :]
    end = payload.find("];")
    data = json.loads(payload[: end + 1])
    return data


def make_report(
    *,
    generated: List[dict],
    attempts: Dict[int, int],
    rejects: Counter,
) -> str:
    lines = ["# Mid Pool Generation Report", ""]
    lines.append(f"- Generated: **{len(generated)}**")
    lines.append("")
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
    levels = load_levels()
    existing_keys = {"".join(map(str, lv["puzzle"])) for lv in levels}
    max_id = max((lv.get("id", 0) for lv in levels), default=0)

    rngs = [random.Random(s) for s in SEED_LIST]
    unique_cache = UniqueCounterCache()
    seen_keys: set[str] = set()

    generated: List[dict] = []
    rejects: Counter = Counter()
    attempts: Dict[int, int] = {c: 0 for c in TARGETS}
    remaining: Dict[int, int] = dict(TARGETS)

    next_id = max_id + 1000

    def attempt_one(clue: int, rng: random.Random, level_id: int, display_index: int) -> dict | None:
        solution = shuffled_solution(rng)
        puzzle = dig_unique_puzzle_two_stage(
            solution=solution,
            target_clues=clue,
            rng=rng,
            unique_cache=unique_cache,
            max_restarts=4,
            probe_limit=60,
            bridge_extra=4,
            bridge_floor=30,
            backtrack_branch_limit=10,
            backtrack_node_limit=7000,
        )
        if puzzle is None:
            rejects["dig_failed"] += 1
            return None
        key = "".join(map(str, puzzle))
        if key in existing_keys:
            rejects["duplicate_existing"] += 1
            return None
        if key in seen_keys:
            rejects["duplicate_generated"] += 1
            return None
        if not unique_cache.is_unique(puzzle):
            rejects["not_unique"] += 1
            return None

        logic = logic_solve(puzzle, ALLOWED_TECHNIQUES)
        if not logic["solved"]:
            rejects["not_logic_solvable"] += 1
            return None

        score, max_tech, single_ratio, technique_counts = score_trace(
            logic["trace"], DEFAULT_WEIGHTS
        )
        if max_tech != "xy_wing":
            rejects["max_tech_not_xy"] += 1
            return None

        seen_keys.add(key)
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

    # Round-robin targets until filled
    target_list: List[Tuple[int, int]] = [(c, TARGETS[c]) for c in sorted(TARGETS)]
    target_index = 0

    while any(remaining[c] > 0 for c in remaining):
        clue, _count = target_list[target_index]
        target_index = (target_index + 1) % len(target_list)
        if remaining[clue] <= 0:
            continue

        attempts[clue] += 1
        rng = rngs[(attempts[clue] - 1) % len(rngs)]
        item = attempt_one(clue, rng, next_id, len(generated) + 1)
        if item is None:
            if attempts[clue] > 30000:
                break
            continue
        generated.append(item)
        remaining[clue] -= 1
        next_id += 1

    if len(generated) < 100:
        print(f"WARNING: only generated {len(generated)} levels.")

    OUT_JS.write_text(
        "const midPool = " + json.dumps(generated, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUT_REPORT.write_text(make_report(generated=generated, attempts=attempts, rejects=rejects), encoding="utf-8")
    print(f"Generated {len(generated)} levels -> {OUT_JS}")
    print(f"Report -> {OUT_REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
