#!/usr/bin/env python3
"""Merge expanded puzzle sets into existing generated/ JSON files.

Usage: python scripts/merge-expanded-puzzles.py

Reads from generated_expand/*.json, dedupes against generated/*.json,
then writes the merged result back to generated/*.json.
"""

import json
import os
import glob

EXPAND_DIR = "generated_expand"
TARGET_DIR = "generated"

def puzzle_key(p):
    """Unique key for a puzzle (tuple of clue values)."""
    return tuple(p["puzzle"])

def main():
    expand_files = glob.glob(os.path.join(EXPAND_DIR, "*.json"))
    if not expand_files:
        print(f"No files found in {EXPAND_DIR}/")
        return

    total_added = 0
    for ef in sorted(expand_files):
        name = os.path.basename(ef)
        target_path = os.path.join(TARGET_DIR, name)
        technique = name.replace(".json", "")

        # Load expanded
        with open(ef) as f:
            expanded = json.load(f)

        # Load existing (if any)
        existing = []
        if os.path.exists(target_path):
            with open(target_path) as f:
                existing = json.load(f)

        # Dedupe
        seen = set(puzzle_key(p) for p in existing)
        new_puzzles = [p for p in expanded if puzzle_key(p) not in seen]

        merged = existing + new_puzzles
        with open(target_path, "w") as f:
            json.dump(merged, f)

        print(f"  {technique}: {len(existing)} existing + {len(new_puzzles)} new = {len(merged)} total")
        total_added += len(new_puzzles)

    print(f"\nDone. Added {total_added} new puzzles total.")

if __name__ == "__main__":
    main()
