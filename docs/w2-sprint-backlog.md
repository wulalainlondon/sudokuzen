# W2 Sprint Backlog

## Scope

W2 is the stabilization and release-prep sprint that builds on W1. The focus is to finish the replay, teach, and HUD surfaces that already exist in the repo, then harden the E2E and Vitest coverage so the team can ship without cross-worker regressions.

W1 defined the product shape in `docs/w1-scope-freeze.md` and the risk surface in `docs/w1-risk-register.md`. W2 assumes that scope is frozen and shifts the work from feature completion to integration quality, deterministic validation, and release readiness.

## Prioritization Rules

P0 items are release blockers for W2. P1 items are important for product quality and should follow the critical path. P2 items are useful cleanup or support work that should not block release.

## Backlog

| Priority | Item | Owner | Est. Hours | Dependencies | Risks | Acceptance Signal |
|---|---|---|---:|---|---|---|
| P0 | Lock the replay state contract across `src/features/replay.ts`, `src/react/replay/ReplayModal.tsx`, and `src/react/replay/replayStore.ts` so step, back, auto-play, speed, and reset all agree on one history model. | FE | 10 | W1 replay implementation; current `sudoku_records` replay history shape; React bridge mounting. | State drift between legacy game state and replay state can make controls diverge or replay data unreadable. | `e2e/replay-end-to-end.spec.ts` can open a completed game, step forward/back, auto-play, and reset without desync. |
| P0 | Stabilize replay persistence and fixture setup so replay tests no longer depend on incidental current saves or hidden localStorage state. | QA / Data | 6 | Replay history contract; localStorage schema; test bootstrap reset logic. | Flaky records or stale browser state can make the replay gate non-deterministic in CI. | `tests` and `e2e/replay-end-to-end.spec.ts` both read a predictable replay history from a known setup path. |
| P0 | Harden teach lazy-load and legacy bridge behavior in `src/features/teach/state/teachStore.ts`, `src/features/teach/lib/teachDataAdapter.ts`, and `src/features/teach/bridge/legacyTeachBridge.ts` so shard fetch, sync fallback, and overlay open all converge. | FE | 12 | Teach manifest/shard loading; `public/teach/*.json`; existing fallback blob behavior. | Missing shard data or bridge mismatch can leave the modal stuck in loading or silently fail in dev/prod divergence. | `e2e/teach-lazy-load.spec.ts` opens the teach overlay, loads a module, and falls back cleanly when network fetch is unavailable. |
| P0 | Verify the HUD technique hint end-to-end through `src/game/coreUiBridge.ts` and `e2e/hud-technique-hint.spec.ts`, including missing-metadata fallback and layout safety. | FE / QA | 6 | Level metadata source; HUD DOM wiring; W1 hint baseline. | Incorrect mapping or fallback text can mislead players and can regress mobile layout if the hint grows unexpectedly. | The hint renders for a normal level, shows a readable fallback when metadata is absent, and remains visible in the gameplay shell. |
| P0 | Establish a W2 release gate runbook that pins the exact replay, teach, and HUD validations required before merge or deploy. | PM / QA | 4 | Stable E2E paths; stable Vitest paths; agreement on release scope. | If the gate is vague, workers will validate different subsets and release confidence will be inconsistent. | A single documented gate exists and references the exact commands and tests listed in the Release Gate section below. |
| P1 | Improve teach demo-to-practice handoff in `src/features/teach/components/TeachOverlay.tsx`, `TeachBoard.tsx`, and `PracticeBoard.tsx` so the transition from explanation to action is explicit and not jarring. | FE | 8 | Teach store state transitions; lesson step data; practice session state. | The flow can feel abrupt or duplicate state if demo cleanup and practice initialization are not synchronized. | A lesson can move from demo steps to practice mode without losing progress, and the practice entry state is visible and coherent. |
| P1 | Cover teach behavior with focused unit tests in `tests/teach-store.spec.ts`, `tests/teach-lazy-load.spec.ts`, `tests/teach-data-validation.spec.ts`, and `tests/teach-data-registry.spec.ts`. | QA | 7 | Teach adapter and store behavior; current teach JSON content; fallback scenarios. | Regression risk rises if only E2E checks are used and the module shape changes underneath. | Unit tests prove that fallback, normalization, and registry loading stay stable across expected module shapes. |
| P1 | Confirm replay and teach overlays remain usable on mobile and small desktop breakpoints by tightening `e2e/mobile-layout-audit.spec.ts`, `tests/teach-overlay-layout.spec.ts`, and the React overlay containers. | FE / QA | 7 | Current overlay CSS; replay modal structure; teach overlay layout rules. | A visually correct modal can still block gameplay or overflow the viewport on small screens. | Overlay centering, max-height, and scroll behavior stay within viewport bounds on the audited breakpoints. |
| P1 | Add regression coverage for replay and teach interaction boundaries, including `tests/core-ui-bridge.spec.ts`, `e2e/undo.spec.ts`, and `e2e/practice-mode.spec.ts`, so UI bridge changes do not break core input or hint rendering. | QA / FE | 7 | Existing core UI bridge; replay/teach input routing; current note and undo behavior. | Bridge changes can unintentionally alter input handling, modal close behavior, or hint projection. | Core UI bridge tests still pass while replay/teach overlays are open and do not interfere with normal game input. |
| P2 | Add a small debug aid for replay and teach state inspection so worker triage can confirm board state, step index, and module metadata without stepping through the UI manually. | FE | 4 | React bridge globals; replay store; teach store. | Debug helpers can leak into production if not guarded, and they may encourage manual inspection over real tests. | A dev-only helper exposes replay and teach state snapshots without affecting production builds. |
| P2 | Align W2 docs with the actual test surface by updating references in `docs/w1-sprint-backlog.md`, `docs/w1-scope-freeze.md`, and this file when the release path changes. | PM / QA | 3 | Finalized W2 release gate; confirmed test paths; any scope clarifications from W1. | Docs can drift if they are updated before implementation settles. | The backlog and release gate match the current repo test paths and do not mention retired commands. |
| P2 | Add a short operator note for cross-worker compatibility that tells contributors to keep replay, teach, and HUD edits file-scoped and avoid broad test rewrites. | PM | 2 | Shared sprint ownership; current file layout. | Broad edits increase merge conflict risk and can overwrite another worker's in-flight work. | The note is present and explicitly tells workers to confine changes to the relevant feature or test slice. |

