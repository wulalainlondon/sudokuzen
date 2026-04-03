# Frontend Architecture Rules

This document defines mandatory frontend rules for the mixed legacy + React runtime.

## R1: Single Owner Rule

- One DOM region must have exactly one owner at runtime.
- Owners are either:
  - Legacy DOM renderer (imperative render functions), or
  - React portal/component tree.
- Forbidden:
  - React and legacy both mutating the same host subtree in the same screen state.
- Required:
  - Use explicit takeover flags (for example `document.body.dataset.reactNormalLevelList = '1'`) before dispatching refresh events to React-owned regions.

## R2: Refresh Contract Rule

- Refresh events must be non-destructive:
  - Do not clear-and-rebuild whole lists if stable content exists.
  - Do not swap to skeleton placeholders for ordinary refreshes.
- Every refresh channel must implement:
  - Frame coalescing (`requestAnimationFrame` queue),
  - Signature dedupe (skip render when state signature unchanged).
- Allowed skeleton usage:
  - First load only (no prior content).

## R3: Platform Boundary Rule

- Platform-specific behavior must be isolated behind a platform boundary.
- Forbidden:
  - Scattered platform checks across feature/game modules.
- Required:
  - Keep PWA registration/update flow in `src/pwa/*`.
  - Keep desktop/Steam behavior in `src/steam/*` and platform helpers.
  - Entry/bootstrap layer decides whether to initialize platform adapters.

## R4: State Mutation Rule

- `gs` is a shared mutable singleton; treat it as infrastructure state.
- Forbidden:
  - Arbitrary writes from unrelated UI layers.
- Required:
  - Prefer writing `gs` through feature/core actions and bridge functions.
  - New UI modules should call actions/bridges, not mutate core fields directly.

## R5: Async Side-Effect Rule

- External side effects (Firebase listeners, timers, intervals, animation loops) must be:
  - cancellable,
  - idempotent/reentrant-safe,
  - paired with cleanup on teardown.
- Required:
  - Keep unsubscribe handles and clear existing listeners before re-subscribing.
  - Guard repeated startup paths.

## R6: UI Performance Budget Rule

- Large list/grid updates must avoid full re-mounts and full DOM replacement.
- Required:
  - Incremental rendering for long lists (`visibleCount` / paging),
  - Refresh cost bounded to state changes,
  - No layout-thrashing loops in high-frequency paths.

## R7: Regression Test Rule

- Every bug fix touching render/update flow must ship with a regression test.
- Required:
  - Unit/integration test for event coalescing and refresh behavior.
  - Add a Playwright scenario for user-visible flicker when feasible.

## Rule Change Process

- Changes to R1-R7 require:
  - rationale in PR description,
  - updated docs,
  - at least one reviewer ack for architecture impact.
