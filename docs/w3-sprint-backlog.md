# W3 Sprint Backlog

## Scope

W3 builds on the stabilized W2 baseline and shifts the team toward cross-surface integration, release hardening, and operational readiness. The current repo already has an established check flow through `npm run check`, `npm run test:e2e:smoke`, `npm run build`, `npm run release:check`, and the focused Playwright and Vitest slices used in W2. W3 uses that baseline instead of redefining it.

The sprint focus is to make the expanded gameplay surfaces behave as one coherent product: duo flow, wild flow, navigation and overlay orchestration, data contract stability, and the release automation that keeps those changes shippable across local and CI environments.

## Prioritization Rules

P0 items are release blockers for W3. P1 items are important for product quality and should follow the critical path. P2 items are useful cleanup or support work that should not block release.

## Backlog

| Priority | Item | Owner | Est. Hours | Dependencies | Risks | Acceptance Signal |
|---|---|---|---:|---|---|---|
| P0 | Lock the duo room and result-state contract across `src/features/duo/duoRoom.ts`, `src/features/duo/duoGame.ts`, `src/features/duo/duoRoomView.ts`, and `src/react/duoresult/DuoResultModal.tsx` so room creation, join/leave, match completion, and result rendering all use one consistent state model. | FE / QA | 12 | Duo lobby flow; room sync events; navigation bus; current result modal bridge. | State drift can split what players see from the authoritative room state, which would make match results unreliable and break synchronization. | `e2e/duo-sync.spec.ts` can create a room, join it, play through a match, and render the result modal without desync or stuck UI. |
| P0 | Stabilize the wild tutorial and mentor flow across `src/features/wild/wildTutorial.ts`, `src/features/wild/mentorDialogue.ts`, `src/features/wild/mentorDemo.ts`, `src/features/wild/mentorController.ts`, and `src/react/wild/*` so the tutorial starts, advances, and exits without dead ends. | FE | 10 | Wild skill metadata; mentor dialogue data; locale strings; overlay mounting. | Tutorial dead ends or mismatch between tutorial state and mentor UI can block onboarding and leave the wild mode unusable for first-time players. | `e2e/wild-mode.spec.ts` and `tests/wild-lobby-state.spec.ts` can drive tutorial start, progression, and exit while the mentor overlay remains responsive. |
| P0 | Harden navigation and overlay orchestration across `src/app/bootstrap.ts`, `src/app/navigation/navigationBus.ts`, `src/app/navigation/navigationOrchestrator.ts`, `src/app/ui/uiOrchestrator.ts`, and `src/react/AppShell.tsx` so the expanded surface set mounts only once and transitions cleanly between screens. | Platform / FE | 8 | App bootstrap order; modal lifecycle; current overlay stack; existing smoke routes. | A bad orchestration change can create duplicate mounts, stale overlays, or route transitions that only fail in CI or on slower devices. | `npm run test:e2e:smoke` still passes and no screen transition shows duplicate overlay mounts, broken back navigation, or zombie UI after close. |
| P0 | Freeze the release-data contract across `public/data/manifest.json`, `public/teach/manifest.json`, `src/data/dataRegistry.ts`, `src/game/persistence.ts`, and `src/storage/keys.ts` so build artifacts, cached assets, and local saves stay compatible. | Data / Infra | 8 | Existing manifest generation; teach shard packaging; save/load schema; service worker cache versioning. | A schema or manifest mismatch can make warm-cache sessions unreadable or create different behavior between local and deployed builds. | Fresh-profile and warm-profile runs both load the current app shell, data manifest, and saved state without manual cleanup. |
| P1 | Add focused duo coverage in `e2e/duo-sync.spec.ts`, `tests/duo-logic.spec.ts`, and `src/features/duo/index.ts` so room state, score updates, and lobby transitions remain deterministic under regression. | QA / FE | 8 | P0 duo state contract; test fixtures; room sync events. | Duo regressions are easy to miss if only one happy path is checked, especially when changes touch multiple room phases. | The targeted duo tests cover create, sync, reconnect, and teardown paths with stable assertions and no timing flake. |
| P1 | Expand wild-mode regression coverage in `e2e/wild-mode.spec.ts`, `tests/wild-autosolver.spec.ts`, `tests/wild-skill-detectors.spec.ts`, and `tests/wild-lobby-state.spec.ts` so tutorial, autosolver, detector logic, and lobby state all stay aligned. | QA | 7 | Wild tutorial stabilization; skill metadata; mentor controller flow. | Wild mode is highly coupled, so a change in one helper can accidentally break another surface that looks unrelated in review. | The wild smoke and unit slices pass together, and each failure points to a single feature slice instead of a broad bootstrap issue. |
| P1 | Verify locale coverage for the new duo and wild copy through `src/i18n/locale/*.ts` and `tests/i18n.spec.ts` so user-facing text does not fall back to raw keys in any shipped flow. | Localization / QA | 5 | Finalized copy strings; translated duo and wild labels; current locale accessor behavior. | Missing keys are easy to ship when a new overlay or result screen introduces fresh copy late in the sprint. | The locale test suite passes for active copy paths, and no visible Duo/Wild label renders as a raw key in the checked locales. |
| P1 | Confirm overlay stack usability on desktop and mobile for `src/react/prelevel/PreLevelModal.tsx`, `src/react/library/LibraryOverlay.tsx`, `src/react/mentor/MentorOverlay.tsx`, `src/react/gameover/GameOverOverlay.tsx`, and the new duo/wild surfaces so no modal blocks the core board. | FE / QA | 7 | Current overlay CSS; AppShell orchestration; mobile viewport coverage. | Overlay stacking bugs often survive unit tests and only appear as clipped content or blocked input on narrow viewports. | The mobile layout audit and focused overlay checks show no horizontal overflow, no clipped controls, and no blocked board interaction. |
| P2 | Add dev-only diagnostics for navigation, duo room state, and wild mentor state so worker triage can inspect session state without stepping through the UI manually. | FE | 4 | App bootstrap globals; room state store; mentor controller state. | Debug helpers can leak into production if they are not clearly gated, and they can encourage manual inspection over real coverage. | A dev-only inspection path is available in local builds and does not change production output or test behavior. |
| P2 | Align release documentation with the actual W3 command set by updating `docs/w2-qa-checklist.md`, the sprint backlog, and the release notes when the gate changes. | PM / QA | 3 | Final W3 gate definition; confirmed test slice names; scope decisions on duo and wild. | Docs can drift if they are updated before the final test surface settles, which makes handoff ambiguous. | The docs point to the same commands used in local validation, CI, and release-candidate checks. |
| P2 | Add a lightweight performance watch on the expanded surface set so bundle growth from duo, wild, and overlay work stays visible before it becomes a release problem. | Infra / QA | 5 | Release build output; current perf budget script; finalized W3 feature set. | Bundle or startup regressions can hide behind feature work until the final gate, which makes them expensive to unwind. | `npm run release:check` and `npm run build` stay within the expected budget and no new asset push causes a visible startup regression. |
| P2 | Keep parallel-worker edits isolated by documenting file-scoped ownership boundaries for duo, wild, navigation, and release-gate changes. | PM | 2 | Shared sprint ownership; final file list; existing branch hygiene. | Broad edits increase merge conflict risk and can overwrite another worker's in-flight work. | The note clearly tells contributors to keep changes inside the relevant feature slice and avoid unrelated refactors. |

