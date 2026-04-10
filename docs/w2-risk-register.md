# W2 Risk Register

This register tracks the delivery risks for W2 on top of the current repo baseline and the W1 outcomes already present in the tree. It is intentionally self-contained so other workers can edit code or docs in parallel without needing to rewrite this file.

## Baseline

The current repo already contains the main W1 verification surfaces, including `e2e/replay-end-to-end.spec.ts`, `e2e/hud-technique-hint.spec.ts`, `e2e/offline-sw.spec.ts`, `e2e/teach-lazy-load.spec.ts`, `e2e/mobile-layout-audit.spec.ts`, `tests/core-ui-bridge.spec.ts`, `tests/i18n.spec.ts`, and `tests/levels-refresh-throttle.spec.ts`. W2 risks below assume that baseline and focus on regressions, integration drift, and release-gate gaps around those surfaces.

## Scope and Status Model

Probability and impact are tracked as `L`, `M`, or `H`.

- `Probability`: likelihood of the risk materializing within the W2 window.
- `Impact`: expected severity if the risk materializes.
- `Status`: `open`, `watching`, `mitigating`, `blocked`, or `closed`.

## Risk Register

| ID | Risk | Probability | Impact | Trigger | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| W2-R01 | Replay history shape drifts from the persisted `sudoku_records` contract, so historical replay opens with missing cells, empty steps, or broken step navigation. | M | H | `e2e/replay-end-to-end.spec.ts` fails on open/step/back/autoplay, or a completed game no longer reconstructs a valid replay board. | Keep replay opening code tolerant to partial records, pin replay fixture shape in tests, and treat record schema edits as a breaking change with a migration note. | Worker C | watching |
| W2-R02 | Long replay histories become slow enough to cause UI jank or Playwright timeouts, especially on lower-end mobile viewports. | M | M | Replay step/back/autoplay becomes sluggish, progress updates lag behind, or the replay test exceeds its timeout budget. | Keep replay rendering incremental, cap expensive DOM work per step, and preserve a short-path benchmark case in the replay test suite. | FE / QA | open |
| W2-R03 | The highest-required-technique HUD hint shows the wrong label, a raw key, or a mismatched tier when level metadata changes. | M | H | `#level-tech-hint` displays an untranslated token, the wrong technique name, or a tier that disagrees with the current level metadata. | Use `setLevelTechniqueHint` as the only renderer path, keep `techMap` coverage in sync with level data, and require a targeted test whenever `maxTechnique` or `techTier` changes. | Worker C | watching |
| W2-R04 | Missing technique metadata is not handled with a safe fallback, so the hint area becomes blank, clipped, or visually misleading. | L | M | A level without `maxTechnique` or `techTier` still reaches the HUD and the fallback is empty, broken, or hard to read. | Always render the `prelevel.techUnknown` fallback, preserve layout space for the hint area, and keep fallback coverage in `tests/core-ui-bridge.spec.ts` and `e2e/hud-technique-hint.spec.ts`. | FE | mitigating |
| W2-R05 | Teach manifest or shard versioning drifts, so lazy-load fetches resolve against stale assets or fail to find the expected module. | M | H | `e2e/teach-lazy-load.spec.ts` fails on module count, shard fetch, or `?v=` version validation, or the teach overlay remains stuck in loading. | Treat `public/teach/manifest.json` as a release asset, keep shard version query params intact, and keep the lazy-load test as a release gate. | Worker C / QA | open |
| W2-R06 | Service worker cache versioning becomes stale relative to the built assets, causing offline sessions to load old UI or mismatched runtime code. | M | H | Offline revisit still serves a prior app shell, or a fresh build does not refresh the cache name and asset list. | Keep `sw.template.js` and built `sw.js` in sync with app versioning, verify cache invalidation on a clean profile, and run the offline smoke after any PWA asset change. | Infra / Worker C | watching |
| W2-R07 | Offline startup works online but fails after the browser is truly offline, usually because a startup dependency was not cached or the boot path assumes live network access. | M | H | `e2e/offline-sw.spec.ts` fails to render `#level-screen` after `context.setOffline(true)`, or cached manifests cannot be read after refresh. | Preserve the current startup cache list, keep startup dependencies on the network-first path only when cached fallback exists, and verify first-load plus offline-revisit behavior in the same run. | QA | watching |
| W2-R08 | Small-screen layouts regress, clipping the replay modal, HUD hint, or core board on 393-412px wide devices. | M | M | `e2e/mobile-layout-audit.spec.ts` reports horizontal overflow, invisible controls, or cropped screenshots on Note20 / i14 Pro / i16 Pro sizes. | Keep fixed-width components bounded, test the current small-device viewport set on every UI edit, and avoid introducing new absolute-positioned overlays without mobile review. | FE | mitigating |
| W2-R09 | Locale coverage drifts, so translated surfaces show raw keys or mixed-language text in the release build. | M | M | `tests/i18n.spec.ts` fails, or a user-visible string is added without a matching key in the active locale table. | Require `tests/i18n.spec.ts` in the release checklist, keep new copy in the locale files first, and avoid shipping untranslated tokens in W1/W2 surfaces. | QA / FE | open |
| W2-R10 | Release validation is skipped or only partially run, allowing a regression to slip through despite a passing unit test slice. | M | H | A PR lands with code changes but without the full W2 validation set, or the handoff notes do not include command output. | Make the W2 QA checklist mandatory for sign-off, record which commands were run, and block release if the functional, device, cache, and locale checks are incomplete. | PM / QA | open |
| W2-R11 | Parallel worker edits collide in docs, tests, or generated output, leading to contradictory instructions or duplicate coverage. | M | M | A second worker rewrites the same doc section, a new test duplicates an existing scenario, or comments in the handoff disagree with the actual scripts. | Keep W2 edits file-scoped, avoid touching W1 docs unless required, and record changed file paths plus the exact commands used in the final handoff. | Worker C | watching |
| W2-R12 | Shared localStorage or app-version state leaks between runs, making replay, teach, or offline tests non-deterministic. | M | M | A repeated test run fails only on rerun, stale `sudoku_records` remain in storage, or the app version key is not preserved during cleanup. | Keep test setup clearing storage intentionally, preserve only the app version key when required, and prefer isolated fixtures for replay and teach flows. | QA | watching |
| W2-R13 | The build/deploy path diverges from local dev, so a release passes locally but fails under the Firebase hosting or base-path setup. | L | H | `npm run build` passes but `npm run build:firebase` or a deployed preview breaks asset resolution, manifests, or service worker registration. | Validate the Firebase build path before release, check that asset URLs resolve under the deployed base path, and keep any host-specific issue out of the main gameplay code. | Infra | open |

