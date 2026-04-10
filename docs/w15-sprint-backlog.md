# W15 Sprint Backlog

## Track A — Telemetry Schema Upgrade
- Owner: Agent A
- Files:
  - `src/features/stats.ts`
  - `src/storage/keys.ts` (if schema version key needed)
- Tasks:
  1. Extend learning-loop metrics schema with module-level counters.
  2. Add safe migration/read fallback for existing W14 metrics.
  3. Provide selectors/helpers for funnel aggregation and ranking.

## Track B — Event Attribution Wiring
- Owner: Agent B
- Files:
  - `src/react/replay/ReplayModal.tsx`
  - `src/features/teach/state/teachStore.ts`
- Tasks:
  1. Record click with attribution payload (`source`, `moduleId`, optional `techniqueKey`).
  2. Record completion with matching attribution payload.
  3. Keep backward compatibility for calls without attribution payload.

## Track C — Learning Tab Funnel UI
- Owner: Agent C
- Files:
  - `src/react/stats/StatsModal.tsx`
  - `src/i18n/locale/zh-TW.ts`
  - `src/i18n/locale/en.ts`
  - `src/i18n/locale/ja.ts`
  - `src/i18n/locale/de.ts`
- Tasks:
  1. Add Top converting modules panel (name, clicks, completions, rate).
  2. Add graceful empty-state and fallback labels.
  3. Keep layout compact and consistent with current Learning tab.

## Track D — Validation
- Owner: Agent D
- Files:
  - `tests/stats-learning.spec.ts`
  - (optional) new focused tests under `tests/`
- Tasks:
  1. Add aggregation ranking tests.
  2. Add migration/backward-compat tests for legacy W14 metrics.
  3. Run `npm run check`.
