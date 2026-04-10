# W3 QA Checklist

This checklist is based on the current repo state and the W2 outcomes already present in the tree. It assumes the existing W2 baseline covers replay visualization, the highest-technique HUD hint, teach lazy-load, offline cache behavior, mobile layout audits, i18n tests, and refresh throttling.

## How To Use

Run the checks in order. If a command fails, record the exact failing step, the first broken assertion, and the browser or environment used. Do not count a partially completed run as passing.

## Functional Checks

| Check | Command | Pass condition | Local vs CI |
|---|---|---|---|
| Replay happy path | `npm run test:e2e:replay` | All replay scenarios pass, including replay generation, modal open, step forward, step back, autoplay, speed toggling, and reset. The replay board renders all 81 cells and does not deadlock at the final step. | Local: start `npm run dev` in a separate terminal, or set `CI=1` if you want Playwright to manage the server. CI: `CI=1` is already set, so the dev server starts automatically through `playwright.config.ts`. |
| HUD technique hint | `npx playwright test e2e/hud-technique-hint.spec.ts` | The hint is visible on a normal level, it resolves to a real technique label, and the missing-metadata path still shows a readable fallback instead of a blank or raw token. | Local: start `npm run dev` first, or run under `CI=1` so Playwright can manage the server. CI: headless browser, trace-on-retry, and screenshot-on-failure are enabled by config. |
| Teach lazy-load path | `npx playwright test e2e/teach-lazy-load.spec.ts` | The manifest loads, the shard fetch resolves, the overlay opens, and the fetch URL includes the manifest version query parameter. | Local: start `npm run dev` first, or set `CI=1` to use the managed server path. CI: the config launches `npm run dev` automatically. |
| Core hint and refresh unit coverage | `npx vitest run tests/core-ui-bridge.spec.ts tests/levels-refresh-throttle.spec.ts tests/teach-data-validation.spec.ts tests/teach-data-registry.spec.ts` | The HUD hint helper returns a translated label or a safe fallback, refresh notifications coalesce once per frame, and teach data validation passes for the shipped manifest/shards. | Local and CI are equivalent for Vitest; CI should still capture the exact command output so the passing slice is auditable. |

## Cross-Device Checks

| Check | Command | Pass condition | Local vs CI |
|---|---|---|---|
| Mobile layout audit | `npx playwright test e2e/mobile-layout-audit.spec.ts` | On the Note20, i14 Pro, and i16 Pro viewports there is no horizontal overflow, the stage map and tier view remain readable, and the replay and HUD surfaces do not clip the core board. | Local: start `npm run dev` first, then inspect the HTML report or screenshots if needed. CI: run headless only, relying on failure screenshots and trace artifacts rather than manual visual inspection. |

## Offline Checks

| Check | Command | Pass condition | Local vs CI |
|---|---|---|---|
| Service worker and cached startup assets | `npx playwright test e2e/offline-sw.spec.ts` | The initial online visit fetches `data/manifest.json` and at least one data shard, the teach manifest is fetched on startup, and the app still renders the level screen after `context.setOffline(true)` and a reload attempt. | Local: start `npm run dev` in a separate terminal, or set `CI=1` for the managed server path. CI should run this as a headless, server-managed check. |
| Firebase-hosted build path for PWA assets | `npm run build:firebase` | The build completes, the generated hosting output includes the current service worker and cache version, and the offline assets stay aligned with the built app shell. Use this for release candidates that will ship through Firebase Hosting. | Local may need Firebase CLI access and can be run selectively while iterating. CI should only run it in an environment that can perform the full build and smoke pass without interactive login. |

## i18n Checks

| Check | Command | Pass condition | Local vs CI |
|---|---|---|---|
| Locale accessor coverage | `npx vitest run tests/i18n.spec.ts` | `t()` returns the expected `zh-TW` strings, interpolation works, `setLocale()` switches the active locale, partial locales fall back to keys, and no new user-facing key is left without a valid translation path. | Local and CI are equivalent. If this fails in CI but not locally, treat it as a sign that a generated file or lockstep locale asset is stale. |
| Locale-sensitive UI copy | `npx vitest run tests/core-ui-bridge.spec.ts tests/i18n.spec.ts` | Technique hints and related UI copy resolve through the locale table instead of showing raw i18n keys. | Local is useful for quick iteration; CI should keep this paired with the release gate so translation regressions do not slip through. |

## Release Pre-Check

| Check | Command | Pass condition | Local vs CI |
|---|---|---|---|
| Full repo sanity gate | `npm run check` | `validate:teach`, typecheck, lint, format check, and the Vitest suite all pass with no unresolved errors. | Local is the fastest way to surface a coding error. CI should treat this as the default merge gate because it does not depend on browser state. |
| Smoke gate | `npm run test:e2e:smoke` | The level navigation, single-player full run, speedrun, offline SW, and wild-mode smoke suites all pass. | Local requires a running dev server unless you invoke it under `CI=1`. CI should use the managed-server path so the result is reproducible. |
| Release rules and perf budget | `npm run release:check` | The release rule script and performance budget check pass. Use `npm run release:check:live` only when a live configuration is required and available. | Local can run the non-live command during iteration. CI should use `release:check`; reserve `release:check:live` for a deploy-preview or release job with explicit network access and credentials. |
| Production build | `npm run build` | The build succeeds after version sync, teach data validation, teach build, data build, and Vite production build all complete without errors. | Local should use this before tagging a release candidate. CI should store the build logs and artifact hash so any later deploy mismatch can be traced. |

## Sign-Off Rule

QA is complete only when the functional, cross-device, offline, i18n, and release-precheck sections are all green, or when any remaining failures are explicitly documented as non-blocking with an owner, ETA, and follow-up command.
