#!/usr/bin/env python3
"""
Append 3 advanced tiers above NIRVANA, 40 levels each:
- stars 6: 空鏡 (XY-Wing theme)
- stars 7: 星潮 (Swordfish theme)
- stars 8: 玄鏈 (AIC theme)

Note:
Current in-repo logic solver does not implement XY-Wing/Swordfish/AIC directly.
This script uses reproducible proxy buckets:
- 空鏡: hard puzzles solved by current logic stack (high score)
- 星潮: unsolved by current logic, medium-high search complexity
- 玄鏈: unsolved by current logic, highest search complexity
"""

from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from nirvana_filter import DEFAULT_TECHNIQUES, DEFAULT_WEIGHTS, count_solutions, logic_solve, score_trace


LEVELS_PATH = Path("levels.js")
POOL_PATH = Path("external_data/puzzles2_17_clue_levels.json")


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


def solve_one_and_nodes(board: Sequence[int]) -> Tuple[Optional[List[int]], int]:
    grid = list(board)
    nodes = 0

    peers = []
    for idx in range(81):
        r, c = divmod(idx, 9)
        p = set(r * 9 + j for j in range(9)) | set(i * 9 + c for i in range(9))
        br, bc = (r // 3) * 3, (c // 3) * 3
        p |= set((br + dr) * 9 + (bc + dc) for dr in range(3) for dc in range(3))
        p.remove(idx)
        peers.append(p)

    def candidates(i: int) -> List[int]:
        used = {grid[p] for p in peers[i] if grid[p] != 0}
        return [d for d in range(1, 10) if d not in used]

    def choose_cell() -> Optional[Tuple[int, List[int]]]:
        best_i = None
        best_vals = None
        for i, v in enumerate(grid):
            if v != 0:
                continue
            vals = candidates(i)
            if len(vals) == 0:
                return i, []
            if best_i is None or len(vals) < len(best_vals):
                best_i = i
                best_vals = vals
                if len(best_vals) == 1:
                    break
        if best_i is None:
            return None
        return best_i, best_vals

    def dfs() -> bool:
        nonlocal nodes
        choice = choose_cell()
        if choice is None:
            return True
        idx, vals = choice
        if not vals:
            return False
        for d in vals:
            nodes += 1
            grid[idx] = d
            if dfs():
                return True
            grid[idx] = 0
        return False

    ok = dfs()
    if not ok:
        return None, nodes
    return grid[:], nodes


def candidate_entropy(puzzle: Sequence[int]) -> Tuple[int, int]:
    peers = []
    for idx in range(81):
        r, c = divmod(idx, 9)
        p = set(r * 9 + j for j in range(9)) | set(i * 9 + c for i in range(9))
        br, bc = (r // 3) * 3, (c // 3) * 3
        p |= set((br + dr) * 9 + (bc + dc) for dr in range(3) for dc in range(3))
        p.remove(idx)
        peers.append(p)

    total = 0
    max_c = 0
    for i, v in enumerate(puzzle):
        if v != 0:
            continue
        used = {puzzle[p] for p in peers[i] if puzzle[p] != 0}
        c = 9 - len(used)
        total += c
        if c > max_c:
            max_c = c
    return total, max_c


def annotate_proxy_fast(puzzle: Sequence[int]) -> dict:
    logic = logic_solve(puzzle, DEFAULT_TECHNIQUES)
    solved_by_logic = bool(logic["solved"])
    if solved_by_logic:
        score, max_tech, single_ratio, _ = score_trace(logic["trace"], DEFAULT_WEIGHTS)
    else:
        score, max_tech, single_ratio = 999, "unknown", 1.0

    ent_sum, ent_max = candidate_entropy(puzzle)
    return {
        "solved_by_logic": solved_by_logic,
        "difficulty_score": int(score),
        "max_technique": max_tech,
        "single_ratio": round(float(single_ratio), 4),
        "entropy_sum": int(ent_sum),
        "entropy_max": int(ent_max),
    }


def build_new_level(
    *,
    level_id: int,
    stars: int,
    difficulty_name: str,
    display_name: str,
    puzzle: List[int],
    solution: List[int],
    score: int,
    max_tech: str,
    single_ratio: float,
    proxy_tag: str,
) -> dict:
    return {
        "id": level_id,
        "stars": stars,
        "difficultyName": difficulty_name,
        "displayName": display_name,
        "puzzle": puzzle,
        "solution": solution,
        "logicSolvable": False if max_tech == "unknown" else True,
        "difficultyScore": score,
        "maxTechnique": max_tech,
        "singleRatio": single_ratio,
        "techTier": "T5 大師+" if max_tech == "unknown" else "T5 大師",
        "advancedTag": proxy_tag,
    }


def main() -> int:
    random.seed(20260204)
    levels = load_levels()
    imported = json.loads(POOL_PATH.read_text(encoding="utf-8"))

    existing_keys = {"".join(map(str, lv["puzzle"])) for lv in levels}
    max_id = max(lv["id"] for lv in levels)

    # If these stars already exist, avoid duplicate append.
    existing_stars = {lv["stars"] for lv in levels}
    if 6 in existing_stars or 7 in existing_stars or 8 in existing_stars:
        raise SystemExit("stars 6/7/8 already exist; abort to avoid duplicate tiers")

    solved_hard: List[dict] = []
    unsolved_logic: List[dict] = []
    scan_limit = 26000

    for n, row in enumerate(imported, 1):
        puzzle = row["puzzle"]
        key = "".join(map(str, puzzle))
        if key in existing_keys:
            continue

        ann = annotate_proxy_fast(puzzle)
        item = {"puzzle": puzzle, **ann}
        if ann["solved_by_logic"] and ann["difficulty_score"] >= 85:
            solved_hard.append(item)
        elif not ann["solved_by_logic"]:
            unsolved_logic.append(item)

        if len(solved_hard) >= 120 and len(unsolved_logic) >= 400:
            break
        if n >= scan_limit:
            break

    if len(solved_hard) < 40:
        raise SystemExit(f"Not enough hard solved candidates: {len(solved_hard)}")
    if len(unsolved_logic) < 80:
        raise SystemExit(f"Not enough unsolved candidates: {len(unsolved_logic)}")

    # 空鏡: solved hard, prefer high score but lower single ratio
    solved_hard.sort(key=lambda x: (-x["difficulty_score"], x["single_ratio"]))
    bucket_xy = solved_hard[:40]

    # 星潮 / 玄鏈: split unsolved by entropy proxy
    unsolved_logic.sort(key=lambda x: (x["entropy_sum"], x["entropy_max"]))
    mid_start = max(0, len(unsolved_logic) // 3)
    mid_end = min(len(unsolved_logic), mid_start + 120)
    mid_pool = unsolved_logic[mid_start:mid_end]
    high_pool = unsolved_logic[-160:]

    if len(mid_pool) < 40 or len(high_pool) < 40:
        raise SystemExit("Insufficient unsolved pools for Swordfish/AIC proxy buckets")

    random.shuffle(mid_pool)
    random.shuffle(high_pool)

    used = {"".join(map(str, x["puzzle"])) for x in bucket_xy}
    bucket_sword: List[dict] = []
    for x in mid_pool:
        k = "".join(map(str, x["puzzle"]))
        if k in used:
            continue
        used.add(k)
        bucket_sword.append(x)
        if len(bucket_sword) == 40:
            break

    bucket_aic: List[dict] = []
    for x in high_pool:
        k = "".join(map(str, x["puzzle"]))
        if k in used:
            continue
        used.add(k)
        bucket_aic.append(x)
        if len(bucket_aic) == 40:
            break

    if len(bucket_sword) < 40 or len(bucket_aic) < 40:
        raise SystemExit("Insufficient distinct Swordfish/AIC proxy candidates")

    # Compute verified unique solution + search nodes only for final 120.
    for bucket_name, bucket in (("空鏡", bucket_xy), ("星潮", bucket_sword), ("玄鏈", bucket_aic)):
        for x in bucket:
            if count_solutions(x["puzzle"], 2) != 1:
                raise SystemExit(f"{bucket_name} contains non-unique puzzle")
            solution, nodes = solve_one_and_nodes(x["puzzle"])
            if solution is None:
                raise SystemExit(f"{bucket_name} contains unsolved puzzle")
            x["solution"] = solution
            x["search_nodes"] = nodes

    new_levels: List[dict] = []
    next_id = max_id + 1

    for i, x in enumerate(bucket_xy, 1):
        new_levels.append(
            build_new_level(
                level_id=next_id,
                stars=6,
                difficulty_name="空鏡",
                display_name=f"空鏡-{i:02d}",
                puzzle=x["puzzle"],
                solution=x["solution"],
                score=x["difficulty_score"],
                max_tech=x["max_technique"],
                single_ratio=x["single_ratio"],
                proxy_tag="XY-Wing proxy",
            )
        )
        next_id += 1

    for i, x in enumerate(bucket_sword, 1):
        new_levels.append(
            build_new_level(
                level_id=next_id,
                stars=7,
                difficulty_name="星潮",
                display_name=f"星潮-{i:02d}",
                puzzle=x["puzzle"],
                solution=x["solution"],
                score=x["difficulty_score"],
                max_tech=x["max_technique"],
                single_ratio=x["single_ratio"],
                proxy_tag="Swordfish proxy",
            )
        )
        next_id += 1

    for i, x in enumerate(bucket_aic, 1):
        new_levels.append(
            build_new_level(
                level_id=next_id,
                stars=8,
                difficulty_name="玄鏈",
                display_name=f"玄鏈-{i:02d}",
                puzzle=x["puzzle"],
                solution=x["solution"],
                score=x["difficulty_score"],
                max_tech=x["max_technique"],
                single_ratio=x["single_ratio"],
                proxy_tag="AIC proxy",
            )
        )
        next_id += 1

    levels.extend(new_levels)
    write_levels(levels)

    print("Appended levels:", len(new_levels))
    print("Total levels:", len(levels))
    print("Bucket counts:", {"空鏡": 40, "星潮": 40, "玄鏈": 40})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