## W2 Daily Milestones

| Day | Milestone | Exit Signal |
|---|---|---|
| Day 1 | Confirm the replay history contract, teach fallback path, and HUD hint data source, then freeze the exact release gate commands. | Owners agree on the interfaces and the validation list is written down before code churn starts. |
| Day 2 | Complete replay state stabilization and fixture setup, then verify the replay E2E path end to end. | A completed game can be reopened in replay and exercised without test-specific hacks. |
| Day 3 | Harden teach loading, bridge behavior, and practice handoff, then run the teach-focused unit and E2E paths. | Teach opens reliably, falls back safely, and proceeds through demo-to-practice without dead ends. |
| Day 4 | Tighten HUD technique hint behavior and mobile overlay layout, then confirm the UI remains readable at narrow breakpoints. | The hint and overlays stay usable on desktop and mobile while preserving current gameplay input. |
| Day 5 | Run the release gate, fix only release-blocking issues, and finalize docs and handoff notes. | All required replay/teach/hud checks pass and the sprint can be handed off with no open P0s. |

## Critical Path

The W2 critical path is:

1. Confirm the replay state and history contract.
2. Stabilize replay persistence and fixture setup.
3. Harden teach lazy-load and bridge fallback.
4. Verify the HUD technique hint path and missing-metadata fallback.
5. Run the replay, teach, and HUD release gate.
6. Close only release-blocking issues and preserve the existing test surface.

Anything outside that path should not block W2 release readiness unless it directly affects replay correctness, teach reliability, HUD accuracy, or the Playwright/Vitest gate.

## Release Gate

W2 release gate is explicitly marked here and must be treated as mandatory before merge or deploy:

1. `npm run typecheck`
2. `npm run test`
3. `npm run test:e2e:replay`
4. `npx playwright test e2e/teach-lazy-load.spec.ts e2e/hud-technique-hint.spec.ts`
5. `npx playwright test e2e/replay-end-to-end.spec.ts e2e/teach-lazy-load.spec.ts e2e/hud-technique-hint.spec.ts`
6. `npm run test:e2e:smoke`
7. Required targeted Vitest specs: `tests/teach-store.spec.ts`
8. Required targeted Vitest specs: `tests/teach-lazy-load.spec.ts`
9. Required targeted Vitest specs: `tests/teach-data-validation.spec.ts`
10. Required targeted Vitest specs: `tests/teach-data-registry.spec.ts`
11. Required targeted Vitest specs: `tests/core-ui-bridge.spec.ts`
12. Required targeted Vitest specs: `tests/teach-overlay-layout.spec.ts`

Release gate rule:

- If any P0 item is failing, the release is blocked.
- If the gate passes but a P1 item regresses, the release can proceed only with an explicitly documented follow-up.
- If a P2 item regresses, do not block release unless it affects the gate or creates a merge conflict with another worker's active change.

## Notes For Parallel Workers

Keep replay work isolated to `src/features/replay.ts` and `src/react/replay/**` unless the state contract forces a broader change. Keep teach work inside `src/features/teach/**` and the teach-specific tests, and keep HUD work inside `src/game/coreUiBridge.ts` and the HUD-specific E2E path. Avoid rewriting unrelated docs or test files so parallel worker edits stay compatible.
