# W9 Scope Freeze (M2: Replay Diagnosis Report v1)

## Goal
Ship a first diagnostic report inside Replay modal so players get immediate, actionable feedback from replay data.

## In Scope
1. Build replay diagnosis summary from action history.
2. Surface diagnosis block in Replay modal.
3. Add i18n labels for diagnosis in 4 locales.

## Out of Scope
1. AI narrative coaching.
2. Remote analytics or backend storage.
3. Solver-heavy post-analysis.

## Exit Criteria
1. `npm run check` pass.
2. Replay modal shows diagnosis section after opening replay.
3. Diagnosis content is deterministic for same replay history.
