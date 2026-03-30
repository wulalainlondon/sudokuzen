#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, List

LOCALES = [
    "en",
    "zh_Hant",
    "zh",
    "de",
    "es",
    "es_419",
    "fr",
    "ja",
    "ko",
    "pt",
    "pt_BR",
]

TECH_ORDER = [
    "naked_single",
    "hidden_single",
    "locked_candidates",
    "naked_pair",
    "hidden_pair",
    "naked_triple",
    "hidden_triple",
    "x_wing",
    "finned_x_wing",
    "skyscraper",
    "xy_wing",
    "xyz_wing",
    "w_wing",
    "unique_rectangle",
    "x_cycle_simple_coloring",
    "swordfish",
    "finned_swordfish",
    "naked_quad",
    "jellyfish",
    "aic",
]

TECH_DISPLAY = {
    "naked_single": ("裸單", "Naked Single"),
    "hidden_single": ("隱單", "Hidden Single"),
    "locked_candidates": ("區塊互鎖", "Locked Candidates"),
    "naked_pair": ("裸對", "Naked Pair"),
    "hidden_pair": ("隱對", "Hidden Pair"),
    "naked_triple": ("裸三", "Naked Triple"),
    "hidden_triple": ("隱三", "Hidden Triple"),
    "x_wing": ("X-Wing", "X-Wing"),
    "finned_x_wing": ("魚鰭 X-Wing", "Finned X-Wing"),
    "skyscraper": ("摩天樓", "Skyscraper"),
    "xy_wing": ("XY-Wing", "XY-Wing"),
    "xyz_wing": ("XYZ-Wing", "XYZ-Wing"),
    "w_wing": ("W-Wing", "W-Wing"),
    "unique_rectangle": ("唯一矩形", "Unique Rectangle"),
    "x_cycle_simple_coloring": ("簡單染色", "Simple Coloring"),
    "swordfish": ("劍魚", "Swordfish"),
    "finned_swordfish": ("魚鰭劍魚", "Finned Swordfish"),
    "naked_quad": ("裸四", "Naked Quad"),
    "jellyfish": ("水母", "Jellyfish"),
    "aic": ("AIC 鏈", "AIC"),
}

PREREQ = {
    "naked_single": [],
    "hidden_single": ["naked_single"],
    "locked_candidates": ["hidden_single"],
    "naked_pair": ["locked_candidates"],
    "hidden_pair": ["naked_pair"],
    "naked_triple": ["hidden_pair"],
    "hidden_triple": ["naked_triple"],
    "x_wing": ["hidden_triple"],
    "finned_x_wing": ["x_wing"],
    "skyscraper": ["x_wing"],
    "xy_wing": ["skyscraper"],
    "xyz_wing": ["xy_wing"],
    "w_wing": ["xyz_wing"],
    "unique_rectangle": ["w_wing"],
    "x_cycle_simple_coloring": ["unique_rectangle"],
    "swordfish": ["x_cycle_simple_coloring"],
    "finned_swordfish": ["swordfish"],
    "naked_quad": ["finned_swordfish"],
    "jellyfish": ["naked_quad"],
    "aic": ["jellyfish"],
}


def _pick_example_from_steps(
    sequence: Dict,
    level: Dict,
    step_index: int,
    zh_name: str,
    en_name: str,
) -> Dict:
    steps = sequence["steps"]
    start = max(0, step_index - 1)
    end = min(len(steps), start + 3)
    picked = steps[start:end]
    teach_steps = []
    for step in picked:
        teach_steps.append(
            {
                "text_i18n": {
                    "zh_Hant": f"觀察{zh_name}的高亮結構，執行標示的消去或填值。",
                    "en": f"Observe the highlighted {en_name} structure and apply the marked move.",
                },
                "focus_cells": step.get("focus_cells", []),
                "highlight_digits": step.get("highlight_digits", {}),
                "eliminate_cells": step.get("eliminate_cells", []),
            }
        )
    return {
        "board": picked[0]["board_before"] if picked else sequence["initial_board"],
        "given": level["puzzle"],
        "notes": picked[0]["board_before_notes"] if picked else {},
        "steps": teach_steps,
    }


