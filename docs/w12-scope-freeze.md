# W12 Scope Freeze (Diagnosis Recommendation Deep-Link)

## Goal
Enable direct opening of the recommended teach module from Replay diagnosis recommendations.

## In Scope
1. Recommendation payload keeps module id in UI-normalized structure.
2. Replay recommendation item CTA opens teach module directly.
3. i18n labels for recommendation CTA and fallback.

## Out of Scope
1. Auto-start practice mode after opening teach.
2. Cross-session recommendation history.

## Exit Criteria
1. `npm run check` pass.
2. From Replay diagnosis, clicking recommendation opens matching teach module.
