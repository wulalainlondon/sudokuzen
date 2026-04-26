#!/usr/bin/env python3
"""
Build a 100-level mid pool by transforming existing mid-tier levels.
Keeps uniqueness and difficulty band while generating new puzzles.
"""
from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import List, Tuple

LEVELS_PATH = Path("levels.js")
OUT_JS = Path("mid_pool.js")
OUT_REPORT = Path("output/mid_pool_report.md")

TARGET_COUNT = 100
SOURCE_STARS = {3, 4, 5}  # 無我 / 本源 / 寂滅
SEED = 20260209


def load_levels() -> List[dict]:
    text = LEVELS_PATH.read_text(encoding="utf-8")
    match = re.search(r"const\s+levels\s*=\s*(\[[\s\S]*?\]);", text)
    if not match:
        raise ValueError("Cannot parse levels.js")
    return json.loads(match.group(1))


def apply_mapping(grid: List[int], map_digit: dict[int, int], row_perm: List[int], col_perm: List[int]) -> List[int]:
    # grid is flat 81
    out = [0] * 81
    for r in range(9):
        for c in range(9):
            val = grid[r * 9 + c]
            nr = row_perm[r]
            nc = col_perm[c]
            out[nr * 9 + nc] = map_digit.get(val, 0) if val != 0 else 0
    return out


def random_transform(rng: random.Random) -> Tuple[dict[int, int], List[int], List[int]]:
    digits = list(range(1, 10))
    rng.shuffle(digits)
    map_digit = {d: digits[d - 1] for d in range(1, 10)}

    # permute rows within bands and bands
    bands = [0, 1, 2]
    rng.shuffle(bands)
    row_perm: List[int] = []
    for b in bands:
        rows = [b * 3 + i for i in range(3)]
        rng.shuffle(rows)
        row_perm.extend(rows)

    # permute cols within stacks and stacks
    stacks = [0, 1, 2]
    rng.shuffle(stacks)
    col_perm: List[int] = []
    for s in stacks:
        cols = [s * 3 + i for i in range(3)]
        rng.shuffle(cols)
        col_perm.extend(cols)

    return map_digit, row_perm, col_perm


def main() -> int:
    rng = random.Random(SEED)
    levels = load_levels()
    existing_keys = {"".join(map(str, lv["puzzle"])) for lv in levels}
    max_id = max(lv.get("id", 0) for lv in levels)

    sources = [lv for lv in levels if lv.get("stars") in SOURCE_STARS]
    if not sources:
        raise SystemExit("No source levels found.")

    generated = []
    seen_keys = set()
    attempts = 0

    next_id = max_id + 1000
    while len(generated) < TARGET_COUNT and attempts < 20000:
        attempts += 1
        src = rng.choice(sources)
        map_digit, row_perm, col_perm = random_transform(rng)
        puzzle = apply_mapping(src["puzzle"], map_digit, row_perm, col_perm)
        solution = apply_mapping(src["solution"], map_digit, row_perm, col_perm)
        key = "".join(map(str, puzzle))
        if key in existing_keys or key in seen_keys:
            continue
        seen_keys.add(key)
        generated.append(
            {
                "id": next_id,
                "stars": 4,
                "difficultyName": "進階池",
                "displayName": f"進階池-{len(generated)+1:02d}",
                "puzzle": puzzle,
                "solution": solution,
                "logicSolvable": True,
                "difficultyScore": src.get("difficultyScore", 0),
                "maxTechnique": src.get("maxTechnique", "hidden_pair"),
                "singleRatio": src.get("singleRatio", 1.0),
                "techTier": "T4 進階+",
                "advancedTag": src.get("advancedTag", ""),
                "hidden": True,
            }
        )
        next_id += 1

    if len(generated) < TARGET_COUNT:
        print(f"WARNING: only generated {len(generated)} levels")

    OUT_JS.write_text(
        "const midPool = " + json.dumps(generated, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUT_REPORT.write_text(
        "# Mid Pool Report\n\n" +
        f"- Generated: **{len(generated)}**\n" +
        f"- Attempts: **{attempts}**\n",
        encoding="utf-8",
    )
    print(f"Generated {len(generated)} levels -> {OUT_JS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
