# W14 Sprint Backlog

## Track A — Replay Step Deep-Link
- Owner: Core
- Files:
  - `src/entities/teach.ts`
  - `src/features/teach/state/teachStore.ts`
  - `src/features/teach/bridge/legacyTeachBridge.ts`
  - `src/react/replay/ReplayModal.tsx`
  - `tests/teach-store.spec.ts`
- Tasks:
  1. Extend teach open API with open options.
  2. Replay source defaults to stepping mode and first interactive step.
  3. Keep legacy fallback path compatible.

## Track B — Learning Loop Telemetry
- Owner: Core
- Files:
  - `src/storage/keys.ts`
  - `src/features/stats.ts`
  - `src/react/stats/StatsModal.tsx`
  - `tests/stats-learning.spec.ts`
- Tasks:
  1. Add local telemetry model and record APIs.
  2. Record click at replay recommendation CTA.
  3. Record completion at replay-launched teach close.
  4. Record next-day return when opening learning tab.
  5. Surface metrics in Learning tab.

## Track C — i18n
- Owner: Core
- Files:
  - `src/i18n/locale/zh-TW.ts`
  - `src/i18n/locale/en.ts`
  - `src/i18n/locale/ja.ts`
  - `src/i18n/locale/de.ts`
- Tasks:
  1. Add Learning Loop labels for new metric cards.
