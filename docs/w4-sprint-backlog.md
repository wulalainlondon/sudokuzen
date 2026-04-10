# W4 Sprint Backlog

## Track A — Teach Validation Governance
- Owner: Agent A
- Files:
  - `scripts/validate-teach-data.mjs`
  - `tests/teach-data-validation.spec.ts`
- Tasks:
  1. Add env-gated strict mode for notices.
  2. Keep current default output for local runs.
  3. Add tests validating strict=off and strict=on.
- Acceptance:
  - `node scripts/validate-teach-data.mjs` => pass
  - `TEACH_VALIDATE_STRICT=1 node scripts/validate-teach-data.mjs` => fails when notices exist

## Track B — Replay Sanitization in Cloud Merge
- Owner: Agent B
- Files:
  - `src/firebase/client.ts`
  - `tests/*` (new focused spec if needed)
- Tasks:
  1. Replace ad-hoc replayHistory array pass-through with shared sanitizer.
  2. Keep existing star/time/submission merge rule unchanged.
  3. Add tests for sanitized output when remote/local contain malformed replay actions.
- Acceptance:
  - `npm run test` includes passing spec for firebase normalize/merge replay history.

## Track C — Replay E2E Deterministic Gate
- Owner: Agent C
- Files:
  - `e2e/replay-end-to-end.spec.ts`
- Tasks:
  1. Make mistake-filter assertion deterministic without false negatives.
  2. Preserve existing end-user replay filter behavior.
- Acceptance:
  - `npx playwright test e2e/replay-end-to-end.spec.ts --workers=1 --retries=0` pass.
