#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from copy import deepcopy
from pathlib import Path
from typing import Dict, List, Sequence, Set, Tuple


def load_nirvana_filter(path: Path):
    spec = importlib.util.spec_from_file_location("nirvana_filter", str(path))
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load nirvana_filter from {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def notes_map(board: Sequence[int], cands: Sequence[Set[int]]) -> Dict[str, List[int]]:
    out: Dict[str, List[int]] = {}
    for idx in range(81):
        if board[idx] != 0:
            continue
        vals = sorted(cands[idx])
        if vals:
            out[str(idx)] = vals
    return out


def rc(idx: int) -> str:
    r = idx // 9 + 1
    c = idx % 9 + 1
    return f"R{r}C{c}"


TECH_ZH = {
    "naked_single": "裸單",
    "hidden_single": "隱單",
    "locked_candidates": "區塊互鎖",
    "naked_pair": "裸對",
    "hidden_pair": "隱對",
    "naked_triple": "裸三",
    "hidden_triple": "隱三",
    "x_wing": "X-Wing",
    "finned_x_wing": "Finned X-Wing",
    "skyscraper": "Skyscraper",
    "xy_wing": "XY-Wing",
    "xyz_wing": "XYZ-Wing",
    "w_wing": "W-Wing",
    "unique_rectangle": "Unique Rectangle",
    "x_cycle_simple_coloring": "Simple Coloring",
    "swordfish": "Swordfish",
    "finned_swordfish": "Finned Swordfish",
    "aic": "AIC",
    "aic_mid_chain": "AIC Mid",
    "grouped_aic_nice_loop": "Grouped AIC",
    "aic_long_chain": "AIC Long",
    "als_xz": "ALS-XZ",
    "als_chain": "ALS Chain",
    "forcing_chain_net": "Forcing Chain Net",
    "mixed_mastery_boss": "Mastery Boss",
}


def build_reason(technique: str, action: str, placements: List[Dict], eliminations: List[Dict]) -> Dict[str, str]:
    t_en = technique.replace("_", " ").title()
    t_zh = TECH_ZH.get(technique, t_en)
    zh = f"使用{t_zh}：依高亮關係推進盤面，請執行標示的填值或候選消去。"
    en = f"Use {t_en}: follow the highlighted pattern and apply the marked placement or elimination."
    return {"zh_Hant": zh, "en": en}


def solve_with_states(mod, puzzle: List[int], allowed: List[str]) -> Tuple[List[dict], bool, List[int]]:
    board = puzzle[:]
    cands = mod.initial_candidates(board)
    if cands is None:
        raise RuntimeError("invalid puzzle candidates")

    steps: List[dict] = []
    guard = 0
    while not mod.is_solved(board):
        guard += 1
        if guard > 2000:
            raise RuntimeError("solver guard exceeded")
        progressed = False

        for tech in allowed:
            fn = mod.TECHNIQUE_FUNCS.get(tech)
            if fn is None:
                continue

            before_board = board[:]
            before_cands = deepcopy(cands)
            local_trace = []
            ok, changed = fn(board, cands, local_trace)
            if not ok:
                raise RuntimeError(f"contradiction at technique {tech}")
            if not changed:
                continue

            progressed = True
            raw = local_trace[-1].__dict__ if local_trace else {"technique": tech, "action": "eliminate", "detail": ""}

            placements: List[Dict[str, int]] = []
            eliminations: List[Dict[str, int]] = []
            changed_cells = set()
            highlight: Dict[str, List[int]] = {}

            for idx in range(81):
                if before_board[idx] == 0 and board[idx] != 0:
                    d = board[idx]
                    placements.append({"cell": idx, "digit": d})
                    changed_cells.add(idx)
                    highlight[str(idx)] = [d]

                if before_board[idx] == 0 and board[idx] == 0:
                    removed = sorted(before_cands[idx] - cands[idx])
                    if removed:
                        changed_cells.add(idx)
                        highlight[str(idx)] = removed
                        for d in removed:
                            eliminations.append({"cell": idx, "digit": d})

            focus_cells = sorted(changed_cells)
            reason = build_reason(raw.get("technique", tech), raw.get("action", "eliminate"), placements, eliminations)

            steps.append(
                {
                    "technique": raw.get("technique", tech),
                    "action": raw.get("action", "eliminate"),
                    "detail": raw.get("detail", ""),
                    "focus_cells": focus_cells,
                    "highlight_digits": highlight,
                    "eliminate_cells": eliminations,
                    "placements": placements,
                    "board_before": before_board,
                    "board_after": board[:],
                    "board_before_notes": notes_map(before_board, before_cands),
                    "board_after_notes": notes_map(board, cands),
                    "reason_i18n": reason,
                }
            )
            break

        if not progressed:
            break

    return steps, mod.is_solved(board), board


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--levels", default="assets/data/levels.i18n.json")
    ap.add_argument("--output", default="assets/data/level_steps.i18n.json")
    ap.add_argument("--nirvana-path", default=str(Path(__file__).resolve().parents[2] / "nirvana_filter.py"))
    args = ap.parse_args()

    root = Path(__file__).resolve().parents[1]
    levels_path = (root / args.levels).resolve()
    output_path = (root / args.output).resolve()
    nirvana_path = Path(args.nirvana_path).resolve()

    mod = load_nirvana_filter(nirvana_path)
    levels = json.loads(levels_path.read_text(encoding="utf-8"))
    allowed = list(mod.DEFAULT_TECHNIQUES)

    out = {
        "version": 1,
        "generated_from": str(levels_path.name),
        "levels": [],
    }

    for lv in levels:
        level_id = int(lv["id"])
        puzzle = [int(x) for x in lv["puzzle"]]
        solution = [int(x) for x in lv["solution"]]

        steps, solved, final_board = solve_with_states(mod, puzzle, allowed)
        if not solved:
            raise RuntimeError(f"level {level_id} not solved by logic trace")
        if final_board != solution:
            raise RuntimeError(f"level {level_id} solved board mismatch")
        if not steps:
            raise RuntimeError(f"level {level_id} has no steps")

        out["levels"].append(
            {
                "level_id": level_id,
                "stars": lv.get("stars"),
                "max_technique": lv.get("max_technique"),
                "initial_board": puzzle,
                "steps": steps,
            }
        )

    output_path.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"generated {len(out['levels'])} levels -> {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
