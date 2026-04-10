# W6 Sprint Backlog

## Track A — Validator False-Positive Fix
- Owner: Agent A
- Files:
  - `scripts/validate-teach-data.mjs`
  - `tests/teach-data-validation.spec.ts`
- Tasks:
  1. Update interactivity notice condition to consider `fills`.
  2. Clean obsolete baseline notices.
  3. Update tests for strict pass/fail based on new rule.

## Track B — CI Command Path
- Owner: Agent B
- Files:
  - `package.json`
- Tasks:
  1. Add `check:ci` script using strict teach validation + existing checks.
  2. Keep local `check` unchanged.

## Track C — QA Verification
- Owner: Agent C
- Files:
  - none (verification only)
- Tasks:
  1. Run `validate:teach`, `validate:teach:ci`, `check:ci`.
  2. Report pass/fail and blockers.
