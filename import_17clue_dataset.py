#!/usr/bin/env python3
"""
Convert 17-clue text dataset (81-char lines with '.' for blanks) into JSON
records compatible with nirvana_filter.py.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import List


def parse_puzzle_line(line: str) -> List[int] | None:
    line = line.strip()
    if len(line) != 81:
        return None
    out: List[int] = []
    for ch in line:
        if ch == ".":
            out.append(0)
        elif "1" <= ch <= "9":
            out.append(int(ch))
        else:
            return None
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Import 17-clue text dataset to JSON records.")
    parser.add_argument("--input", default="external_data/puzzles2_17_clue.txt")
    parser.add_argument("--output", default="external_data/puzzles2_17_clue_levels.json")
    parser.add_argument("--start-id", type=int, default=500001)
    parser.add_argument("--difficulty-name", default="NIRVANA 寂滅")
    parser.add_argument("--stars", type=int, default=5)
    args = parser.parse_args()

    in_path = Path(args.input)
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    levels = []
    cur_id = args.start_id
    skipped = 0
    with in_path.open("r", encoding="utf-8") as f:
        for raw in f:
            raw = raw.rstrip("\n")
            if not raw or raw.startswith("#"):
                continue
            puzzle = parse_puzzle_line(raw)
            if puzzle is None:
                skipped += 1
                continue
            clues = sum(1 for v in puzzle if v != 0)
            levels.append(
                {
                    "id": cur_id,
                    "stars": args.stars,
                    "difficultyName": args.difficulty_name,
                    "displayName": f"Imported 17-clue #{cur_id - args.start_id + 1}",
                    "puzzle": puzzle,
                    "clues": clues,
                    "source": "external_data/puzzles2_17_clue.txt",
                }
            )
            cur_id += 1

    out_path.write_text(json.dumps(levels, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Imported: {len(levels)}")
    print(f"Skipped: {skipped}")
    print(f"Output: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
