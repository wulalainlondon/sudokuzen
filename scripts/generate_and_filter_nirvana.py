#!/usr/bin/env python3
"""
Generate + filter Sudoku levels for NIRVANA with a two-stage pipeline.

Stage 1: generate a large pool of UNIQUE puzzles by clue target.
Stage 2: batch-evaluate pool with logic solver + difficulty thresholds.

Example:
  python generate_and_filter_nirvana.py \
    --input levels.js \
    --output out_nirvana_gen \
    --targets 17:3,18:4,19:5 \
    --pool-multiplier 25 \
    --min-score 35 \
    --max-single-ratio 0.65 \
    --seed 42
"""

from __future__ import annotations

import argparse
import json
import random
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Sequence, Tuple

from nirvana_filter import (
    DEFAULT_TECHNIQUES,
    DEFAULT_WEIGHTS,
    count_solutions,
    load_levels,
    logic_solve,
    score_trace,
)


class UniqueCounterCache:
    def __init__(self) -> None:
        self._cache: Dict[str, int] = {}
        self.hits = 0
        self.misses = 0

    @staticmethod
    def _key(puzzle: Sequence[int]) -> str:
        return "".join(map(str, puzzle))

    def count(self, puzzle: Sequence[int], limit: int = 2) -> int:
        key = self._key(puzzle)
        if key in self._cache:
            self.hits += 1
            return self._cache[key]
        self.misses += 1
        value = count_solutions(puzzle, limit=limit)
        self._cache[key] = value
        return value

    def is_unique(self, puzzle: Sequence[int]) -> bool:
        return self.count(puzzle, limit=2) == 1


def parse_targets(raw: str) -> Dict[int, int]:
    result: Dict[int, int] = {}
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        clue_s, count_s = part.split(":")
        clue = int(clue_s)
        count = int(count_s)
        if clue < 17 or clue > 81:
            raise ValueError(f"invalid clue target: {clue}")
        if count < 0:
            raise ValueError(f"invalid target count: {count}")
        result[clue] = count
    if not result:
        raise ValueError("targets cannot be empty")
    return result


def parse_seed_list(raw: str) -> List[int]:
    raw = raw.strip()
    if not raw:
        return []
    out = []
    for part in raw.split(","):
        part = part.strip()
        if part:
            out.append(int(part))
    return out


def flatten(grid: Sequence[Sequence[int]]) -> List[int]:
    return [v for row in grid for v in row]


