# W5 Risk Register

## R1 — CI strict mode causes immediate pipeline failures
- Probability: Medium
- Impact: High
- Mitigation:
  - Baseline known notices and only block regressions/new notices in CI mode.

## R2 — Replay sanitize at write-time changes stored payload size/shape
- Probability: Low
- Impact: Medium
- Mitigation:
  - Reuse shared sanitizer contract and preserve scoring comparison logic.

## R3 — Replay autoplay remains timing-sensitive in CI
- Probability: Medium
- Impact: Medium
- Mitigation:
  - Use condition-based wait instead of fixed duration sleep.
