# Core/UI Separation Refactor Plan

## Goal
Keep game rules and state transitions in `src/game/core.ts` pure-domain oriented, while moving DOM/visual side effects into dedicated UI bridge modules.

## Current Status (2026-04-03)
- Architecture is mixed: core/features still contain direct DOM writes.
- Positive baseline exists: React bridges, app orchestrators, host bridge, and E2E gates are already in place.

## Target Boundary
- Core layer (`src/game/**` domain logic):
  - allowed: state calculation, rule checks, action history, persistence decisions
  - disallowed: `document.*`, `innerHTML`, `classList`, direct style writes
- UI bridge layer (`src/game/*UiBridge.ts`, `src/app/ui/**`, `src/react/**`):
  - owns DOM wiring, view state projection, modal/overlay toggles, animations
- Platform bridge (`src/platform/**`):
  - wrapper/host integration only

## Phases
1. **Phase A (low-risk extraction)**
   - Extract repeated chrome-level UI operations from `core.ts` into `coreUiBridge.ts`.
   - No behavior change.
2. **Phase B (input and HUD projection)**
   - Move note/continuous-fill/lives/pause HUD rendering to bridge.
3. **Phase C (effect choreography isolation)**
   - Move ripple/flash/error animation DOM operations to effect bridge.
4. **Phase D (guardrails)**
   - Add lint/CI rule to block new direct DOM in core domain files.

## Acceptance Criteria per Phase
- `npm run typecheck` passes.
- `npm run test:e2e:smoke` passes.
- No new direct DOM operations added in `core.ts` for the moved concern.

## Rollback Strategy
- Each phase is isolated and revertable by file-level rollback.
- No simultaneous gameplay rule changes in the same patch.

