#!/usr/bin/env python3
"""
Generate practice puzzles for the technique teaching system.
For each of 12 techniques (Stars 3-8.5), generates 3 bottleneck practice puzzles.

Usage:
  python generate_practice_puzzles.py

Output:
  practice_puzzles.json
"""

from __future__ import annotations

import json
import random
import re
import sys
import time
from itertools import combinations
from typing import Dict, List, Optional, Set, Tuple

from nirvana_filter import (
    DEFAULT_TECHNIQUES,
    DEFAULT_WEIGHTS,
    TECHNIQUE_FUNCS,
    ROWS, COLS, BOXES, UNITS, PEERS, DIGITS,
    initial_candidates, logic_solve, count_solutions, is_solved,
    clone_state, cell_to_rc, rc_to_cell,
    score_trace, Step,
)

# ─── Configuration ─────────────────────────────────────────

PUZZLES_PER_TECHNIQUE = 3
MAX_ATTEMPTS = 3000

STARS_TECHNIQUES = [
    (3,   'naked_triple'),
    (3.5, 'hidden_triple'),
    (4,   'naked_quad'),
    (4.5, 'hidden_quad'),
    (5,   'x_wing'),
    (5.5, 'skyscraper'),
    (6,   'unique_rectangle'),
    (6.5, 'swordfish'),
    (7,   'xy_wing'),
    (7.5, 'xyz_wing'),
    (8,   'finned_x_wing'),
    (8.5, 'aic'),
]

TECHNIQUE_DISPLAY = {
    'naked_triple': '編織 · Naked Triple',
    'hidden_triple': '隱流 · Hidden Triple',
    'naked_quad': '天望 · Naked Quad',
    'hidden_quad': '法印 · Hidden Quad',
    'x_wing': '破陣 · X-Wing',
    'skyscraper': '鋒刃 · Skyscraper',
    'unique_rectangle': '空鏡 · Unique Rectangle',
    'swordfish': '三翼 · Swordfish',
    'xy_wing': '星潮 · XY-Wing',
    'xyz_wing': '荊棘 · XYZ-Wing',
    'finned_x_wing': '深淵 · Finned X-Wing',
    'aic': '玄鏈 · AIC',
}


def get_below_techniques(technique: str) -> List[str]:
    idx = DEFAULT_TECHNIQUES.index(technique)
    return DEFAULT_TECHNIQUES[:idx]


# ─── Grid Generation ───────────────────────────────────────

