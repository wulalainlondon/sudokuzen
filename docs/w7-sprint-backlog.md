# W7 Sprint Backlog

## Track A — Mastery Data Aggregation
- Owner: Agent A
- Files:
  - `src/features/stats.ts`
  - `tests/stats-achievements.spec.ts` (or new focused spec)
- Tasks:
  1. Add `computeLearningStats()` (teach read / practice done / per-tech progress).
  2. Expose data for Stats React modal consumption.
  3. Add tests for edge cases (empty data, partial data, complete data).

## Track B — Stats Learning Tab UI
- Owner: Agent B
- Files:
  - `src/react/stats/statsStore.ts`
  - `src/react/stats/StatsModal.tsx`
  - `style.css` (only if minimal style needed)
- Tasks:
  1. Add `learning` tab state and button.
  2. Render Learning panel using aggregated data.
  3. Keep existing Overview/Achievement behavior unchanged.

## Track C — i18n + QA
- Owner: Agent C
- Files:
  - `src/i18n/locale/zh-TW.ts`
  - `src/i18n/locale/en.ts`
  - `src/i18n/locale/ja.ts`
  - `src/i18n/locale/de.ts`
  - tests if needed
- Tasks:
  1. Add new `stats.learning*` strings for all locales.
  2. Run target validation (`typecheck`, `test`, `check`).
