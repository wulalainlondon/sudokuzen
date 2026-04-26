#!/usr/bin/env python3
"""
Batch runner for NIRVANA generation:
- run generate_and_filter_nirvana.py multiple times with different seeds
- merge results
- dedupe by puzzle
- select top puzzles per clue target
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List


def parse_targets(raw: str) -> Dict[int, int]:
    out: Dict[int, int] = {}
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        clue_s, count_s = part.split(":")
        out[int(clue_s)] = int(count_s)
    if not out:
        raise ValueError("targets cannot be empty")
    return out


def puzzle_key(puzzle: List[int]) -> str:
    return "".join(map(str, puzzle))


def run_once(
    run_idx: int,
    seed: int,
    script_path: Path,
    input_path: Path,
    run_out: Path,
    passthrough_args: List[str],
) -> int:
    cmd = [
        sys.executable,
        str(script_path),
        "--input",
        str(input_path),
        "--output",
        str(run_out),
        "--seed",
        str(seed),
    ] + passthrough_args
    cp = subprocess.run(cmd, capture_output=True, text=True)
    print(f"[run {run_idx}] seed={seed} exit={cp.returncode}")
    if cp.stdout.strip():
        print(cp.stdout.strip())
    if cp.stderr.strip():
        print(cp.stderr.strip())
    return cp.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch-generate NIRVANA levels and merge dedupe.")
    parser.add_argument("--input", default="levels.js")
    parser.add_argument("--output", default="out_nirvana_batch")
    parser.add_argument("--targets", default="17:3,18:4,19:5")
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--seed-start", type=int, default=11)
    parser.add_argument("--seed-step", type=int, default=2)
    parser.add_argument(
        "--generator-script",
        default="generate_and_filter_nirvana.py",
        help="Path to single-run generator script.",
    )
    args, passthrough = parser.parse_known_args()

    targets = parse_targets(args.targets)
    out_dir = Path(args.output)
    runs_dir = out_dir / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)

    script_path = Path(args.generator_script)
    input_path = Path(args.input)

    run_summaries = []
    merged_by_key: Dict[str, dict] = {}
    reject_counts = Counter()

    for i in range(args.runs):
        run_idx = i + 1
        seed = args.seed_start + i * args.seed_step
        run_out = runs_dir / f"run_{run_idx:03d}_seed_{seed}"
        run_out.mkdir(parents=True, exist_ok=True)

        rc = run_once(
            run_idx=run_idx,
            seed=seed,
            script_path=script_path,
            input_path=input_path,
            run_out=run_out,
            passthrough_args=passthrough,
        )
        if rc != 0:
            run_summaries.append({"run": run_idx, "seed": seed, "status": "failed", "generated": 0})
            reject_counts["run_failed"] += 1
            continue

        gen_path = run_out / "nirvana_generated_levels.json"
        if not gen_path.exists():
            run_summaries.append({"run": run_idx, "seed": seed, "status": "missing_output", "generated": 0})
            reject_counts["missing_output"] += 1
            continue

        items = json.loads(gen_path.read_text(encoding="utf-8"))
        run_summaries.append({"run": run_idx, "seed": seed, "status": "ok", "generated": len(items)})

        for item in items:
            key = puzzle_key(item["puzzle"])
            prev = merged_by_key.get(key)
            if prev is None:
                merged_by_key[key] = item
                continue
            # keep better candidate
            cur_score = item.get("difficulty_score", 0)
            prv_score = prev.get("difficulty_score", 0)
            cur_ratio = item.get("single_ratio", 1.0)
            prv_ratio = prev.get("single_ratio", 1.0)
            if (cur_score, -cur_ratio) > (prv_score, -prv_ratio):
                merged_by_key[key] = item
            reject_counts["dedupe_replaced_or_dropped"] += 1

    merged = list(merged_by_key.values())
    by_clue: Dict[int, List[dict]] = defaultdict(list)
    for item in merged:
        by_clue[item.get("clues", 0)].append(item)

    selected: List[dict] = []
    for clue in sorted(targets):
        group = by_clue.get(clue, [])
        group.sort(key=lambda x: (-x.get("difficulty_score", 0), x.get("single_ratio", 1.0), x.get("id", 0)))
        selected.extend(group[: targets[clue]])
        if len(group) < targets[clue]:
            reject_counts[f"insufficient_clue_{clue}"] += targets[clue] - len(group)

    merged_path = out_dir / "nirvana_merged_unique.json"
    selected_path = out_dir / "nirvana_merged_selected.json"
    report_path = out_dir / "nirvana_batch_report.md"

    merged_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    selected_path.write_text(json.dumps(selected, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# NIRVANA Batch Report",
        "",
        f"- runs: {args.runs}",
        f"- merged unique candidates: {len(merged)}",
        f"- selected candidates: {len(selected)}",
        "",
        "## Run summary",
    ]
    for x in run_summaries:
        lines.append(f"- run {x['run']} seed={x['seed']} status={x['status']} generated={x['generated']}")
    lines += ["", "## Selected by clue"]
    selected_counter = Counter(item["clues"] for item in selected)
    for clue in sorted(targets):
        lines.append(f"- clues {clue}: {selected_counter[clue]} / {targets[clue]}")
    lines += ["", "## Notes"]
    if reject_counts:
        for k, v in reject_counts.most_common():
            lines.append(f"- {k}: {v}")
    else:
        lines.append("- (none)")
    lines.append("")
    report_path.write_text("\n".join(lines), encoding="utf-8")

    print(f"Done. merged={len(merged)} selected={len(selected)}")
    print(f"- {merged_path}")
    print(f"- {selected_path}")
    print(f"- {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
