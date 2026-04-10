# W11 Sprint Backlog

## Track A — Recommendation Data
- Owner: Agent A
- Files:
  - `src/features/replay.ts`
  - `tests/replay-diagnosis.spec.ts`
- Tasks:
  1. Add `recommendations` list to diagnosis payload.
  2. Map focus type to candidate techniques/modules from teach data.
  3. Keep deterministic ordering.

## Track B — Recommendation UI
- Owner: Agent B
- Files:
  - `src/react/replay/ReplayModal.tsx`
  - `style.css` (minimal)
- Tasks:
  1. Show recommendation list in diagnosis card.
  2. Keep current CTA and fallback behavior.

## Track C — i18n
- Owner: Agent C
- Files:
  - `src/i18n/locale/zh-TW.ts`
  - `src/i18n/locale/en.ts`
  - `src/i18n/locale/ja.ts`
  - `src/i18n/locale/de.ts`
- Tasks:
  1. Add labels for recommendation title/empty state/item meta.
