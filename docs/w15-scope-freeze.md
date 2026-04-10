# W15 Scope Freeze (Learning Loop Attribution + Funnel v1)

## Goal
Upgrade the learning loop from aggregate counters to attributable funnel metrics so PM can evaluate recommendation quality by source and module.

## In Scope
1. Add attribution fields for recommendation click/completion events:
   - source context (`replay`/future extensible)
   - module id
   - technique key (when available)
2. Add local funnel aggregates:
   - clicks by module
   - completions by module
   - completion rate by module
   - next-day return rate (overall)
3. Surface a compact "Top converting modules" section in Stats > Learning.
4. Add deterministic tests for attribution aggregation and ranking.

## Out of Scope
1. Cloud sync / remote analytics pipeline.
2. Cohort analysis and long-window retention.
3. Recommendation algorithm re-ranking.

## Exit Criteria
1. `npm run check` pass.
2. Learning tab shows module-level conversion ranking (top list).
3. Attribution aggregation is covered by unit tests.
