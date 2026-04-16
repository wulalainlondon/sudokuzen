#!/usr/bin/env python3
"""
Generate Duo T00 puzzles: 30-36 givens, solvable by Naked Single + Hidden Single only.
Output: JSON array of {puzzle: int[81], solution: int[81]}
Usage: python3 scripts/gen-t00-puzzles.py <target_count>
"""
import json
import sys
import random
from copy import deepcopy


# ── Backtracking sudoku generator ────────────────────────────────────

def generate_solution():
    """Generate a complete valid sudoku grid."""
    grid = [0] * 81

    def possible(pos, digit):
        r, c = divmod(pos, 9)
        for i in range(9):
            if grid[r * 9 + i] == digit: return False
            if grid[i * 9 + c] == digit: return False
        br, bc = (r // 3) * 3, (c // 3) * 3
        for rr in range(br, br + 3):
            for cc in range(bc, bc + 3):
                if grid[rr * 9 + cc] == digit: return False
        return True

    def solve(pos=0):
        if pos == 81: return True
        if grid[pos] != 0: return solve(pos + 1)
        digits = list(range(1, 10))
        random.shuffle(digits)
        for d in digits:
            if possible(pos, d):
                grid[pos] = d
                if solve(pos + 1): return True
                grid[pos] = 0
        return False

    solve()
    return grid


def count_solutions(grid, limit=2):
    """Count solutions up to limit (early exit)."""
    count = [0]

    def possible(g, pos, digit):
        r, c = divmod(pos, 9)
        for i in range(9):
            if g[r * 9 + i] == digit: return False
            if g[i * 9 + c] == digit: return False
        br, bc = (r // 3) * 3, (c // 3) * 3
        for rr in range(br, br + 3):
            for cc in range(bc, bc + 3):
                if g[rr * 9 + cc] == digit: return False
        return True

    def solve(g, pos=0):
        if count[0] >= limit: return
        if pos == 81:
            count[0] += 1
            return
        if g[pos] != 0:
            solve(g, pos + 1)
            return
        for d in range(1, 10):
            if possible(g, pos, d):
                g[pos] = d
                solve(g, pos + 1)
                g[pos] = 0

    solve(grid[:])
    return count[0]


# ── Naked/Hidden Single solver ───────────────────────────────────────

def candidates(grid, pos):
    if grid[pos] != 0: return set()
    r, c = divmod(pos, 9)
    used = set()
    for i in range(9):
        if grid[r * 9 + i]: used.add(grid[r * 9 + i])
        if grid[i * 9 + c]: used.add(grid[i * 9 + c])
    br, bc = (r // 3) * 3, (c // 3) * 3
    for rr in range(br, br + 3):
        for cc in range(bc, bc + 3):
            if grid[rr * 9 + cc]: used.add(grid[rr * 9 + cc])
    return set(range(1, 10)) - used


def is_ns_hs_solvable(puzzle):
    """Return True if puzzle can be solved using only Naked Single + Hidden Single."""
    grid = puzzle[:]
    changed = True
    while changed:
        changed = False
        # Naked Single: only one candidate in a cell
        for pos in range(81):
            if grid[pos] != 0: continue
            cands = candidates(grid, pos)
            if len(cands) == 0: return False  # contradiction
            if len(cands) == 1:
                grid[pos] = next(iter(cands))
                changed = True

        # Hidden Single: digit appears in only one cell within a row/col/box
        # Rows
        for r in range(9):
            for d in range(1, 10):
                places = [c for c in range(9) if grid[r*9+c] == 0 and d in candidates(grid, r*9+c)]
                if len(places) == 1:
                    pos = r * 9 + places[0]
                    if grid[pos] == 0:
                        grid[pos] = d
                        changed = True
        # Cols
        for c in range(9):
            for d in range(1, 10):
                places = [r for r in range(9) if grid[r*9+c] == 0 and d in candidates(grid, r*9+c)]
                if len(places) == 1:
                    pos = places[0] * 9 + c
                    if grid[pos] == 0:
                        grid[pos] = d
                        changed = True
        # Boxes
        for br in range(3):
            for bc in range(3):
                cells = [br*3*9 + r*9 + bc*3 + c for r in range(3) for c in range(3)]
                for d in range(1, 10):
                    places = [p for p in cells if grid[p] == 0 and d in candidates(grid, p)]
                    if len(places) == 1:
                        if grid[places[0]] == 0:
                            grid[places[0]] = d
                            changed = True

    return all(v != 0 for v in grid)


# ── Main ─────────────────────────────────────────────────────────────

def main():
    target = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    min_givens = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    max_givens = int(sys.argv[3]) if len(sys.argv) > 3 else 36

    results = []
    seen = set()
    attempts = 0

    while len(results) < target:
        attempts += 1
        if attempts % 500 == 0:
            print(f"  [{attempts} attempts] collected: {len(results)}/{target}", file=sys.stderr)

        solution = generate_solution()
        if not solution or 0 in solution:
            continue

        # Decide how many givens to keep (random in range)
        num_givens = random.randint(min_givens, max_givens)
        # Randomly select which cells to keep
        positions = list(range(81))
        random.shuffle(positions)
        keep = set(positions[:num_givens])

        puzzle = [solution[i] if i in keep else 0 for i in range(81)]

        # Dedup
        key = tuple(puzzle)
        if key in seen:
            continue

        # Unique solution check
        if count_solutions(puzzle, limit=2) != 1:
            continue

        # NS/HS only check
        if not is_ns_hs_solvable(puzzle):
            continue

        seen.add(key)
        results.append({"puzzle": puzzle, "solution": solution})

    print(f"Done: {len(results)} puzzles in {attempts} attempts", file=sys.stderr)
    json.dump(results, sys.stdout)


if __name__ == "__main__":
    main()
