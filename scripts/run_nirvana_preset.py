#!/usr/bin/env python3
"""
Run batch NIRVANA generation with presets.

Usage:
  python run_nirvana_preset.py 1
  python run_nirvana_preset.py 2 --targets 17:3,18:4,19:5
  python run_nirvana_preset.py 3 --output out_nirvana_batch_mad
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List


@dataclass(frozen=True)
class Preset:
    name: str
    args: Dict[str, str]


PRESETS: Dict[str, Preset] = {
    "1": Preset(
        name="quick",
        args={
            "runs": "8",
            "seed-start": "11",
            "seed-step": "2",
            "pool-multiplier": "12",
            "pool-min-per-clue": "20",
            "stage1-max-attempts-per-clue": "40000",
            "dig-restarts": "4",
            "dig-probe-limit": "60",
            "dig-bridge-extra": "6",
            "dig-bridge-floor": "24",
            "dig-backtrack-branch-limit": "6",
            "dig-backtrack-node-limit": "4500",
            "min-score": "35",
            "max-single-ratio": "0.65",
        },
    ),
    "2": Preset(
        name="medium",
        args={
            "runs": "20",
            "seed-start": "11",
            "seed-step": "2",
            "pool-multiplier": "30",
            "pool-min-per-clue": "60",
            "stage1-max-attempts-per-clue": "120000",
            "dig-restarts": "6",
            "dig-probe-limit": "81",
            "dig-bridge-extra": "7",
            "dig-bridge-floor": "25",
            "dig-backtrack-branch-limit": "8",
            "dig-backtrack-node-limit": "9000",
            "min-score": "35",
            "max-single-ratio": "0.65",
        },
    ),
    "3": Preset(
        name="aggressive",
        args={
            "runs": "40",
            "seed-start": "11",
            "seed-step": "2",
            "pool-multiplier": "45",
            "pool-min-per-clue": "100",
            "stage1-max-attempts-per-clue": "220000",
            "dig-restarts": "8",
            "dig-probe-limit": "81",
            "dig-bridge-extra": "8",
            "dig-bridge-floor": "26",
            "dig-backtrack-branch-limit": "10",
            "dig-backtrack-node-limit": "15000",
            "min-score": "35",
            "max-single-ratio": "0.65",
        },
    ),
}


def build_command(args: argparse.Namespace) -> List[str]:
    preset = PRESETS[args.preset]
    cmd = [
        sys.executable,
        "batch_generate_nirvana.py",
        "--input",
        args.input,
        "--output",
        args.output or f"out_nirvana_batch_{preset.name}",
        "--targets",
        args.targets,
        "--shuffle-stage2",
    ]

    merged = dict(preset.args)
    if args.runs is not None:
        merged["runs"] = str(args.runs)
    if args.seed_start is not None:
        merged["seed-start"] = str(args.seed_start)
    if args.seed_step is not None:
        merged["seed-step"] = str(args.seed_step)

    for k, v in merged.items():
        cmd.extend([f"--{k}", v])

    return cmd


def main() -> int:
    parser = argparse.ArgumentParser(description="One-click presets for NIRVANA batch generation.")
    parser.add_argument("preset", choices=["1", "2", "3"], help="1=quick, 2=medium, 3=aggressive")
    parser.add_argument("--input", default="levels.js")
    parser.add_argument("--output", default="")
    parser.add_argument("--targets", default="17:3,18:4,19:5")
    parser.add_argument("--runs", type=int, default=None)
    parser.add_argument("--seed-start", type=int, default=None)
    parser.add_argument("--seed-step", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not Path("batch_generate_nirvana.py").exists():
        print("Error: batch_generate_nirvana.py not found in current directory.")
        return 2

    cmd = build_command(args)
    print(f"Preset {args.preset} ({PRESETS[args.preset].name})")
    print("Command:")
    print(" ".join(cmd))

    if args.dry_run:
        return 0

    cp = subprocess.run(cmd)
    return cp.returncode


if __name__ == "__main__":
    raise SystemExit(main())
