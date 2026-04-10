# W6 Risk Register

## R1 — Validator rule change hides real issues
- Probability: Low
- Impact: Medium
- Mitigation:
  - Keep strict checks for `patternCells` and answer structure unchanged.
  - Add tests covering eliminate-only, fill-only, and empty-both cases.

## R2 — CI script divergence from local check
- Probability: Medium
- Impact: Medium
- Mitigation:
  - Keep `check` for local developer ergonomics.
  - Introduce explicit `check:ci` with strict teach mode.
