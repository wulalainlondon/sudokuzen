# W13 Sprint Backlog

## Track A — Source Propagation
- Owner: Agent A
- Files:
  - `src/entities/teach.ts`
  - `src/features/teach/bridge/legacyTeachBridge.ts`
  - `src/react/replay/ReplayModal.tsx`
- Tasks:
  1. Extend launch source type to include `replay`.
  2. Replay recommendation open flow passes `replay` source.
  3. Keep fallback open path and compatibility with legacy callers.

## Track B — Teach Source Indicator UI
- Owner: Agent B
- Files:
  - `src/features/teach/components/TeachOverlay.tsx`
  - `style.css`
- Tasks:
  1. Render replay-origin badge/callout only when source is `replay`.
  2. Keep visual changes minimal and non-invasive.

## Track C — i18n + Tests
- Owner: Agent B
- Files:
  - `src/i18n/locale/zh-TW.ts`
  - `src/i18n/locale/en.ts`
  - `src/i18n/locale/ja.ts`
  - `src/i18n/locale/de.ts`
  - `tests/teach-overlay-replay-source.spec.ts`
  - `tests/teach-store.spec.ts` (if needed)
- Tasks:
  1. Add replay source label translations.
  2. Add deterministic tests for replay-source indicator and source state behavior.