def _pick_practice_from_step(step: Dict, level: Dict, zh_name: str, en_name: str) -> Dict:
    eliminates = step.get("eliminate_cells") or []
    pattern_cells = step.get("focus_cells") or []
    return {
        "board": step.get("board_before", level["puzzle"]),
        "given": level["puzzle"],
        "notes": step.get("board_before_notes", {}),
        "answer": {
            "eliminates": eliminates,
            "pattern_cells": pattern_cells,
            "description_i18n": {
                "zh_Hant": f"找出{zh_name}的目標候選並完成消去。",
                "en": f"Find the target candidates in {en_name} and eliminate them.",
            },
        },
        "solution": level["solution"],
    }


def _expand_i18n_text_map(raw: Dict[str, str]) -> Dict[str, str]:
    en = raw.get("en", "").strip()
    zh_hant = raw.get("zh_Hant", en).strip() or en
    zh = raw.get("zh", zh_hant).strip() or zh_hant
    out = {loc: en for loc in LOCALES}
    out["zh_Hant"] = zh_hant
    out["zh"] = zh
    return out


def _normalize_examples_and_practice(
    examples: List[Dict],
    practice_items: List[Dict],
) -> None:
    for example in examples:
        for step in example.get("steps", []):
            text_i18n = step.get("text_i18n") or {}
            step["text_i18n"] = _expand_i18n_text_map(
                {
                    "en": text_i18n.get("en", ""),
                    "zh_Hant": text_i18n.get("zh_Hant", ""),
                    "zh": text_i18n.get("zh", ""),
                }
            )
    for practice in practice_items:
        answer = practice.get("answer") or {}
        desc = answer.get("description_i18n") or {}
        answer["description_i18n"] = _expand_i18n_text_map(
            {
                "en": desc.get("en", ""),
                "zh_Hant": desc.get("zh_Hant", ""),
                "zh": desc.get("zh", ""),
            }
        )
        practice["answer"] = answer


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--levels", default="assets/data/levels.i18n.json")
    ap.add_argument("--steps", default="assets/data/level_steps.i18n.json")
    ap.add_argument("--teach-modules", default="assets/data/teach_modules.i18n.json")
    ap.add_argument("--output", default="assets/data/technique_library.i18n.json")
    ap.add_argument(
        "--report",
        default="reports/technique_library_level_candidates_1000.json",
    )
    args = ap.parse_args()

    root = Path(__file__).resolve().parents[1]
    levels = json.loads((root / args.levels).read_text(encoding="utf-8"))
    step_payload = json.loads((root / args.steps).read_text(encoding="utf-8"))
    teach_modules = json.loads((root / args.teach_modules).read_text(encoding="utf-8"))

    level_by_id = {int(lv["id"]): lv for lv in levels}
    seq_by_id = {int(seq["level_id"]): seq for seq in step_payload["levels"]}
    module_by_tech = {m["technique"]: m for m in teach_modules}

    tech_level_candidates = defaultdict(list)
    for lv in levels:
        lid = int(lv["id"])
        max_tech = lv.get("max_technique")
        if max_tech in TECH_ORDER:
            tech_level_candidates[max_tech].append(lid)
        seq = seq_by_id.get(lid)
        if not seq:
            continue
        used = {s.get("technique") for s in seq.get("steps", [])}
        for tech in used:
            if tech in TECH_ORDER and lid not in tech_level_candidates[tech]:
                tech_level_candidates[tech].append(lid)

    for tech in TECH_ORDER:
        tech_level_candidates[tech].sort(
            key=lambda lid: (
                level_by_id[lid].get("stars", 0),
                level_by_id[lid].get("difficulty_score", 0),
                lid,
            )
        )

    out = []
    for rank, tech in enumerate(TECH_ORDER, start=1):
        zh_name, en_name = TECH_DISPLAY[tech]
        candidates = tech_level_candidates[tech]
        rec_levels = candidates[:10]
        if len(rec_levels) < 10:
            needed = 10 - len(rec_levels)
            fallback = [int(lv["id"]) for lv in levels[: needed * 2]]
            for lid in fallback:
                if lid not in rec_levels:
                    rec_levels.append(lid)
                if len(rec_levels) >= 10:
                    break

        examples = []
        practice_items = []

        module = module_by_tech.get(tech)
        if module and module.get("example") is not None:
            examples.append(module["example"])
        if module:
            practice_items.extend(module.get("practice", [])[:3])

        for lid in candidates:
            seq = seq_by_id.get(lid)
            if not seq:
                continue
            steps = seq.get("steps", [])
            for idx, step in enumerate(steps):
                if step.get("technique") != tech:
                    continue
                if len(examples) < 2:
                    examples.append(
                        _pick_example_from_steps(
                            sequence=seq,
                            level=level_by_id[lid],
                            step_index=idx,
                            zh_name=zh_name,
                            en_name=en_name,
                        )
                    )
                if len(practice_items) < 3 and step.get("eliminate_cells"):
                    practice_items.append(
                        _pick_practice_from_step(
                            step=step,
                            level=level_by_id[lid],
                            zh_name=zh_name,
                            en_name=en_name,
                        )
                    )
                if len(examples) >= 2 and len(practice_items) >= 3:
                    break
            if len(examples) >= 2 and len(practice_items) >= 3:
                break

        while len(examples) < 2 and rec_levels:
            lid = rec_levels[min(len(examples), len(rec_levels) - 1)]
            seq = seq_by_id[lid]
            examples.append(
                _pick_example_from_steps(
                    sequence=seq,
                    level=level_by_id[lid],
                    step_index=0,
                    zh_name=zh_name,
                    en_name=en_name,
                )
            )

        while len(practice_items) < 3 and rec_levels:
            lid = rec_levels[min(len(practice_items), len(rec_levels) - 1)]
            seq = seq_by_id[lid]
            step = next(
                (s for s in seq.get("steps", []) if s.get("eliminate_cells")),
                seq["steps"][0],
            )
            practice_items.append(
                _pick_practice_from_step(
                    step=step,
                    level=level_by_id[lid],
                    zh_name=zh_name,
                    en_name=en_name,
                )
            )

        _normalize_examples_and_practice(examples, practice_items)

        out.append(
            {
                "technique_id": tech,
                "name_i18n": {
                    **{loc: en_name for loc in LOCALES},
                    "zh_Hant": zh_name,
                    "zh": zh_name,
                },
                "aliases_i18n": {
                    **{loc: [tech, en_name] for loc in LOCALES},
                    "zh_Hant": [tech, zh_name],
                    "zh": [tech, zh_name],
                },
                "summary_i18n": {
                    **{
                        loc: f"{en_name} is a core pattern used to locate key candidates and progress the board."
                        for loc in LOCALES
                    },
                    "zh_Hant": f"{zh_name}是用來定位關鍵候選並推進盤面的核心技巧。",
                    "zh": f"{zh_name}是用来定位关键候选并推进盘面的核心技巧。",
                },
                "difficulty_rank": rank,
                "prerequisites": PREREQ.get(tech, []),
                "when_to_use_i18n": {
                    **{
                        loc: [
                            "When basic singles are exhausted and the board stalls.",
                            "When candidates form a verifiable structural pattern.",
                            "When eliminating a cluster of candidates can unlock progress.",
                        ]
                        for loc in LOCALES
                    },
                    "zh_Hant": [
                        "當你已排除基礎單值後，盤面仍卡住。",
                        "候選在特定結構中形成可驗證關係。",
                        "你需要一次消去多個候選以打開後續單值。",
                    ],
                    "zh": [
                        "当你已排除基础单值后，盘面仍卡住。",
                        "候选在特定结构中形成可验证关系。",
                        "你需要一次消去多个候选以打开后续单值。",
                    ],
                },
                "common_mistakes_i18n": {
                    **{
                        loc: [
                            "Treating visually similar cells as the same pattern without constraints.",
                            "Focusing on local notes and ignoring cross-unit links.",
                            "Applying the technique before prerequisite checks are satisfied.",
                        ]
                        for loc in LOCALES
                    },
                    "zh_Hant": [
                        "把視覺相似但不滿足條件的格子誤判為同一結構。",
                        "只看局部候選，忽略跨宮/跨列關係。",
                        "未先驗證先修條件就直接套用技巧。",
                    ],
                    "zh": [
                        "把视觉相似但不满足条件的格子误判为同一结构。",
                        "只看局部候选，忽略跨宫/跨列关系。",
                        "未先验证先修条件就直接套用技巧。",
                    ],
                },
                "examples": examples[:2],
                "practice_items": practice_items[:3],
                "recommended_level_ids": rec_levels[:10],
            }
        )

    output = root / args.output
    output.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

    report = {
        "total_techniques": len(out),
        "techniques": [
            {
                "technique_id": item["technique_id"],
                "candidate_count": len(tech_level_candidates[item["technique_id"]]),
                "recommended_level_ids": item["recommended_level_ids"],
            }
            for item in out
        ],
    }
    (root / args.report).write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"generated techniques={len(out)} -> {output}")
    print(f"wrote candidate report -> {root / args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