## W3 Daily Milestones

| Day | Milestone | Exit Signal |
|---|---|---|
| Day 1 | Freeze the W3 scope, confirm the duo/wild/navigation ownership split, and write down the exact local and CI gate commands that must stay stable. | Everyone agrees on the state contract boundaries and the validation list before implementation churn starts. |
| Day 2 | Stabilize the duo room contract and the navigation/overlay orchestration, then verify the affected smoke paths still mount cleanly. | Duo rooms and screen transitions work without duplicate mounts or state drift. |
| Day 3 | Close the wild tutorial and mentor flow, then run the wild-specific unit and E2E slices. | Wild mode can enter, advance, and exit its onboarding flow without dead ends. |
| Day 4 | Tighten locale coverage and overlay layout for the expanded surface set, then run the mobile and copy regression slices. | New copy, modals, and overlays remain readable on desktop and mobile without blocking the board. |
| Day 5 | Run the release gate, fix only release-blocking issues, and finalize the handoff notes and docs updates. | The mandatory local and CI checks pass and the sprint can be released with no open P0s. |

## Critical Path

The W3 critical path is:

1. Freeze the release-data and room-state contracts.
2. Stabilize duo room sync and navigation orchestration.
3. Close the wild tutorial and mentor flow.
4. Verify locale and overlay behavior on the new surfaces.
5. Run the release gate with the correct local/CI split.
6. Resolve only release-blocking issues and keep parallel work scoped to the affected feature slice.

