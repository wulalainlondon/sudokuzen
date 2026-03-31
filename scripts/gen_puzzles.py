#!/usr/bin/env python3
"""Generate random sudoku puzzles with unique solutions.
Output: JSON array of {puzzle: int[81], solution: int[81]}
Usage: python3 gen_puzzles.py <count>
"""
import json
import sys
from sudokutools.generate import generate
from sudokutools.solve import bruteforce


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    results = []
    for _ in range(n):
        p = generate()
        sols = list(bruteforce(p))
        if len(sols) != 1:
            continue
        s = sols[0]
        puzzle = [p[r, c] for r in range(9) for c in range(9)]
        solution = [s[r, c] for r in range(9) for c in range(9)]
        results.append({"puzzle": puzzle, "solution": solution})
    json.dump(results, sys.stdout)


if __name__ == "__main__":
    main()
