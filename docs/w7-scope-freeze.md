# W7 Scope Freeze (M1: Mastery Dashboard)

## Goal
Launch v1 Learning Dashboard inside Stats modal so players can see teach/practice mastery progress by technique.

## In Scope
1. Add mastery aggregation data model (teach-read, practice-done, progress ratio).
2. Add new Stats tab: Learning.
3. Show top actionable items (e.g., unread teach modules, unfinished practice techs).
4. Add unit tests for aggregation and tab rendering.

## Out of Scope
1. Replay AI diagnosis report (M2).
2. New backend telemetry pipeline.
3. Content authoring updates for teach-data.

## Exit Criteria
1. `npm run check` pass.
2. Stats modal has `Overview / Learning / Achievements`.
3. Mastery panel renders with deterministic data from localStorage.