Anything outside that path should not block W3 release readiness unless it directly affects room sync, tutorial progression, navigation stability, data compatibility, or the release gate.

## Release Gate

W3 release gate is explicitly split into local validation, CI merge validation, and release-candidate validation.

### Local Validation

Use these commands during implementation and before asking for review:

1. `npm run check`
2. `npm run test:e2e:replay`
3. `npx playwright test e2e/duo-sync.spec.ts e2e/wild-mode.spec.ts e2e/hud-technique-hint.spec.ts`
4. `npx vitest run tests/duo-logic.spec.ts tests/wild-autosolver.spec.ts tests/wild-skill-detectors.spec.ts tests/wild-lobby-state.spec.ts tests/core-ui-bridge.spec.ts tests/i18n.spec.ts`
5. `npm run build`

Local validation is the fast feedback loop. If a change only touches one slice, run the targeted Playwright or Vitest slice first, then expand to `npm run check` before handing it off.

### CI Merge Validation

The current CI workflow already checks the following, and W3 keeps that contract intact:

1. `npx tsc --noEmit`
2. `npx eslint src/ tests/`
3. `npx prettier --check 'src/**/*.{ts,tsx}' 'tests/**/*.ts'`
4. `npx vitest run`
5. `npm run build`
6. `npm run test:e2e:smoke`

CI is the merge gate. Do not add scope-specific exceptions there; if a W3 item needs extra coverage, it should be added as a targeted command in the release-candidate gate or in the relevant test slice.

### Release-Candidate Validation

Use these commands before tagging or shipping a W3 candidate:

1. `npm run check`
2. `npm run test:e2e:replay`
3. `npx playwright test e2e/duo-sync.spec.ts e2e/wild-mode.spec.ts`
4. `npm run release:check`
5. `npm run release:check:live` only when the live deployment path is active and the environment is available

Release gate rule:

- If any P0 item is failing, the release is blocked.
- If the CI merge gate passes but a P1 item regresses, the release can proceed only with an explicitly documented follow-up.
- If a P2 item regresses, do not block release unless it affects the gate, the current data contract, or another worker's active change.
- If local validation and CI disagree, treat the CI result as the merge source of truth and keep the local slice as the faster debugging loop.

## Notes For Parallel Workers

Keep duo work isolated to `src/features/duo/**`, `src/react/duoresult/**`, and `e2e/duo-sync.spec.ts` unless the state contract forces a broader change. Keep wild work inside `src/features/wild/**`, `src/react/wild/**`, and the wild-specific tests. Keep navigation and overlay work inside `src/app/**` and the relevant modal or shell components, and avoid rewriting unrelated docs or test files so parallel worker edits stay compatible.
