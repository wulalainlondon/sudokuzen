#!/usr/bin/env python3
"""
Level quality audit report.

Auto-flags:
- high repetition clusters
- curve spikes
- fake-hard candidates
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from statistics import pstdev
from typing import Dict, List

from nirvana_filter import DEFAULT_TECHNIQUES, DEFAULT_WEIGHTS, logic_solve, score_trace


def load_levels(path: Path) -> List[dict]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        return json.loads(text)
    m = re.search(r"const levels = (\[[\s\S]*?\]);", text)
    if not m:
        raise ValueError("Cannot parse levels array.")
    return json.loads(m.group(1))


def ensure_metrics(level: dict) -> None:
    required = ("difficultyScore", "maxTechnique", "singleRatio", "techTier")
    if all(k in level for k in required):
        return
    lg = logic_solve(level["puzzle"], DEFAULT_TECHNIQUES)
    if lg["solved"]:
        score, max_tech, single_ratio, _ = score_trace(lg["trace"], DEFAULT_WEIGHTS)
        level["difficultyScore"] = int(score)
        level["maxTechnique"] = max_tech
        level["singleRatio"] = round(float(single_ratio), 4)
        level["techTier"] = "unknown"
    else:
        level["difficultyScore"] = 999
        level["maxTechnique"] = "unknown"
        level["singleRatio"] = 1.0
        level["techTier"] = "unknown"


def clue_count(level: dict) -> int:
    return sum(1 for v in level["puzzle"] if v != 0)


def find_repetition_v2(levels_by_star: Dict[int, List[dict]], min_run: int = 4) -> List[dict]:
    """
    More precise repetition detection:
    merge contiguous near-identical levels into segments (avoid overlapping spam).
    """
    findings: List[dict] = []
    for stars, arr in sorted(levels_by_star.items()):
        if len(arr) < min_run:
            continue
        start = 0
        while start < len(arr):
            end = start
            while end + 1 < len(arr):
                a, b = arr[end], arr[end + 1]
                cond = (
                    a.get("maxTechnique") == b.get("maxTechnique")
                    and abs(a.get("difficultyScore", 999) - b.get("difficultyScore", 999)) <= 4
                    and abs(clue_count(a) - clue_count(b)) <= 1
                )
                if not cond:
                    break
                end += 1

            seg_len = end - start + 1
            if seg_len >= min_run:
                block = arr[start : end + 1]
                findings.append(
                    {
                        "stars": stars,
                        "level_ids": [x["id"] for x in block],
                        "names": [x["displayName"] for x in block],
                        "reason": (
                            f"contiguous run len={seg_len}, maxTechnique={block[0].get('maxTechnique')}, "
                            "small score/clue step changes"
                        ),
                    }
                )
            start = end + 1
    return findings


def median(nums: List[int]) -> float:
    if not nums:
        return 0.0
    s = sorted(nums)
    n = len(s)
    mid = n // 2
    if n % 2 == 1:
        return float(s[mid])
    return (s[mid - 1] + s[mid]) / 2.0


def find_curve_spikes_v2(levels_by_star: Dict[int, List[dict]], threshold: int = 24) -> List[dict]:
    findings: List[dict] = []
    for stars, arr in sorted(levels_by_star.items()):
        deltas = []
        for i in range(1, len(arr)):
            a, b = arr[i - 1], arr[i]
            if a.get("difficultyScore", 999) >= 900 or b.get("difficultyScore", 999) >= 900:
                continue
            deltas.append(abs(b["difficultyScore"] - a["difficultyScore"]))
        baseline = median(deltas) if deltas else 0.0
        dyn = max(threshold, int(baseline * 3))

        for i in range(1, len(arr)):
            prev = arr[i - 1]
            cur = arr[i]
            if prev.get("difficultyScore", 999) >= 900 or cur.get("difficultyScore", 999) >= 900:
                continue
            d = cur["difficultyScore"] - prev["difficultyScore"]
            if abs(d) >= dyn:
                findings.append(
                    {
                        "stars": stars,
                        "from_id": prev["id"],
                        "to_id": cur["id"],
                        "from_name": prev["displayName"],
                        "to_name": cur["displayName"],
                        "from_score": prev["difficultyScore"],
                        "to_score": cur["difficultyScore"],
                        "delta": d,
                        "baseline": baseline,
                        "threshold_used": dyn,
                    }
                )
    return findings


def find_fake_hard_v2(levels: List[dict]) -> List[dict]:
    findings: List[dict] = []
    for lv in levels:
        score = lv["difficultyScore"]
        max_tech = lv["maxTechnique"]
        tier = lv.get("techTier", "")
        advanced_tag = (lv.get("advancedTag") or "").lower()
        clues = clue_count(lv)

        reasons = []
        if "verified" not in advanced_tag:
            if score >= 85 and max_tech in {"locked_candidates", "naked_pair"} and lv["stars"] >= 3:
                reasons.append("high score but max technique remains low")
            if tier in {"T5 大師", "T5 大師+"} and max_tech in {"locked_candidates", "naked_pair", "hidden_pair"}:
                reasons.append("top-tier label but technique ceiling looks lower than expected")
            if score >= 90 and clues >= 35 and max_tech in {"locked_candidates", "naked_pair", "hidden_pair"}:
                reasons.append("high score appears driven by long grind on high-clue board")

        if reasons:
            findings.append(
                {
                    "id": lv["id"],
                    "stars": lv["stars"],
                    "name": lv["displayName"],
                    "difficultyName": lv["difficultyName"],
                    "score": score,
                    "maxTechnique": max_tech,
                    "singleRatio": lv.get("singleRatio", 1.0),
                    "clues": clues,
                    "reasons": reasons,
                }
            )
    return findings


def build_report_md(
    levels: List[dict],
    repetition: List[dict],
    spikes: List[dict],
    fake_hard: List[dict],
) -> str:
    lines = ["# Level Quality Audit", ""]
    lines.append(f"- total levels: **{len(levels)}**")
    lines.append(f"- high repetition clusters: **{len(repetition)}**")
    lines.append(f"- curve spikes: **{len(spikes)}**")
    lines.append(f"- fake-hard candidates: **{len(fake_hard)}**")
    lines.append("")

    lines.append("## High Repetition Clusters")
    if repetition:
        for r in repetition[:40]:
            lines.append(
                f"- stars {r['stars']} ids={r['level_ids']} reason={r['reason']}"
            )
    else:
        lines.append("- none")
    lines.append("")

    lines.append("## Curve Spikes")
    if spikes:
        for s in spikes[:80]:
            lines.append(
                f"- stars {s['stars']} {s['from_id']}({s['from_score']}) -> {s['to_id']}({s['to_score']}) delta={s['delta']}"
            )
    else:
        lines.append("- none")
    lines.append("")

    lines.append("## Fake-Hard Candidates")
    if fake_hard:
        for x in fake_hard[:120]:
            lines.append(
                f"- id={x['id']} stars={x['stars']} score={x['score']} max={x['maxTechnique']} singleRatio={x['singleRatio']:.2f} reasons={'; '.join(x['reasons'])}"
            )
    else:
        lines.append("- none")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate level quality audit report.")
    parser.add_argument("--input", default="levels.js")
    parser.add_argument("--output", default="out_quality")
    parser.add_argument("--spike-threshold", type=int, default=20)
    parser.add_argument("--repeat-window", type=int, default=4)
    args = parser.parse_args()

    levels = load_levels(Path(args.input))
    for lv in levels:
        ensure_metrics(lv)

    levels_by_star: Dict[int, List[dict]] = defaultdict(list)
    for lv in levels:
        levels_by_star[lv["stars"]].append(lv)

    repetition = find_repetition_v2(levels_by_star, min_run=max(3, args.repeat_window))
    spikes = find_curve_spikes_v2(levels_by_star, threshold=max(16, args.spike_threshold))
    fake_hard = find_fake_hard_v2(levels)

    out_dir = Path(args.output)
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "level_quality_report.md"
    json_path = out_dir / "level_quality_findings.json"

    report = build_report_md(levels, repetition, spikes, fake_hard)
    report_path.write_text(report, encoding="utf-8")
    json_path.write_text(
        json.dumps(
            {
                "repetition": repetition,
                "curve_spikes": spikes,
                "fake_hard": fake_hard,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Done. report={report_path} json={json_path}")
    print(f"Counts: repetition={len(repetition)} spikes={len(spikes)} fake_hard={len(fake_hard)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
