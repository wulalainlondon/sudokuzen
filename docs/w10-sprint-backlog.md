# W10 Sprint Backlog

## Track A — Diagnosis Focus Payload
- Owner: Agent A
- Files:
  - `src/features/replay.ts`
  - `src/react/replay/replayStore.ts`
  - `src/react/replay/replayBridge.ts`
  - `tests/replay-diagnosis.spec.ts`
- Tasks:
  1. Add learning-focus field in diagnosis payload.
  2. Keep deterministic output and update tests.

## Track B — Replay CTA to Learning
- Owner: Agent B
- Files:
  - `src/react/replay/ReplayModal.tsx`
  - `style.css` (if needed)
- Tasks:
  1. Add CTA button in diagnosis card.
  2. On click, open Stats modal and switch to `learning` tab.

## Track C — i18n
- Owner: Agent C
- Files:
  - `src/i18n/locale/zh-TW.ts`
  - `src/i18n/locale/en.ts`
  - `src/i18n/locale/ja.ts`
  - `src/i18n/locale/de.ts`
- Tasks:
  1. Add diagnosis-focus and CTA labels.
