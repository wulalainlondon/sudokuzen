#!/usr/bin/env python3
"""
Filter Sudoku levels into NIRVANA candidates:
- clue count in a target range (default 17-19)
- unique solution
- solvable by pure logic (no guessing/backtracking in logic phase)

Usage:
  python nirvana_filter.py --input levels.js --output out
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple


DIGITS = set(range(1, 10))
SIZE = 9
CELL_COUNT = 81


def cell_to_rc(idx: int) -> Tuple[int, int]:
    return idx // 9, idx % 9


def rc_to_cell(r: int, c: int) -> int:
    return r * 9 + c


def build_units_and_peers() -> Tuple[List[List[int]], List[List[int]], List[Set[int]]]:
    rows = [[rc_to_cell(r, c) for c in range(9)] for r in range(9)]
    cols = [[rc_to_cell(r, c) for r in range(9)] for c in range(9)]
    boxes = []
    for br in range(0, 9, 3):
        for bc in range(0, 9, 3):
            boxes.append([rc_to_cell(br + dr, bc + dc) for dr in range(3) for dc in range(3)])
    units = rows + cols + boxes

    unit_index_by_cell = [[] for _ in range(81)]
    for ui, unit in enumerate(units):
        for idx in unit:
            unit_index_by_cell[idx].append(ui)

    peers = []
    for idx in range(81):
        p = set()
        for ui in unit_index_by_cell[idx]:
            p.update(units[ui])
        p.remove(idx)
        peers.append(p)
    return rows, cols, peers


ROWS, COLS, PEERS = build_units_and_peers()
BOXES = [
    [rc_to_cell(br + dr, bc + dc) for dr in range(3) for dc in range(3)]
    for br in range(0, 9, 3)
    for bc in range(0, 9, 3)
]
UNITS = ROWS + COLS + BOXES


@dataclass
class Step:
    technique: str
    action: str  # "place" | "eliminate"
    detail: str


def parse_bool(value: str) -> bool:
    lowered = value.lower()
    if lowered in {"1", "true", "yes", "y", "on"}:
        return True
    if lowered in {"0", "false", "no", "n", "off"}:
        return False
    raise argparse.ArgumentTypeError(f"invalid boolean value: {value}")


def load_levels(input_path: Path) -> List[dict]:
    text = input_path.read_text(encoding="utf-8")
    if input_path.suffix.lower() == ".json":
        data = json.loads(text)
        if not isinstance(data, list):
            raise ValueError("JSON root must be an array.")
        return data

    match = re.search(r"const\s+levels\s*=\s*(\[[\s\S]*?\]);", text)
    if not match:
        raise ValueError("Could not find `const levels = [...]` in input.")
    payload = match.group(1)
    return json.loads(payload)


def count_clues(puzzle: Sequence[int]) -> int:
    return sum(1 for v in puzzle if v != 0)


def initial_candidates(board: List[int]) -> Optional[List[Set[int]]]:
    cands: List[Set[int]] = [set() for _ in range(81)]
    for idx, v in enumerate(board):
        if v != 0:
            cands[idx] = set()
            continue
        used = {board[p] for p in PEERS[idx] if board[p] != 0}
        possible = DIGITS - used
        if not possible:
            return None
        cands[idx] = possible

    for unit in UNITS:
        seen = set()
        for idx in unit:
            v = board[idx]
            if v == 0:
                continue
            if v in seen:
                return None
            seen.add(v)
    return cands


def remove_candidate(board: List[int], cands: List[Set[int]], idx: int, d: int) -> bool:
    if board[idx] != 0 or d not in cands[idx]:
        return True
    cands[idx].remove(d)
    return len(cands[idx]) > 0


def assign(board: List[int], cands: List[Set[int]], idx: int, d: int) -> bool:
    if board[idx] != 0:
        return board[idx] == d
    if d not in cands[idx]:
        return False
    board[idx] = d
    cands[idx].clear()
    for p in PEERS[idx]:
        if not remove_candidate(board, cands, p, d):
            return False
    return True


def is_solved(board: Sequence[int]) -> bool:
    return all(v != 0 for v in board)


def apply_naked_single(board: List[int], cands: List[Set[int]], trace: List[Step]) -> Tuple[bool, bool]:
    for idx in range(81):
        if board[idx] == 0 and len(cands[idx]) == 1:
            d = next(iter(cands[idx]))
            if not assign(board, cands, idx, d):
                return False, False
            r, c = cell_to_rc(idx)
            trace.append(Step("naked_single", "place", f"r{r+1}c{c+1}={d}"))
            return True, True
    return True, False


def apply_hidden_single(board: List[int], cands: List[Set[int]], trace: List[Step]) -> Tuple[bool, bool]:
    for unit in UNITS:
        for d in range(1, 10):
            if any(board[idx] == d for idx in unit):
                continue
            pos = [idx for idx in unit if board[idx] == 0 and d in cands[idx]]
            if len(pos) == 1:
                idx = pos[0]
                if not assign(board, cands, idx, d):
                    return False, False
                r, c = cell_to_rc(idx)
                trace.append(Step("hidden_single", "place", f"r{r+1}c{c+1}={d}"))
                return True, True
    return True, False


def apply_locked_candidates(board: List[int], cands: List[Set[int]], trace: List[Step]) -> Tuple[bool, bool]:
    # Pointing (box -> row/col)
    for box in BOXES:
        for d in range(1, 10):
            pos = [idx for idx in box if board[idx] == 0 and d in cands[idx]]
            if len(pos) <= 1:
                continue
            rows = {cell_to_rc(i)[0] for i in pos}
            cols = {cell_to_rc(i)[1] for i in pos}
            if len(rows) == 1:
                r = next(iter(rows))
                targets = [rc_to_cell(r, c) for c in range(9) if rc_to_cell(r, c) not in box]
                changed = []
                for t in targets:
                    if board[t] == 0 and d in cands[t]:
                        if not remove_candidate(board, cands, t, d):
                            return False, False
                        changed.append(t)
                if changed:
                    trace.append(Step("locked_candidates", "eliminate", f"pointing d{d} row r{r+1}, removed {len(changed)}"))
                    return True, True
            if len(cols) == 1:
                c = next(iter(cols))
                targets = [rc_to_cell(r, c) for r in range(9) if rc_to_cell(r, c) not in box]
                changed = []
                for t in targets:
                    if board[t] == 0 and d in cands[t]:
                        if not remove_candidate(board, cands, t, d):
                            return False, False
                        changed.append(t)
                if changed:
                    trace.append(Step("locked_candidates", "eliminate", f"pointing d{d} col c{c+1}, removed {len(changed)}"))
                    return True, True

    # Claiming (row/col -> box)
    for unit in ROWS + COLS:
        is_row = unit in ROWS
        for d in range(1, 10):
            pos = [idx for idx in unit if board[idx] == 0 and d in cands[idx]]
            if len(pos) <= 1:
                continue
            boxes = {(cell_to_rc(i)[0] // 3, cell_to_rc(i)[1] // 3) for i in pos}
            if len(boxes) != 1:
                continue
            br, bc = next(iter(boxes))
            box = [rc_to_cell(br * 3 + dr, bc * 3 + dc) for dr in range(3) for dc in range(3)]
            changed = []
            for t in box:
                if t in unit or board[t] != 0 or d not in cands[t]:
                    continue
                if not remove_candidate(board, cands, t, d):
                    return False, False
                changed.append(t)
            if changed:
                kind = "row" if is_row else "col"
                label = cell_to_rc(unit[0])[0] + 1 if is_row else cell_to_rc(unit[0])[1] + 1
                trace.append(Step("locked_candidates", "eliminate", f"claiming d{d} {kind}{label}, removed {len(changed)}"))
                return True, True
    return True, False


def apply_naked_pair(board: List[int], cands: List[Set[int]], trace: List[Step]) -> Tuple[bool, bool]:
    for unit in UNITS:
        pair_map: Dict[Tuple[int, int], List[int]] = defaultdict(list)
        for idx in unit:
            if board[idx] == 0 and len(cands[idx]) == 2:
                pair = tuple(sorted(cands[idx]))
                pair_map[pair].append(idx)
        for pair, cells in pair_map.items():
            if len(cells) != 2:
                continue
            changed = 0
            for idx in unit:
                if idx in cells or board[idx] != 0:
                    continue
                for d in pair:
                    if d in cands[idx]:
                        if not remove_candidate(board, cands, idx, d):
                            return False, False
                        changed += 1
            if changed:
                trace.append(Step("naked_pair", "eliminate", f"pair {pair} removed {changed}"))
                return True, True
    return True, False


def apply_hidden_pair(board: List[int], cands: List[Set[int]], trace: List[Step]) -> Tuple[bool, bool]:
    for unit in UNITS:
        pos_by_digit: Dict[int, List[int]] = {}
        for d in range(1, 10):
            pos_by_digit[d] = [idx for idx in unit if board[idx] == 0 and d in cands[idx]]
        for d1, d2 in combinations(range(1, 10), 2):
            p1 = pos_by_digit[d1]
            p2 = pos_by_digit[d2]
            if len(p1) == 2 and p1 == p2:
                changed = 0
                for idx in p1:
                    keep = {d1, d2}
                    drop = cands[idx] - keep
                    if drop:
                        cands[idx].intersection_update(keep)
                        if not cands[idx]:
                            return False, False
                        changed += len(drop)
                if changed:
                    trace.append(Step("hidden_pair", "eliminate", f"pair ({d1},{d2}) removed {changed}"))
                    return True, True
    return True, False


def apply_xy_wing(board: List[int], cands: List[Set[int]], trace: List[Step]) -> Tuple[bool, bool]:
    for pivot in range(81):
        if board[pivot] != 0 or len(cands[pivot]) != 2:
            continue
        a, b = sorted(cands[pivot])
        peer_cells = [p for p in PEERS[pivot] if board[p] == 0 and len(cands[p]) == 2]

        wing_a = []
        wing_b = []
        for w in peer_cells:
            s = cands[w]
            if a in s and b not in s:
                wing_a.append(w)
            elif b in s and a not in s:
                wing_b.append(w)

        for w1 in wing_a:
            z1 = next(iter(cands[w1] - {a}))
            for w2 in wing_b:
                z2 = next(iter(cands[w2] - {b}))
                if z1 != z2:
                    continue
                z = z1
                targets = PEERS[w1] & PEERS[w2]
                changed = 0
                for t in targets:
                    if t in (pivot, w1, w2) or board[t] != 0 or z not in cands[t]:
                        continue
                    if not remove_candidate(board, cands, t, z):
                        return False, False
                    changed += 1
                if changed:
                    rp, cp = cell_to_rc(pivot)
                    r1, c1 = cell_to_rc(w1)
                    r2, c2 = cell_to_rc(w2)
                    trace.append(
                        Step(
                            "xy_wing",
                            "eliminate",
                            f"pivot r{rp+1}c{cp+1}, wings r{r1+1}c{c1+1}/r{r2+1}c{c2+1}, z={z}, removed {changed}",
                        )
                    )
                    return True, True
    return True, False


def apply_x_wing(board: List[int], cands: List[Set[int]], trace: List[Step]) -> Tuple[bool, bool]:
    # Row-based X-Wing
    for d in range(1, 10):
        row_to_cols: Dict[int, Tuple[int, int]] = {}
        for r in range(9):
            cols = [c for c in range(9) if board[rc_to_cell(r, c)] == 0 and d in cands[rc_to_cell(r, c)]]
            if len(cols) == 2:
                row_to_cols[r] = (cols[0], cols[1])

        for r1, r2 in combinations(sorted(row_to_cols.keys()), 2):
            if row_to_cols[r1] != row_to_cols[r2]:
                continue
            c1, c2 = row_to_cols[r1]
            changed = 0
            for r in range(9):
                if r in (r1, r2):
                    continue
                for c in (c1, c2):
                    idx = rc_to_cell(r, c)
                    if board[idx] == 0 and d in cands[idx]:
                        if not remove_candidate(board, cands, idx, d):
                            return False, False
                        changed += 1
            if changed:
                trace.append(Step("x_wing", "eliminate", f"d{d} rows {r1+1},{r2+1} cols {c1+1},{c2+1} removed {changed}"))
                return True, True

    # Col-based X-Wing
    for d in range(1, 10):
        col_to_rows: Dict[int, Tuple[int, int]] = {}
        for c in range(9):
            rows = [r for r in range(9) if board[rc_to_cell(r, c)] == 0 and d in cands[rc_to_cell(r, c)]]
            if len(rows) == 2:
                col_to_rows[c] = (rows[0], rows[1])

        for c1, c2 in combinations(sorted(col_to_rows.keys()), 2):
            if col_to_rows[c1] != col_to_rows[c2]:
                continue
            r1, r2 = col_to_rows[c1]
            changed = 0
            for c in range(9):
                if c in (c1, c2):
                    continue
                for r in (r1, r2):
                    idx = rc_to_cell(r, c)
                    if board[idx] == 0 and d in cands[idx]:
                        if not remove_candidate(board, cands, idx, d):
                            return False, False
                        changed += 1
            if changed:
                trace.append(Step("x_wing", "eliminate", f"d{d} cols {c1+1},{c2+1} rows {r1+1},{r2+1} removed {changed}"))
                return True, True
    return True, False


def apply_swordfish(board: List[int], cands: List[Set[int]], trace: List[Step]) -> Tuple[bool, bool]:
    # Row-based Swordfish
    for d in range(1, 10):
        row_to_cols: Dict[int, Set[int]] = {}
        for r in range(9):
            cols = {c for c in range(9) if board[rc_to_cell(r, c)] == 0 and d in cands[rc_to_cell(r, c)]}
            if 2 <= len(cols) <= 3:
                row_to_cols[r] = cols

        rows = sorted(row_to_cols.keys())
        for r1, r2, r3 in combinations(rows, 3):
            union_cols = row_to_cols[r1] | row_to_cols[r2] | row_to_cols[r3]
            if len(union_cols) != 3:
                continue
            changed = 0
            for r in range(9):
                if r in (r1, r2, r3):
                    continue
                for c in union_cols:
                    idx = rc_to_cell(r, c)
                    if board[idx] == 0 and d in cands[idx]:
                        if not remove_candidate(board, cands, idx, d):
                            return False, False
                        changed += 1
            if changed:
                cols_txt = ",".join(str(c + 1) for c in sorted(union_cols))
                trace.append(
                    Step(
                        "swordfish",
                        "eliminate",
                        f"d{d} rows {r1+1},{r2+1},{r3+1} cols {cols_txt} removed {changed}",
                    )
                )
                return True, True

    # Col-based Swordfish
    for d in range(1, 10):
        col_to_rows: Dict[int, Set[int]] = {}
        for c in range(9):
            rows = {r for r in range(9) if board[rc_to_cell(r, c)] == 0 and d in cands[rc_to_cell(r, c)]}
            if 2 <= len(rows) <= 3:
                col_to_rows[c] = rows

        cols = sorted(col_to_rows.keys())
        for c1, c2, c3 in combinations(cols, 3):
            union_rows = col_to_rows[c1] | col_to_rows[c2] | col_to_rows[c3]
            if len(union_rows) != 3:
                continue
            changed = 0
            for c in range(9):
                if c in (c1, c2, c3):
                    continue
                for r in union_rows:
                    idx = rc_to_cell(r, c)
                    if board[idx] == 0 and d in cands[idx]:
                        if not remove_candidate(board, cands, idx, d):
                            return False, False
                        changed += 1
            if changed:
                rows_txt = ",".join(str(r + 1) for r in sorted(union_rows))
                trace.append(
                    Step(
                        "swordfish",
                        "eliminate",
                        f"d{d} cols {c1+1},{c2+1},{c3+1} rows {rows_txt} removed {changed}",
                    )
                )
                return True, True
    return True, False


def clone_state(board: List[int], cands: List[Set[int]]) -> Tuple[List[int], List[Set[int]]]:
    return board[:], [s.copy() for s in cands]


def apply_basic_propagation(board: List[int], cands: List[Set[int]], max_loops: int = 200) -> bool:
    """
    Lightweight deterministic propagation used by forcing-chain checks.
    Returns False on contradiction.
    """
    loops = 0
    while loops < max_loops:
        loops += 1
        progressed = False
        for fn in (apply_naked_single, apply_hidden_single, apply_locked_candidates):
            ok, changed = fn(board, cands, [])
            if not ok:
                return False
            if changed:
                progressed = True
                break
        if not progressed:
            break
    return True


def forcing_contradiction(board: List[int], cands: List[Set[int]], idx: int, d: int) -> bool:
    tb, tc = clone_state(board, cands)
    if not assign(tb, tc, idx, d):
        return True
    return not apply_basic_propagation(tb, tc)


def apply_aic(board: List[int], cands: List[Set[int]], trace: List[Step]) -> Tuple[bool, bool]:
    """
    AIC/forcing-chain style elimination:
    if assuming a candidate leads to contradiction, eliminate it.
    """
    for idx in range(81):
        if board[idx] != 0:
            continue
        if len(cands[idx]) <= 1:
            continue
        for d in sorted(cands[idx]):
            if forcing_contradiction(board, cands, idx, d):
                if not remove_candidate(board, cands, idx, d):
                    return False, False
                r, c = cell_to_rc(idx)
                trace.append(Step("aic", "eliminate", f"forcing contradiction at r{r+1}c{c+1}, removed {d}"))
                return True, True
    return True, False


TECHNIQUE_FUNCS = {
    "naked_single": apply_naked_single,
    "hidden_single": apply_hidden_single,
    "locked_candidates": apply_locked_candidates,
    "naked_pair": apply_naked_pair,
    "hidden_pair": apply_hidden_pair,
    "xy_wing": apply_xy_wing,
    "x_wing": apply_x_wing,
    "swordfish": apply_swordfish,
    "aic": apply_aic,
}

DEFAULT_TECHNIQUES = [
    "naked_single",
    "hidden_single",
    "locked_candidates",
    "naked_pair",
    "hidden_pair",
    "xy_wing",
    "x_wing",
    "swordfish",
    "aic",
]

DEFAULT_WEIGHTS = {
    "naked_single": 1,
    "hidden_single": 1,
    "locked_candidates": 2,
    "naked_pair": 3,
    "hidden_pair": 4,
    "xy_wing": 7,
    "x_wing": 6,
    "swordfish": 8,
    "aic": 9,
}


def logic_solve(board: Sequence[int], allowed_techniques: Sequence[str]) -> dict:
    work_board = list(board)
    cands = initial_candidates(work_board)
    if cands is None:
        return {"solved": False, "trace": [], "error": "invalid_board"}

    trace: List[Step] = []
    funcs = [TECHNIQUE_FUNCS[name] for name in allowed_techniques]
    iterations = 0
    max_iterations = 10000

    while not is_solved(work_board) and iterations < max_iterations:
        iterations += 1
        progressed = False
        for fn in funcs:
            ok, changed = fn(work_board, cands, trace)
            if not ok:
                return {"solved": False, "trace": [step.__dict__ for step in trace], "error": "contradiction"}
            if changed:
                progressed = True
                break
        if not progressed:
            break

    return {"solved": is_solved(work_board), "trace": [step.__dict__ for step in trace], "error": None}


def count_solutions(board: Sequence[int], limit: int = 2) -> int:
    grid = list(board)
    solutions = 0

    def possible_values(idx: int) -> List[int]:
        if grid[idx] != 0:
            return []
        used = {grid[p] for p in PEERS[idx] if grid[p] != 0}
        return [d for d in range(1, 10) if d not in used]

    def choose_cell() -> Optional[Tuple[int, List[int]]]:
        best_idx = None
        best_vals = None
        for i in range(81):
            if grid[i] != 0:
                continue
            vals = possible_values(i)
            if len(vals) == 0:
                return i, []
            if best_idx is None or len(vals) < len(best_vals):
                best_idx = i
                best_vals = vals
                if len(best_vals) == 1:
                    break
        if best_idx is None:
            return None
        return best_idx, best_vals

    def dfs() -> None:
        nonlocal solutions
        if solutions >= limit:
            return
        choice = choose_cell()
        if choice is None:
            solutions += 1
            return
        idx, vals = choice
        if not vals:
            return
        for d in vals:
            grid[idx] = d
            dfs()
            grid[idx] = 0
            if solutions >= limit:
                return

    # validate initial board
    if initial_candidates(grid) is None:
        return 0
    dfs()
    return solutions


def score_trace(trace: List[dict], weights: Dict[str, int]) -> Tuple[int, str, float, Counter]:
    counts = Counter(step["technique"] for step in trace)
    score = sum(weights.get(k, 1) * v for k, v in counts.items())
    max_tech = "none"
    max_w = -1
    for tech, count in counts.items():
        if count <= 0:
            continue
        w = weights.get(tech, 1)
        if w > max_w:
            max_w = w
            max_tech = tech

    placements = [s for s in trace if s["action"] == "place"]
    single_places = [
        s for s in placements if s["technique"] in {"naked_single", "hidden_single"}
    ]
    single_ratio = (len(single_places) / len(placements)) if placements else 0.0
    return score, max_tech, single_ratio, counts


def make_report_md(
    total_levels: int,
    candidates: List[dict],
    rejects: List[dict],
    clue_counter: Counter,
    reject_counter: Counter,
) -> str:
    lines = []
    lines.append("# NIRVANA Filter Report")
    lines.append("")
    lines.append(f"- Total input levels: **{total_levels}**")
    lines.append(f"- Passed candidates: **{len(candidates)}**")
    lines.append(f"- Rejected: **{len(rejects)}**")
    lines.append("")
    lines.append("## Candidate clue distribution")
    if candidates:
        for clue in sorted(clue_counter):
            lines.append(f"- clues {clue}: {clue_counter[clue]}")
    else:
        lines.append("- (none)")
    lines.append("")
    lines.append("## Rejection reasons")
    if rejects:
        for reason, count in reject_counter.most_common():
            lines.append(f"- {reason}: {count}")
    else:
        lines.append("- (none)")
    lines.append("")
    lines.append("## Top 20 candidates by score")
    if candidates:
        top = sorted(candidates, key=lambda x: (-x["difficulty_score"], x["clues"], x["id"]))[:20]
        for item in top:
            lines.append(
                f"- id={item['id']} clues={item['clues']} score={item['difficulty_score']} max={item['max_technique']} single_ratio={item['single_ratio']:.2f}"
            )
    else:
        lines.append("- (none)")
    lines.append("")
    return "\n".join(lines)


def validate_puzzle(puzzle: Sequence[int]) -> Optional[str]:
    if len(puzzle) != 81:
        return "invalid_length"
    for v in puzzle:
        if not isinstance(v, int) or v < 0 or v > 9:
            return "invalid_value"
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Filter NIRVANA sudoku candidates.")
    parser.add_argument("--input", required=True, help="Path to levels.js or levels.json")
    parser.add_argument("--output", default="out", help="Output directory")
    parser.add_argument("--min-clues", type=int, default=17)
    parser.add_argument("--max-clues", type=int, default=19)
    parser.add_argument(
        "--allowed-techniques",
        default=",".join(DEFAULT_TECHNIQUES),
        help=f"Comma-separated list. Available: {', '.join(DEFAULT_TECHNIQUES)}",
    )
    parser.add_argument("--min-score", type=int, default=35)
    parser.add_argument("--max-single-ratio", type=float, default=0.65)
    parser.add_argument("--require-unique", type=parse_bool, default=True)
    parser.add_argument("--target-count", type=int, default=0, help="0 means unlimited")
    args = parser.parse_args()

    input_path = Path(args.input)
    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)

    allowed = [x.strip() for x in args.allowed_techniques.split(",") if x.strip()]
    unknown = [x for x in allowed if x not in TECHNIQUE_FUNCS]
    if unknown:
        raise ValueError(f"Unknown techniques: {unknown}")
    if not allowed:
        raise ValueError("No allowed techniques set.")

    levels = load_levels(input_path)

    seen_ids = set()
    candidates: List[dict] = []
    rejects: List[dict] = []
    clue_counter = Counter()
    reject_counter = Counter()

    for lv in levels:
        lv_id = lv.get("id")
        display_name = lv.get("displayName", "")
        puzzle = lv.get("puzzle")
        base = {
            "id": lv_id,
            "displayName": display_name,
        }

        if lv_id in seen_ids:
            reason = "duplicate_id"
            rejects.append({**base, "reject_reason": reason})
            reject_counter[reason] += 1
            continue
        seen_ids.add(lv_id)

        if not isinstance(puzzle, list):
            reason = "missing_puzzle"
            rejects.append({**base, "reject_reason": reason})
            reject_counter[reason] += 1
            continue

        bad = validate_puzzle(puzzle)
        if bad:
            rejects.append({**base, "reject_reason": bad})
            reject_counter[bad] += 1
            continue

        clues = count_clues(puzzle)
        if clues < args.min_clues or clues > args.max_clues:
            reason = "clues_out_of_range"
            rejects.append({**base, "clues": clues, "reject_reason": reason})
            reject_counter[reason] += 1
            continue

        sol_count = count_solutions(puzzle, limit=2) if args.require_unique else -1
        if args.require_unique and sol_count != 1:
            reason = "no_solution" if sol_count == 0 else "multiple_solutions"
            rejects.append({**base, "clues": clues, "solution_count": sol_count, "reject_reason": reason})
            reject_counter[reason] += 1
            continue

        logic = logic_solve(puzzle, allowed)
        if not logic["solved"]:
            reason = "not_logic_solvable"
            rejects.append(
                {
                    **base,
                    "clues": clues,
                    "solution_count": sol_count,
                    "is_logic_solvable": False,
                    "reject_reason": reason,
                    "logic_error": logic.get("error"),
                }
            )
            reject_counter[reason] += 1
            continue

        score, max_tech, single_ratio, technique_counts = score_trace(logic["trace"], DEFAULT_WEIGHTS)
        if score < args.min_score:
            reason = "low_score"
            rejects.append(
                {
                    **base,
                    "clues": clues,
                    "solution_count": sol_count,
                    "is_logic_solvable": True,
                    "difficulty_score": score,
                    "max_technique": max_tech,
                    "single_ratio": round(single_ratio, 4),
                    "reject_reason": reason,
                }
            )
            reject_counter[reason] += 1
            continue

        if single_ratio > args.max_single_ratio:
            reason = "too_many_singles"
            rejects.append(
                {
                    **base,
                    "clues": clues,
                    "solution_count": sol_count,
                    "is_logic_solvable": True,
                    "difficulty_score": score,
                    "max_technique": max_tech,
                    "single_ratio": round(single_ratio, 4),
                    "reject_reason": reason,
                }
            )
            reject_counter[reason] += 1
            continue

        record = {
            **base,
            "clues": clues,
            "solution_count": sol_count,
            "is_unique": (sol_count == 1) if args.require_unique else None,
            "is_logic_solvable": True,
            "difficulty_score": score,
            "max_technique": max_tech,
            "single_ratio": round(single_ratio, 4),
            "technique_counts": dict(sorted(technique_counts.items())),
            "solve_trace": logic["trace"],
            "puzzle": puzzle,
        }
        candidates.append(record)
        clue_counter[clues] += 1

    if args.target_count and len(candidates) > args.target_count:
        ranked = sorted(
            candidates,
            key=lambda x: (
                -x["difficulty_score"],
                x["single_ratio"],
                x["clues"],
                x["id"],
            ),
        )
        keep_ids = {c["id"] for c in ranked[: args.target_count]}
        kept = []
        trimmed = []
        for c in candidates:
            if c["id"] in keep_ids:
                kept.append(c)
            else:
                item = {k: c[k] for k in ("id", "displayName", "clues", "difficulty_score")}
                item["reject_reason"] = "target_trim"
                trimmed.append(item)
                reject_counter["target_trim"] += 1
        candidates = kept
        rejects.extend(trimmed)
        clue_counter = Counter(c["clues"] for c in candidates)

    report = make_report_md(len(levels), candidates, rejects, clue_counter, reject_counter)

    candidates_path = out_dir / "nirvana_candidates.json"
    rejects_path = out_dir / "nirvana_rejects.json"
    report_path = out_dir / "nirvana_report.md"

    candidates_path.write_text(json.dumps(candidates, ensure_ascii=False, indent=2), encoding="utf-8")
    rejects_path.write_text(json.dumps(rejects, ensure_ascii=False, indent=2), encoding="utf-8")
    report_path.write_text(report, encoding="utf-8")

    print(f"Done. candidates={len(candidates)} rejects={len(rejects)}")
    print(f"- {candidates_path}")
    print(f"- {rejects_path}")
    print(f"- {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
