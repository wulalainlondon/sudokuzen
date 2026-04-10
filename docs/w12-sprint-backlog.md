# W12 Sprint Backlog

## Track A — Recommendation Payload Pass-through
- Owner: Agent A
- Files:
  - `src/react/replay/ReplayModal.tsx`
- Tasks:
  1. Keep `moduleId` in normalized recommendation structure.
  2. Add guarded open-teach helper callable per recommendation item.

## Track B — Recommendation CTA UI
- Owner: Agent B
- Files:
  - `src/react/replay/ReplayModal.tsx`
  - `style.css` (minimal)
- Tasks:
  1. Add "Open Module" CTA for items with moduleId.
  2. Ensure replay closes and teach opens without crash.

## Track C — i18n
- Owner: Agent C
- Files:
  - `src/i18n/locale/zh-TW.ts`
  - `src/i18n/locale/en.ts`
  - `src/i18n/locale/ja.ts`
  - `src/i18n/locale/de.ts`
- Tasks:
  1. Add CTA/fallback strings for recommendation open action.