## 24h Escalation Flow

The 24h rule is the default threshold for any blocker that prevents W2 progress.

1. At first detection, log the blocker with the exact failing command, the affected surface, the first broken assertion, and the current owner.
2. Within the first hour, try one focused mitigation path and one fallback path. If both fail, mark the item `blocked`.
3. From 0 to 24 hours, keep the work isolated, capture a minimal repro, and avoid broad refactors that do not directly attack the blocker.
4. At 24 hours, escalate to the PM lead and the dependency owner with the blocker ID, reproduction steps, attempted mitigations, and the decision required to unblock.
5. If the blocker affects release scope, publish the release risk the same day and separate blocked work from still-shippable work.
6. At 48 hours, if the dependency is still unresolved, re-scope the deliverable or ship an explicit exception instead of letting the blocker silently extend.

Escalation summary:

- `0-24h`: investigate, isolate, and try fallback paths.
- `24h+`: escalate with a decision request and explicit unblock requirement.
- `48h+`: re-scope or exception-track the unresolved dependency.

## Daily Tracking Fields

Each standup update for a W2 risk should capture the following fields so the register can be traced back to concrete work.

| Field | Purpose |
|---|---|
| Date | The standup date in `YYYY-MM-DD` format. |
| Owner | The person responsible for the update. |
| Workstream | The affected area, such as replay, HUD, offline cache, i18n, or release gating. |
| Yesterday | The concrete work completed since the last update. |
| Today | The next intended action for the current day. |
| Blockers | Any issue preventing progress, with a pointer to the risk ID if applicable. |
| Risk IDs | One or more linked risks from the register above. |
| ETA | The expected completion or unblock time. |
| Validation | The check used to confirm the work is done or safe to merge. |
| Decision Needed | Any input required from another worker or lead. |

## Operating Rule

When a risk changes meaningfully, update probability, impact, and status in the same edit so the register stays current and does not become an archive of stale assumptions.