def generate_filled_grid() -> Optional[List[int]]:
    grid = [0] * 81
    _peers = []
    for idx in range(81):
        r, c = divmod(idx, 9)
        p = set(r * 9 + j for j in range(9)) | set(i * 9 + c for i in range(9))
        br, bc = (r // 3) * 3, (c // 3) * 3
        p |= set((br + dr) * 9 + (bc + dc) for dr in range(3) for dc in range(3))
        p.remove(idx)
        _peers.append(p)

    def cands(i):
        used = {grid[p] for p in _peers[i] if grid[p] != 0}
        return [d for d in range(1, 10) if d not in used]

    def fill(pos):
        if pos == 81:
            return True
        vals = cands(pos)
        random.shuffle(vals)
        for d in vals:
            grid[pos] = d
            if fill(pos + 1):
                return True
            grid[pos] = 0
        return False

    fill(0)
    return grid if all(v != 0 for v in grid) else None


# ─── Solving Helpers ───────────────────────────────────────

def solve_with(board: List[int], cands: List[Set[int]], techniques: List[str]) -> bool:
    funcs = [TECHNIQUE_FUNCS[t] for t in techniques]
    for _ in range(5000):
        if is_solved(board):
            break
        progressed = False
        for fn in funcs:
            ok, changed = fn(board, cands, [])
            if not ok:
                return False
            if changed:
                progressed = True
                break
        if not progressed:
            break
    return True


def try_technique_once(board, cands, technique):
    b2, c2 = clone_state(board, cands)
    trace: List[Step] = []
    fn = TECHNIQUE_FUNCS[technique]
    ok, changed = fn(b2, c2, trace)

    if not ok or not changed:
        return None

    eliminates = []
    for i in range(81):
        if board[i] != 0:
            continue
        removed = cands[i] - c2[i]
        for d in sorted(removed):
            eliminates.append({"cell": i, "digit": d})

    if not eliminates:
        return None

    detail = trace[0].detail if trace else ""
    pattern = find_pattern_cells(board, cands, technique, eliminates, detail)
    desc = build_description(technique, detail, eliminates)

    return {
        "eliminates": eliminates,
        "patternCells": pattern,
        "description": desc,
    }


# ─── Pattern Detection ────────────────────────────────────

def find_pattern_cells(board, cands, technique, eliminates, detail):
    elim_cells = {e["cell"] for e in eliminates}

    if technique == "naked_triple":
        return _find_naked_subset(board, cands, 3, elim_cells)
    if technique == "naked_quad":
        return _find_naked_subset(board, cands, 4, elim_cells)
    if technique == "hidden_triple":
        return _find_hidden_subset(board, cands, 3, elim_cells)
    if technique == "hidden_quad":
        return _find_hidden_subset(board, cands, 4, elim_cells)
    if technique == "x_wing":
        return _parse_xwing(detail)
    if technique == "skyscraper":
        return _find_skyscraper(board, cands, detail)
    if technique == "unique_rectangle":
        return _find_ur(board, cands, detail)
    if technique == "swordfish":
        return _parse_swordfish(detail)
    if technique == "xy_wing":
        return _parse_xy_wing(detail)
    if technique == "xyz_wing":
        return _find_xyz_wing(board, cands, detail)
    if technique == "finned_x_wing":
        return _find_finned_xw(board, cands, detail)
    if technique == "aic":
        return _parse_aic(detail)
    return []


def _find_naked_subset(board, cands, size, elim_cells):
    for unit in UNITS:
        unsolved = [i for i in unit if board[i] == 0 and 2 <= len(cands[i]) <= size]
        for combo in combinations(unsolved, size):
            union = set()
            for i in combo:
                union |= cands[i]
            if len(union) == size and elim_cells & (set(unit) - set(combo)):
                return list(combo)
    return []


def _find_hidden_subset(board, cands, size, elim_cells):
    for unit in UNITS:
        pbd = {}
        for d in range(1, 10):
            pbd[d] = [i for i in unit if board[i] == 0 and d in cands[i]]
        for digits in combinations(range(1, 10), size):
            up = set()
            for d in digits:
                up |= set(pbd[d])
            if len(up) == size and all(pbd[d] for d in digits) and elim_cells & up:
                return sorted(up)
    return []


def _parse_xwing(detail):
    m = re.match(r'd(\d) rows (\d),(\d) cols (\d),(\d)', detail)
    if m:
        r1, r2, c1, c2 = int(m[2])-1, int(m[3])-1, int(m[4])-1, int(m[5])-1
        return [rc_to_cell(r1,c1), rc_to_cell(r1,c2), rc_to_cell(r2,c1), rc_to_cell(r2,c2)]
    m = re.match(r'd(\d) cols (\d),(\d) rows (\d),(\d)', detail)
    if m:
        c1, c2, r1, r2 = int(m[2])-1, int(m[3])-1, int(m[4])-1, int(m[5])-1
        return [rc_to_cell(r1,c1), rc_to_cell(r1,c2), rc_to_cell(r2,c1), rc_to_cell(r2,c2)]
    return []


def _find_skyscraper(board, cands, detail):
    m = re.match(r'd(\d) rows (\d),(\d)', detail)
    if m:
        d, r1, r2 = int(m[1]), int(m[2])-1, int(m[3])-1
        cells = []
        for c in range(9):
            i = rc_to_cell(r1, c)
            if board[i] == 0 and d in cands[i]:
                cells.append(i)
        for c in range(9):
            i = rc_to_cell(r2, c)
            if board[i] == 0 and d in cands[i]:
                cells.append(i)
        return cells
    m = re.match(r'd(\d) cols (\d),(\d)', detail)
    if m:
        d, c1, c2 = int(m[1]), int(m[2])-1, int(m[3])-1
        cells = []
        for r in range(9):
            i = rc_to_cell(r, c1)
            if board[i] == 0 and d in cands[i]:
                cells.append(i)
        for r in range(9):
            i = rc_to_cell(r, c2)
            if board[i] == 0 and d in cands[i]:
                cells.append(i)
        return cells
    return []


def _find_ur(board, cands, detail):
    m = re.match(r'UR type1 at r(\d)c(\d)', detail)
    if not m:
        return []
    r4, c4 = int(m[1])-1, int(m[2])-1
    extra = rc_to_cell(r4, c4)
    for ro in range(9):
        if ro == r4:
            continue
        for co in range(9):
            if co == c4:
                continue
            cells = [rc_to_cell(r4,c4), rc_to_cell(r4,co), rc_to_cell(ro,c4), rc_to_cell(ro,co)]
            if any(board[c] != 0 for c in cells):
                continue
            bv = [c for c in cells if len(cands[c]) == 2]
            ex = [c for c in cells if len(cands[c]) > 2]
            if len(bv) == 3 and len(ex) == 1 and ex[0] == extra:
                pair = cands[bv[0]]
                if all(cands[c] == pair for c in bv[1:]) and pair.issubset(cands[extra]):
                    return cells
    return []


def _parse_swordfish(detail):
    m = re.match(r'd(\d) rows (\d),(\d),(\d) cols ([\d,]+)', detail)
    if m:
        rows = [int(m[2])-1, int(m[3])-1, int(m[4])-1]
        cols = [int(c)-1 for c in m[5].split(',')]
        return [rc_to_cell(r,c) for r in rows for c in cols]
    m = re.match(r'd(\d) cols (\d),(\d),(\d) rows ([\d,]+)', detail)
    if m:
        cols = [int(m[2])-1, int(m[3])-1, int(m[4])-1]
        rows = [int(r)-1 for r in m[5].split(',')]
        return [rc_to_cell(r,c) for r in rows for c in cols]
    return []


def _parse_xy_wing(detail):
    m = re.match(r'pivot r(\d)c(\d), wings r(\d)c(\d)/r(\d)c(\d)', detail)
    if m:
        return [
            rc_to_cell(int(m[1])-1, int(m[2])-1),
            rc_to_cell(int(m[3])-1, int(m[4])-1),
            rc_to_cell(int(m[5])-1, int(m[6])-1),
        ]
    return []


def _find_xyz_wing(board, cands, detail):
    m = re.match(r'pivot r(\d)c(\d) z=(\d)', detail)
    if not m:
        return []
    pivot = rc_to_cell(int(m[1])-1, int(m[2])-1)
    z = int(m[3])
    if len(cands[pivot]) != 3:
        return [pivot]
    wings = [p for p in PEERS[pivot]
             if board[p] == 0 and len(cands[p]) == 2 and cands[p].issubset(cands[pivot])]
    for w1, w2 in combinations(wings, 2):
        if cands[w1] == cands[w2]:
            continue
        if cands[w1] | cands[w2] != cands[pivot]:
            continue
        zz = cands[w1] & cands[w2]
        if len(zz) == 1 and next(iter(zz)) == z:
            return [pivot, w1, w2]
    return [pivot]


def _find_finned_xw(board, cands, detail):
    m = re.match(r'd(\d) rows (\d),(\d) fin c(\d)', detail)
    if m:
        d, r1, r2 = int(m[1]), int(m[2])-1, int(m[3])-1
        cells = []
        for c in range(9):
            for r in (r1, r2):
                i = rc_to_cell(r, c)
                if board[i] == 0 and d in cands[i]:
                    cells.append(i)
        return cells
    m = re.match(r'd(\d) cols (\d),(\d) fin r(\d)', detail)
    if m:
        d, c1, c2 = int(m[1]), int(m[2])-1, int(m[3])-1
        cells = []
        for r in range(9):
            for c in (c1, c2):
                i = rc_to_cell(r, c)
                if board[i] == 0 and d in cands[i]:
                    cells.append(i)
        return cells
    return []


def _parse_aic(detail):
    m = re.match(r'forcing contradiction at r(\d)c(\d)', detail)
    if m:
        return [rc_to_cell(int(m[1])-1, int(m[2])-1)]
    return []


# ─── Description Builder ──────────────────────────────────

def build_description(technique, detail, eliminates):
    n = len(eliminates)
    digits_set = sorted(set(e["digit"] for e in eliminates))
    digits_str = ",".join(str(d) for d in digits_set)

    if technique == "x_wing":
        m = re.match(r'd(\d) rows (\d),(\d) cols (\d),(\d)', detail)
        if m:
            return f"X-Wing：數字 {m[1]} 在 R{m[2]}、R{m[3]} 各只出現在 C{m[4]}、C{m[5]}，消去 {n} 個候選數"
        m = re.match(r'd(\d) cols (\d),(\d) rows (\d),(\d)', detail)
        if m:
            return f"X-Wing：數字 {m[1]} 在 C{m[2]}、C{m[3]} 各只出現在 R{m[4]}、R{m[5]}，消去 {n} 個候選數"

    if technique == "skyscraper":
        m = re.match(r'd(\d) rows (\d),(\d)', detail)
        if m:
            return f"Skyscraper：數字 {m[1]} 在 R{m[2]}、R{m[3]} 形成摩天樓，消去 {n} 個候選數"
        m = re.match(r'd(\d) cols (\d),(\d)', detail)
        if m:
            return f"Skyscraper：數字 {m[1]} 在 C{m[2]}、C{m[3]} 形成摩天樓，消去 {n} 個候選數"

    if technique == "unique_rectangle":
        return f"Unique Rectangle Type 1：消去 {n} 個候選數"

    if technique == "swordfish":
        m = re.match(r'd(\d) rows (\d),(\d),(\d)', detail)
        if m:
            return f"Swordfish：數字 {m[1]} 在 R{m[2]}、R{m[3]}、R{m[4]} 形成劍魚，消去 {n} 個候選數"
        m = re.match(r'd(\d) cols (\d),(\d),(\d)', detail)
        if m:
            return f"Swordfish：數字 {m[1]} 在 C{m[2]}、C{m[3]}、C{m[4]} 形成劍魚，消去 {n} 個候選數"

    if technique == "xy_wing":
        m = re.match(r'pivot r(\d)c(\d), wings r(\d)c(\d)/r(\d)c(\d), z=(\d)', detail)
        if m:
            return f"XY-Wing：樞紐 R{m[1]}C{m[2]}，翼 R{m[3]}C{m[4]}、R{m[5]}C{m[6]}，消去數字 {m[7]}"

    if technique == "xyz_wing":
        m = re.match(r'pivot r(\d)c(\d) z=(\d)', detail)
        if m:
            return f"XYZ-Wing：樞紐 R{m[1]}C{m[2]}，消去數字 {m[3]}"

    if technique == "finned_x_wing":
        return f"Finned X-Wing：帶鰭 X-Wing，消去 {n} 個候選數"

    if technique == "aic":
        return f"AIC 強弱鏈：強制推理，消去數字 {digits_str}"

    if technique == "naked_triple":
        return f"Naked Triple：三數組消去 {n} 個候選數"
    if technique == "hidden_triple":
        return f"Hidden Triple：隱藏三數組消去 {n} 個候選數"
    if technique == "naked_quad":
        return f"Naked Quad：四數組消去 {n} 個候選數"
    if technique == "hidden_quad":
        return f"Hidden Quad：隱藏四數組消去 {n} 個候選數"

    return f"{TECHNIQUE_DISPLAY.get(technique, technique)}：消去 {n} 個候選數"


# ─── Puzzle Generation ─────────────────────────────────────

BASIC = ["naked_single", "hidden_single", "locked_candidates", "naked_pair", "hidden_pair"]

# For solving to bottleneck, use all techniques below T
# For checking solvability, use BASIC + T (tighter constraint that works for practice)
TECHNIQUE_CLUE_RANGE = {
    'naked_triple': (22, 30),
    'hidden_triple': (22, 30),
    'naked_quad': (21, 29),
    'hidden_quad': (21, 29),
    'x_wing': (19, 28),
    'skyscraper': (20, 28),
    'unique_rectangle': (20, 28),
    'swordfish': (18, 27),
    'xy_wing': (18, 27),
    'xyz_wing': (18, 27),
    'finned_x_wing': (18, 27),
    'aic': (17, 26),
}


def make_practice_puzzle(technique: str) -> Optional[dict]:
    below = get_below_techniques(technique)
    # Use BASIC + T for solvability check (tighter, more likely to hit T as max)
    solve_set = BASIC + [technique]
    min_clues, max_clues = TECHNIQUE_CLUE_RANGE.get(technique, (19, 28))

    solution = generate_filled_grid()
    if not solution:
        return None

    # Try multiple removal patterns from the same grid
    for removal_attempt in range(5):
        puzzle = solution[:]
        indices = list(range(81))
        random.shuffle(indices)

        target_clues = random.randint(min_clues, max_clues)

        for idx in indices:
            if puzzle[idx] == 0:
                continue
            clue_count = sum(1 for v in puzzle if v != 0)
            if clue_count <= target_clues:
                break

            backup = puzzle[idx]
            puzzle[idx] = 0

            if count_solutions(puzzle, 2) != 1:
                puzzle[idx] = backup

        clue_count = sum(1 for v in puzzle if v != 0)
        if clue_count > max_clues or clue_count < min_clues:
            continue

        # Must be solvable with BASIC + T
        result = logic_solve(puzzle, solve_set)
        if not result["solved"]:
            continue

        # max_tech must be T
        _, max_tech, _, counts = score_trace(result["trace"], DEFAULT_WEIGHTS)
        if max_tech != technique:
            continue

        # NOT solvable with BASIC alone
        result_basic = logic_solve(puzzle, BASIC)
        if result_basic["solved"]:
            continue

        # Solve with BASIC to bottleneck (use BASIC for clean bottleneck)
        bn_board = list(puzzle)
        bn_cands = initial_candidates(bn_board)
        if bn_cands is None:
            continue

        if not solve_with(bn_board, bn_cands, BASIC):
            continue

        if is_solved(bn_board):
            continue

        # Apply T once at bottleneck
        elim = try_technique_once(bn_board, bn_cands, technique)
        if elim is None:
            continue

        # After applying T, BASIC must finish
        after_board, after_cands = clone_state(bn_board, bn_cands)
        fn = TECHNIQUE_FUNCS[technique]
        ok, changed = fn(after_board, after_cands, [])
        if not ok or not changed:
            continue

        if not solve_with(after_board, after_cands, BASIC):
            continue

        if not is_solved(after_board):
            continue  # Needs T more than once

        # Build notes
        notes = {}
        for i in range(81):
            if bn_board[i] == 0 and bn_cands[i]:
                notes[i] = sorted(bn_cands[i])

        return {
            "board": bn_board,
            "given": puzzle,
            "notes": notes,
            "answer": elim,
            "solution": solution,
        }

    return None


# ─── Main ─────────────────────────────────────────────────

def main():
    random.seed(20260321)

    all_results = {}

    for stars, technique in STARS_TECHNIQUES:
        print(f"\n{'='*60}")
        print(f"Stars {stars}: {technique} ({TECHNIQUE_DISPLAY[technique]})")
        print(f"{'='*60}")

        results = []
        attempts = 0
        start = time.time()
        seen = set()

        while len(results) < PUZZLES_PER_TECHNIQUE and attempts < MAX_ATTEMPTS:
            attempts += 1
            result = make_practice_puzzle(technique)
            if result:
                key = tuple(result["given"])
                if key in seen:
                    continue
                seen.add(key)
                results.append(result)
                elapsed = time.time() - start
                n_elim = len(result["answer"]["eliminates"])
                print(f"  \u2713 #{len(results)} | elim={n_elim} | {elapsed:.1f}s ({attempts} attempts)")

            if attempts % 200 == 0 and len(results) < PUZZLES_PER_TECHNIQUE:
                elapsed = time.time() - start
                print(f"  ... {attempts} attempts, {len(results)}/{PUZZLES_PER_TECHNIQUE}, {elapsed:.1f}s")

            if attempts >= MAX_ATTEMPTS:
                print(f"  \u26a0 Only found {len(results)} puzzles after {attempts} attempts")
                break

        all_results[str(stars)] = results
        elapsed = time.time() - start
        print(f"  Total: {len(results)} puzzles in {elapsed:.1f}s ({attempts} attempts)")

    # Write JSON
    output = {}
    for stars_str, puzzles in all_results.items():
        output[stars_str] = []
        for p in puzzles:
            output[stars_str].append({
                "board": p["board"],
                "given": p["given"],
                "notes": {str(k): v for k, v in p["notes"].items()},
                "answer": p["answer"],
                "solution": p["solution"],
            })

    out_path = "practice_puzzles.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"Written to {out_path}")
    for s, ps in all_results.items():
        print(f"  Stars {s}: {len(ps)} puzzles")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
