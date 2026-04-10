# W5 Scope Freeze (CI Guardrails & Replay Determinism)

## Goal
Convert W4 outcomes into CI-usable guardrails and reduce residual replay test flakiness.

## In Scope
1. Teach validator CI strategy:
   - Add strict/baseline mode so CI can block *new* notices without failing on known backlog immediately.
2. Replay persistence hardening:
   - Sanitize replay payload before writing records to local storage.
3. Replay autoplay e2e stabilization:
   - Replace fixed-time wait with condition-based completion assertion.

## Out of Scope
1. Full teach content rewrite.
2. Gameplay/mechanics changes.
3. Firestore schema changes.

## Exit Criteria
1. `npm run check` pass.
2. target e2e replay/teach/hud pass with `--workers=1 --retries=0`.
