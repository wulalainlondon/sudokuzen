# W8 Scope Freeze (M1 Phase 2: Mastery Ranking & Risk Alerts)

## Goal
Upgrade Learning Dashboard from basic counters to actionable coaching:
1) technique mastery ranking
2) learning risk alerts

## In Scope
1. Data model extension in `computeLearningStats()`:
   - technique-level progress ranking
   - low-mastery/risk list
2. UI extension in Stats Learning tab:
   - "Top Mastered Techniques"
   - "Risk Alerts"
3. i18n completion for new labels in 4 locales.

## Out of Scope
1. New backend telemetry storage.
2. Replay diagnosis narrative (belongs to M2).

## Exit Criteria
1. `npm run check` pass.
2. Learning tab shows ranking and risk sections with deterministic local data.
