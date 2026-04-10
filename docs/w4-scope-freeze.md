# W4 Scope Freeze (Data Governance & Replay Reliability)

## Goal
Stabilize data integrity paths after W3 by enforcing teach-data quality policy, unifying replay-history sanitization across cloud/local merge flows, and hardening replay e2e behavior against flaky assumptions.

## In Scope
1. Teach-data validator policy upgrade:
   - Add strict mode switch for notices (`TEACH_VALIDATE_STRICT=1`).
   - Keep default non-blocking behavior locally.
   - Add tests proving both strict and non-strict behavior.
2. Replay sanitize unification:
   - Reuse `src/shared/records/levelRecords.ts` sanitization in Firebase record normalization path.
   - Ensure merged local/cloud records never persist unsanitized replay actions.
   - Add focused tests for merge/normalization.
3. Replay e2e stability:
   - Ensure “mistake filter” test has deterministic assertion path.
   - Keep existing user-visible behavior unchanged.

## Out of Scope
1. Re-authoring full teach-data content.
2. New gameplay features.
3. Firestore schema migration.

## Exit Criteria
1. `npm run check` passes.
2. Target e2e replay/teach/hud set passes.
3. No regressions in replay modal open/play/filter flows.
