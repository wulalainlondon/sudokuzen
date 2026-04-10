# W1 Sprint Backlog

## Scope

W1 focuses on the highest-risk product surface that is already present in the repo: `features/teach`, `replay`, and the Playwright E2E gate in `tests/e2e` / `e2e`. The goal is to land usable replay visualization, keep teach flows reliable, and make the regression surface stable enough for parallel work.

## Prioritization Rules

P0 items block the W1 outcome if they slip. P1 items are important for product quality and should follow immediately after the critical path. P2 items are valuable but can be deferred if capacity is tight.

## Backlog

| Priority | Item | Owner | Est. Hours | Dependencies | Risks |
|---|---|---:|---:|---|---|
| P0 | Ship replay visualization MVP in `src/react/replay/ReplayModal.tsx`, `src/react/replay/replayStore.ts`, and `src/features/replay.ts` so a completed game can be reviewed step-by-step with clear state transitions. | FE | 12 | Replay history shape from current game flow; modal rendering; state bridge between React and legacy runtime. | Replay state drift from live game state; controls can become inconsistent if step/play/reset are not coalesced. |
| P0 | Make replay end-to-end coverage deterministic in `e2e/replay-end-to-end.spec.ts`, including open, step forward/back, auto-play, and reset paths. | QA | 6 | Replay MVP implementation; stable test fixtures; existing `sudoku_records` persistence. | Flaky timing around animation and async UI updates; long-running playback can time out in CI. |
| P0 | Close the teach load path for W1 by hardening `src/features/teach/state/teachStore.ts`, `src/features/teach/lib/teachDataAdapter.ts`, and `e2e/teach-lazy-load.spec.ts` against missing shard or manifest failures. | FE | 8 | Teach manifest and shard loading; current lazy-load bridge; fallback data availability. | Broken remote or cached data can leave the modal stuck in loading; dev/prod behavior may diverge. |
| P0 | Surface the “highest required technique” hint in the main game HUD, aligned with level metadata and the current level screen. | FE | 5 | Level metadata source; HUD rendering ownership; any existing technique labels already in `features/levels` or related state. | Incorrect mapping between level and hint can mislead players; display placement may conflict with mobile layout. |
| P1 | Add a replay fixture strategy so W1 tests do not depend on incidental current records, including a minimal save/load fixture for replay history. | Data | 6 | Replay serialization format; `sudoku_records` schema; existing level 1 deterministic path. | Fixture mismatch with production record shape; replay test becomes brittle if schema evolves. |
| P1 | Improve teach practice handoff from demo to exercise in `src/features/teach/components/TeachOverlay.tsx`, `PracticeBoard.tsx`, and `TeachBoard.tsx`. | FE | 8 | Teach modal flow; practice state; existing lesson step definitions. | Users may drop out if the handoff feels abrupt; the bridge can duplicate state if not cleaned up carefully. |
| P1 | Expand E2E smoke coverage for teach and replay adjacency so the product can verify “teach open -> practice -> replay” as a single path. | QA | 7 | Teach lazy-load tests; replay test harness; stable app bootstrap. | Combined flows are more fragile than isolated tests; a single UI change can affect multiple assertions. |
| P1 | Audit offline/cache behavior for teach and replay assets so the app keeps loading predictably after refresh and offline restart. | FE/QA | 6 | Service worker cache rules; teach shard URLs; replay modal assets. | Cache versioning mistakes can create stale or partially loaded states; offline tests may be environment-sensitive. |
| P2 | Clean up replay and teach docs so the product and QA expectations match the current implementation and test suite. | QA | 3 | Final W1 implementation details. | Documentation can lag implementation if written too early. |
| P2 | Add a small debug helper for replay/teach state inspection to reduce manual repro time during W1. | FE | 4 | React bridge access; current E2E hooks and runtime globals. | Debug-only helpers may leak into production if not gated cleanly. |

## W1 Daily Milestones

| Day | Milestone | Exit Signal |
|---|---|---|
| Day 1 | Lock the replay and teach implementation plan, verify current file ownership, and define the exact replay state contract. | We have a shared shape for replay history and a clear owner per surface. |
| Day 2 | Implement the replay visualization MVP and wire the core controls. | A completed game can be opened in replay modal and stepped manually. |
| Day 3 | Harden teach loading and practice handoff, then wire the highest-technique HUD hint. | Teach flow opens reliably and the main HUD shows the correct technique cue. |
| Day 4 | Expand and stabilize E2E coverage for replay, teach, and offline-adjacent paths. | CI-grade tests cover the critical paths without obvious flake. |
| Day 5 | Polish, fix edge cases, and close remaining gaps in docs and QA notes. | W1 can be handed off with known risks documented and no blocking regressions open. |

## Critical Path

The W1 critical path is:

1. Replay history contract is confirmed.
2. Replay visualization MVP is implemented.
3. Replay E2E coverage is stable.
4. Teach load/handoff is hardened.
5. Highest-technique HUD hint is wired to the current level state.
6. Smoke coverage confirms the teach/replay path still works after integration.

Anything outside that path should not block W1 release readiness unless it directly affects replay correctness, teach reliability, or the Playwright gate.

## Notes For Parallel Workers

Keep replay changes isolated to `src/react/replay` and `src/features/replay.ts` unless the state contract absolutely requires a broader change. Keep teach work inside `src/features/teach/**` and only touch `tests/e2e` when the behavior under test actually changes. That keeps parallel edits compatible and reduces merge conflict risk.
