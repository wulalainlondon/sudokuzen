# W9 Sprint Backlog

## Track A — Diagnosis Data + Bridge
- Owner: Agent A
- Files:
  - `src/features/replay.ts`
  - `src/react/replay/replayStore.ts`
  - `src/react/replay/replayBridge.ts`
  - `tests/replay-diagnosis.spec.ts` (new)
- Tasks:
  1. Implement deterministic diagnosis builder from replay actions.
  2. Add store/bridge field for diagnosis payload.
  3. Add unit tests for diagnosis output.

## Track B — Replay Modal Diagnosis UI
- Owner: Agent B
- Files:
  - `src/react/replay/ReplayModal.tsx`
  - `style.css` (minimal)
- Tasks:
  1. Render diagnosis card in replay modal.
  2. Keep existing controls/filter/list behavior unchanged.
  3. Defensive fallback when diagnosis payload missing.

## Track C — i18n
- Owner: Agent C
- Files:
  - `src/i18n/locale/zh-TW.ts`
  - `src/i18n/locale/en.ts`
  - `src/i18n/locale/ja.ts`
  - `src/i18n/locale/de.ts`
- Tasks:
  1. Add `replayDiagnosis.*` keys used by UI and data builder.