def base_solution() -> List[List[int]]:
    return [[((r * 3 + r // 3 + c) % 9) + 1 for c in range(9)] for r in range(9)]


def shuffled_solution(rng: random.Random) -> List[int]:
    grid = base_solution()

    # shuffle row bands and rows in each band
    bands = [0, 1, 2]
    rng.shuffle(bands)
    row_perm: List[int] = []
    for b in bands:
        rows = [b * 3 + i for i in range(3)]
        rng.shuffle(rows)
        row_perm.extend(rows)
    grid = [grid[r] for r in row_perm]

    # shuffle col stacks and cols in each stack
    stacks = [0, 1, 2]
    rng.shuffle(stacks)
    col_perm: List[int] = []
    for s in stacks:
        cols = [s * 3 + i for i in range(3)]
        rng.shuffle(cols)
        col_perm.extend(cols)
    grid = [[row[c] for c in col_perm] for row in grid]

    # shuffle digits
    digits = list(range(1, 10))
    perm = digits[:]
    rng.shuffle(perm)
    map_digit = {d: perm[d - 1] for d in digits}
    grid = [[map_digit[v] for v in row] for row in grid]

    return flatten(grid)


def dig_backtracking(
    puzzle: List[int],
    clues: int,
    target_clues: int,
    rng: random.Random,
    unique_cache: UniqueCounterCache,
    branch_limit: int,
    probe_limit: int,
    nodes_left: List[int],
) -> List[int] | None:
    if clues == target_clues:
        return puzzle[:]
    if clues < target_clues:
        return None
    if nodes_left[0] <= 0:
        return None
    nodes_left[0] -= 1

    filled = [i for i, v in enumerate(puzzle) if v != 0]
    rng.shuffle(filled)
    removable: List[int] = []
    for idx in filled[:probe_limit]:
        saved = puzzle[idx]
        puzzle[idx] = 0
        if unique_cache.is_unique(puzzle):
            removable.append(idx)
        puzzle[idx] = saved

    if not removable:
        return None

    rng.shuffle(removable)
    for idx in removable[:branch_limit]:
        saved = puzzle[idx]
        puzzle[idx] = 0
        found = dig_backtracking(
            puzzle=puzzle,
            clues=clues - 1,
            target_clues=target_clues,
            rng=rng,
            unique_cache=unique_cache,
            branch_limit=branch_limit,
            probe_limit=probe_limit,
            nodes_left=nodes_left,
        )
        puzzle[idx] = saved
        if found is not None:
            return found
    return None


def dig_unique_puzzle_two_stage(
    solution: Sequence[int],
    target_clues: int,
    rng: random.Random,
    unique_cache: UniqueCounterCache,
    max_restarts: int = 5,
    probe_limit: int = 81,
    bridge_extra: int = 6,
    bridge_floor: int = 24,
    backtrack_branch_limit: int = 8,
    backtrack_node_limit: int = 6000,
) -> List[int] | None:
    # Two-stage digging:
    # 1) greedy down to a bridge clue count
    # 2) limited backtracking to escape local minima and reach low clues
    bridge_clues = max(target_clues + bridge_extra, bridge_floor)
    for _ in range(max_restarts):
        puzzle = list(solution)
        clues = 81
        while clues > bridge_clues:
            filled = [i for i, v in enumerate(puzzle) if v != 0]
            rng.shuffle(filled)
            removable: List[int] = []
            for idx in filled[:probe_limit]:
                saved = puzzle[idx]
                puzzle[idx] = 0
                if unique_cache.is_unique(puzzle):
                    removable.append(idx)
                puzzle[idx] = saved
            if not removable:
                break
            remove_idx = rng.choice(removable)
            puzzle[remove_idx] = 0
            clues -= 1
        if clues == target_clues:
            return puzzle[:]
        if clues > target_clues:
            nodes_left = [backtrack_node_limit]
            found = dig_backtracking(
                puzzle=puzzle,
                clues=clues,
                target_clues=target_clues,
                rng=rng,
                unique_cache=unique_cache,
                branch_limit=backtrack_branch_limit,
                probe_limit=probe_limit,
                nodes_left=nodes_left,
            )
            if found is not None:
                return found
    return None


def make_report(
    targets: Dict[int, int],
    generated: List[dict],
    stage1_attempts: Dict[int, int],
    stage1_pool_counts: Dict[int, int],
    stage2_evaluated: Dict[int, int],
    rejects: Counter,
    unique_cache: UniqueCounterCache,
) -> str:
    by_clue = Counter(item["clues"] for item in generated)
    lines = [
        "# NIRVANA Two-Stage Generation Report",
        "",
        "## Target",
    ]
    for clue in sorted(targets):
        lines.append(f"- clues {clue}: target {targets[clue]}")
    lines += ["", "## Stage 1 (unique pool)"]
    for clue in sorted(targets):
        lines.append(
            f"- clues {clue}: pool {stage1_pool_counts.get(clue, 0)} (attempts {stage1_attempts.get(clue, 0)})"
        )
    lines += ["", "## Stage 2 (logic scoring)"]
    for clue in sorted(targets):
        lines.append(f"- clues {clue}: evaluated {stage2_evaluated.get(clue, 0)}")
    lines += ["", "## Final result"]
    for clue in sorted(targets):
        lines.append(
            f"- clues {clue}: generated {by_clue[clue]} / {targets[clue]}"
        )
    lines.append(f"- total generated: {len(generated)}")
    lines += ["", "## Uniqueness cache"]
    lines.append(f"- cache size: {len(unique_cache._cache)}")
    lines.append(f"- cache hits: {unique_cache.hits}")
    lines.append(f"- cache misses: {unique_cache.misses}")
    lines += ["", "## Reject reasons"]
    if rejects:
        for reason, count in rejects.most_common():
            lines.append(f"- {reason}: {count}")
    else:
        lines.append("- (none)")
    lines.append("")
    return "\n".join(lines)


def collect_unique_pool_for_clue(
    clue: int,
    target_pool: int,
    max_attempts: int,
    rngs: List[random.Random],
    existing_keys: set[str],
    seen_keys: set[str],
    rejects: Counter,
    unique_cache: UniqueCounterCache,
    dig_restarts: int,
    dig_probe_limit: int,
    dig_bridge_extra: int,
    dig_bridge_floor: int,
    dig_backtrack_branch_limit: int,
    dig_backtrack_node_limit: int,
) -> Tuple[List[dict], int]:
    attempts = 0
    pool: List[dict] = []
    while len(pool) < target_pool and attempts < max_attempts:
        attempts += 1
        rng = rngs[(attempts - 1) % len(rngs)]
        solution = shuffled_solution(rng)
        puzzle = dig_unique_puzzle_two_stage(
            solution=solution,
            target_clues=clue,
            rng=rng,
            unique_cache=unique_cache,
            max_restarts=dig_restarts,
            probe_limit=dig_probe_limit,
            bridge_extra=dig_bridge_extra,
            bridge_floor=dig_bridge_floor,
            backtrack_branch_limit=dig_backtrack_branch_limit,
            backtrack_node_limit=dig_backtrack_node_limit,
        )
        if puzzle is None:
            rejects["stage1_dig_failed"] += 1
            continue
        key = "".join(map(str, puzzle))
        if key in existing_keys:
            rejects["stage1_duplicate_existing"] += 1
            continue
        if key in seen_keys:
            rejects["stage1_duplicate_generated"] += 1
            continue
        if not unique_cache.is_unique(puzzle):
            rejects["stage1_not_unique"] += 1
            continue
        seen_keys.add(key)
        pool.append({"clues": clue, "puzzle": puzzle, "solution": solution})
    return pool, attempts


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate + filter NIRVANA sudoku levels (two-stage).")
    parser.add_argument("--input", default="levels.js", help="Existing levels.js/json for id baseline and dedupe.")
    parser.add_argument("--output", default="out_nirvana_gen", help="Output directory.")
    parser.add_argument("--targets", default="17:3,18:4,19:5", help="Comma list like 17:3,18:4,19:5")
    parser.add_argument("--allowed-techniques", default=",".join(DEFAULT_TECHNIQUES))
    parser.add_argument("--min-score", type=int, default=35)
    parser.add_argument("--max-single-ratio", type=float, default=0.65)
    parser.add_argument("--pool-multiplier", type=int, default=25, help="Stage1 pool size = target * multiplier.")
    parser.add_argument("--pool-min-per-clue", type=int, default=30, help="Minimum stage1 pool per clue target.")
    parser.add_argument("--stage1-max-attempts-per-clue", type=int, default=120000)
    parser.add_argument("--shuffle-stage2", action="store_true", help="Shuffle stage2 evaluation order.")
    parser.add_argument("--dig-restarts", type=int, default=5, help="How many restart tries per dig attempt.")
    parser.add_argument(
        "--dig-probe-limit",
        type=int,
        default=40,
        help="How many filled cells to probe for removable checks per dig step.",
    )
    parser.add_argument("--dig-bridge-extra", type=int, default=6, help="Bridge = target + this (min by bridge-floor).")
    parser.add_argument("--dig-bridge-floor", type=int, default=24, help="Minimum bridge clue count before backtracking.")
    parser.add_argument("--dig-backtrack-branch-limit", type=int, default=8, help="Max branch width in backtracking.")
    parser.add_argument("--dig-backtrack-node-limit", type=int, default=6000, help="Max recursion nodes per dig attempt.")
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument(
        "--seed-list",
        default="",
        help="Comma-separated seeds for multi-stream generation, e.g. 11,13,17. Overrides --seed if set.",
    )
    parser.add_argument("--difficulty-name", default="NIRVANA 寂滅")
    parser.add_argument("--stars", type=int, default=5)
    args = parser.parse_args()

    seed_list = parse_seed_list(args.seed_list)
    if seed_list:
        rngs = [random.Random(s) for s in seed_list]
    else:
        rngs = [random.Random(args.seed)]
    rng = rngs[0]
    targets = parse_targets(args.targets)
    allowed = [x.strip() for x in args.allowed_techniques.split(",") if x.strip()]

    existing = load_levels(Path(args.input))
    max_id = max((lv.get("id", 0) for lv in existing), default=0)
    existing_puzzles = {
        "".join(map(str, lv.get("puzzle", [])))
        for lv in existing
        if isinstance(lv.get("puzzle"), list) and len(lv["puzzle"]) == 81
    }

    generated: List[dict] = []
    rejects: Counter = Counter()
    stage1_attempts: Dict[int, int] = defaultdict(int)
    stage1_pool_counts: Dict[int, int] = defaultdict(int)
    stage2_evaluated: Dict[int, int] = defaultdict(int)
    next_id = max_id + 1
    seen_generated_keys: set[str] = set()
    unique_pool: List[dict] = []
    unique_cache = UniqueCounterCache()

    # Stage 1: generate large unique pool for each clue target.
    for clue in sorted(targets):
        target_pool = max(args.pool_min_per_clue, targets[clue] * args.pool_multiplier)
        pool, attempts = collect_unique_pool_for_clue(
            clue=clue,
            target_pool=target_pool,
            max_attempts=args.stage1_max_attempts_per_clue,
            rngs=rngs,
            existing_keys=existing_puzzles,
            seen_keys=seen_generated_keys,
            rejects=rejects,
            unique_cache=unique_cache,
            dig_restarts=args.dig_restarts,
            dig_probe_limit=args.dig_probe_limit,
            dig_bridge_extra=args.dig_bridge_extra,
            dig_bridge_floor=args.dig_bridge_floor,
            dig_backtrack_branch_limit=args.dig_backtrack_branch_limit,
            dig_backtrack_node_limit=args.dig_backtrack_node_limit,
        )
        unique_pool.extend(pool)
        stage1_attempts[clue] = attempts
        stage1_pool_counts[clue] = len(pool)

    # Stage 2: batch score the unique pool and keep best-matching candidates.
    if args.shuffle_stage2:
        rng.shuffle(unique_pool)
    for clue in sorted(targets):
        need = targets[clue]
        clue_pool = [item for item in unique_pool if item["clues"] == clue]
        passing: List[dict] = []
        for entry in clue_pool:
            stage2_evaluated[clue] += 1
            puzzle = entry["puzzle"]
            solution = entry["solution"]

            logic = logic_solve(puzzle, allowed)
            if not logic["solved"]:
                rejects["stage2_not_logic_solvable"] += 1
                continue

            score, max_tech, single_ratio, technique_counts = score_trace(logic["trace"], DEFAULT_WEIGHTS)
            if score < args.min_score:
                rejects["stage2_low_score"] += 1
                continue
            if single_ratio > args.max_single_ratio:
                rejects["stage2_too_many_singles"] += 1
                continue

            passing.append(
                {
                    "puzzle": puzzle,
                    "solution": solution,
                    "clues": clue,
                    "difficulty_score": score,
                    "max_technique": max_tech,
                    "single_ratio": round(single_ratio, 4),
                    "technique_counts": dict(sorted(technique_counts.items())),
                }
            )

        passing.sort(
            key=lambda x: (
                -x["difficulty_score"],
                x["single_ratio"],
            )
        )
        for selected in passing[:need]:
            item = {
                "id": next_id,
                "stars": args.stars,
                "difficultyName": args.difficulty_name,
                "displayName": f"NIRVANA Auto {clue}-{sum(1 for g in generated if g['clues'] == clue) + 1}",
                **selected,
            }
            generated.append(item)
            next_id += 1
        if len(passing) > need:
            rejects["stage2_over_target_trim"] += len(passing) - need

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    gen_path = out_dir / "nirvana_generated_levels.json"
    pool_path = out_dir / "nirvana_stage1_pool.json"
    report_path = out_dir / "nirvana_generation_report.md"

    gen_path.write_text(json.dumps(generated, ensure_ascii=False, indent=2), encoding="utf-8")
    pool_path.write_text(json.dumps(unique_pool, ensure_ascii=False, indent=2), encoding="utf-8")
    report_path.write_text(
        make_report(
            targets=targets,
            generated=generated,
            stage1_attempts=stage1_attempts,
            stage1_pool_counts=stage1_pool_counts,
            stage2_evaluated=stage2_evaluated,
            rejects=rejects,
            unique_cache=unique_cache,
        ),
        encoding="utf-8",
    )

    print(f"Done. generated={len(generated)}")
    print(f"- {gen_path}")
    print(f"- {pool_path}")
    print(f"- {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
