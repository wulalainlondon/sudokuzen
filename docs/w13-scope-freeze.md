# W13 Scope Freeze (Replay Source Context in Teach)

## Goal
Close the loop from Replay diagnosis to Teach by preserving launch source context and showing it in Teach overlay.

## In Scope
1. Add `replay` as a supported teach launch source.
2. Replay recommendation open path launches teach with replay source.
3. Teach overlay displays a replay-origin context label when source is replay.
4. Add focused regression tests for source behavior.

## Out of Scope
1. Auto-jump to specific step or practice question inside teach.
2. Persist replay context across sessions.
3. New recommendation ranking logic.

## Exit Criteria
1. `npm run check` pass.
2. From Replay recommendation CTA, teach opens with replay source context visible.
3. Existing tier/library launch paths remain unchanged.
