#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List


REQUIRED_STEP_FIELDS = {
    "technique",
    "focus_cells",
    "eliminate_cells",
    "highlight_digits",
    "board_before_notes",
    "board_after_notes",
    "reason_i18n",
    "board_before",
    "board_after",
}


def verify_level(level: Dict) -> List[str]:
    errs: List[str] = []
    level_id = level.get("level_id")
    steps = level.get("steps")
    if not isinstance(steps, list) or not steps:
        return [f"level {level_id}: steps empty"]

    for i, step in enumerate(steps):
        missing = [f for f in REQUIRED_STEP_FIELDS if f not in step]
        if missing:
            errs.append(f"level {level_id} step {i+1}: missing {','.join(sorted(missing))}")
            continue

        reason = step.get("reason_i18n") or {}
        if not (reason.get("zh_Hant") and reason.get("en")):
            errs.append(f"level {level_id} step {i+1}: reason_i18n incomplete")

        before = step.get("board_before") or []
        after = step.get("board_after") or []
        if len(before) != 81 or len(after) != 81:
            errs.append(f"level {level_id} step {i+1}: board snapshot length invalid")

        if before == after and not step.get("eliminate_cells") and not step.get("placements"):
            errs.append(f"level {level_id} step {i+1}: no effective change")

    return errs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="assets/data/level_steps.i18n.json")
    args = ap.parse_args()

    root = Path(__file__).resolve().parents[1]
    input_path = (root / args.input).resolve()

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    levels = payload.get("levels") or []

    errors: List[str] = []
    for lv in levels:
        errors.extend(verify_level(lv))

    if errors:
        print("INVALID")
        for e in errors[:200]:
            print(e)
        print(f"total_errors={len(errors)}")
        return 1

    print(f"OK levels={len(levels)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
