#!/usr/bin/env python3
"""
檢查數獨題目是否有唯一解。

用法：
1) 直接在程式內呼叫 has_unique_solution(grid)
2) 命令列讀檔：
   python sudoku_unique_checker.py puzzle.txt

puzzle.txt 格式（9 行，每行 9 個字元）：
- 0 或 . 代表空格
- 1~9 代表已知數字
"""

from __future__ import annotations

import sys
from typing import List, Tuple

Grid = List[List[int]]


def parse_grid(lines: List[str]) -> Grid:
    if len(lines) != 9:
        raise ValueError("需要 9 行輸入")
    grid: Grid = []
    for row in lines:
        row = row.strip()
        if len(row) != 9:
            raise ValueError("每行必須剛好 9 個字元")
        parsed_row: List[int] = []
        for ch in row:
            if ch in ("0", "."):
                parsed_row.append(0)
            elif ch.isdigit() and "1" <= ch <= "9":
                parsed_row.append(int(ch))
            else:
                raise ValueError(f"非法字元: {ch}")
        grid.append(parsed_row)
    return grid


def is_valid_move(grid: Grid, r: int, c: int, n: int) -> bool:
    if any(grid[r][j] == n for j in range(9)):
        return False
    if any(grid[i][c] == n for i in range(9)):
        return False
    br, bc = (r // 3) * 3, (c // 3) * 3
    for i in range(br, br + 3):
        for j in range(bc, bc + 3):
            if grid[i][j] == n:
                return False
    return True


def find_best_empty_cell(grid: Grid) -> Tuple[int, int, List[int]] | None:
    """
    找候選數最少的空格（MRV），加速搜尋。
    回傳 (row, col, candidates)；若無空格回傳 None。
    """
    best = None
    best_candidates: List[int] = []
    for r in range(9):
        for c in range(9):
            if grid[r][c] != 0:
                continue
            candidates = [n for n in range(1, 10) if is_valid_move(grid, r, c, n)]
            if not candidates:
                return (r, c, [])
            if best is None or len(candidates) < len(best_candidates):
                best = (r, c)
                best_candidates = candidates
                if len(best_candidates) == 1:
                    return (r, c, best_candidates)
    if best is None:
        return None
    return (best[0], best[1], best_candidates)


def has_unique_solution(grid: Grid) -> bool:
    """
    回傳 True 代表唯一解，False 代表無解或多解。
    """
    solutions = 0

    def dfs() -> None:
        nonlocal solutions
        if solutions >= 2:
            return
        next_cell = find_best_empty_cell(grid)
        if next_cell is None:
            solutions += 1
            return

        r, c, candidates = next_cell
        if not candidates:
            return

        for n in candidates:
            grid[r][c] = n
            dfs()
            grid[r][c] = 0

    # 先檢查已填數字是否互相衝突
    original = [row[:] for row in grid]
    for r in range(9):
        for c in range(9):
            v = original[r][c]
            if v == 0:
                continue
            grid[r][c] = 0
            if not is_valid_move(grid, r, c, v):
                grid[r][c] = v
                return False
            grid[r][c] = v

    dfs()
    return solutions == 1


def main() -> int:
    if len(sys.argv) != 2:
        print("用法: python sudoku_unique_checker.py puzzle.txt")
        return 1

    path = sys.argv[1]
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = [line.rstrip("\n") for line in f if line.strip()]
        grid = parse_grid(lines)
        unique = has_unique_solution(grid)
        if unique:
            print("唯一解: 是")
        else:
            print("唯一解: 否（可能無解或多解）")
        return 0
    except Exception as e:
        print(f"錯誤: {e}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
