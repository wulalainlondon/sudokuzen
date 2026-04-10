# W6 Scope Freeze (Teach Notice Cleanup & CI Tightening)

## Goal
Remove false-positive teach notices and tighten CI gate so strict mode is practical without baseline debt.

## In Scope
1. Teach validator rule correction:
   - A practice item is interactive when `answer.eliminates` or `answer.fills` has at least one action.
2. Strict-mode baseline debt reduction:
   - Remove obsolete built-in baseline notices tied to eliminate-only assumption.
3. CI script tightening:
   - Add `check:ci` entry that uses strict teach validation path.

## Out of Scope
1. Teach content rewrite.
2. Gameplay logic changes.

## Exit Criteria
1. `npm run validate:teach` pass.
2. `npm run validate:teach:ci` pass.
3. `npm run check:ci` pass.
