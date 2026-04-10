# W5 Sprint Backlog

## Track A — Teach Validator CI Baseline
- Owner: Agent A
- Files:
  - `scripts/validate-teach-data.mjs`
  - `tests/teach-data-validation.spec.ts`
  - `package.json` (if script wiring needed)
- Tasks:
  1. Introduce baseline-aware strict mode for notices.
  2. Keep default local `validate:teach` behavior unchanged.
  3. Add/extend tests for baseline pass/fail behavior.

## Track B — Replay Persistence Sanitization
- Owner: Agent B
- Files:
  - `src/game/persistence.ts`
  - `tests/core-game-flow.spec.ts` (or focused new spec)
- Tasks:
  1. Sanitize replay history before record write.
  2. Preserve existing record update rules.
  3. Add test proving malformed action history is filtered on save.

## Track C — Replay Autoplay E2E De-flake
- Owner: Agent C
- Files:
  - `e2e/replay-end-to-end.spec.ts`
- Tasks:
  1. Replace brittle fixed timeout logic in autoplay test.
  2. Assert end-state via polling/waitForFunction.
  3. Keep test semantics unchanged.
