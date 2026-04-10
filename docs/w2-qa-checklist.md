# W2 QA Checklist

This checklist is based on the current repo state and the W1 outcomes already present in the tree. It assumes the existing W1 baseline covers replay visualization, the highest-technique HUD hint, teach lazy-load, offline cache behavior, mobile layout audits, i18n tests, and refresh throttling.

## How To Use

Run the checks in order. If a command fails, record the exact failing step, the first broken assertion, and the browser or environment used. Do not count a partially completed run as passing.

## Functional Checks

| Check | Command | Pass condition |
|---|---|---|
| Replay happy path | `npm run test:e2e:replay` | All replay scenarios pass, including replay generation, modal open, step forward, step back, autoplay, speed toggling, and reset. The replay board renders all 81 cells and does not deadlock at the final step. |
| HUD technique hint | `npx playwright test e2e/hud-technique-hint.spec.ts` | The hint is visible on a normal level, it resolves to a real technique label, and the missing-metadata path still shows a readable fallback instead of a blank or raw token. |
| Teach lazy-load path | `npx playwright test e2e/teach-lazy-load.spec.ts` | The manifest loads, the shard fetch resolves, the overlay opens, and the fetch URL includes the manifest version query parameter. |
| Core hint and refresh unit coverage | `npx vitest run tests/core-ui-bridge.spec.ts tests/levels-refresh-throttle.spec.ts tests/teach-data-validation.spec.ts tests/teach-data-registry.spec.ts` | The HUD hint helper returns a translated label or a safe fallback, refresh notifications coalesce once per frame, and teach data validation passes for the shipped manifest/shards. |

## Cross-Device Checks

| Check | Command | Pass condition |
|---|---|---|
| Mobile layout audit | `npx playwright test e2e/mobile-layout-audit.spec.ts` | On the Note20, i14 Pro, and i16 Pro viewports there is no horizontal overflow, the stage map and tier view remain readable, and the replay / HUD surfaces do not clip the core board. |

## Offline Cache Checks

| Check | Command | Pass condition |
|---|---|---|
| Service worker and cached startup assets | `npx playwright test e2e/offline-sw.spec.ts` | The initial online visit fetches `data/manifest.json` and at least one data shard, the teach manifest is fetched on startup, and the app still renders the level screen after `context.setOffline(true)` and a reload attempt. |
| Firebase-hosted build path for PWA assets | `npm run build:firebase` | The build completes, the generated hosting output includes the current service worker and cache version, and the offline assets stay aligned with the built app shell. Use this for release candidates that will ship through Firebase Hosting. |

## Multi-Language Checks

| Check | Command | Pass condition |
|---|---|---|
| Locale accessor coverage | `npx vitest run tests/i18n.spec.ts` | `t()` returns the expected `zh-TW` strings, interpolation works, `setLocale()` switches the active locale, partial locales fall back to keys, and no new user-facing key is left without a valid translation path. |
| Locale-sensitive UI copy | `npx vitest run tests/core-ui-bridge.spec.ts tests/i18n.spec.ts` | Technique hints and related UI copy resolve through the locale table instead of showing raw i18n keys. |

## Release Pre-Check

| Check | Command | Pass condition |
|---|---|---|
| Full repo sanity gate | `npm run check` | `validate:teach`, typecheck, lint, format check, and the Vitest suite all pass with no unresolved errors. |
| Smoke gate | `npm run test:e2e:smoke` | The level navigation, single-player full run, speedrun, offline SW, and wild-mode smoke suites all pass. |
| Release rules and perf budget | `npm run release:check` | The release rule script and performance budget check pass. Use `npm run release:check:live` only when a live configuration is required and available. |
| Production build | `npm run build` | The build succeeds after version sync, teach data validation, teach build, data build, and Vite production build all complete without errors. |

## Sign-Off Rule

QA is complete only when the functional, cross-device, offline, multi-language, and release-precheck sections are all green, or when any remaining failures are explicitly documented as non-blocking with an owner, ETA, and follow-up command.
