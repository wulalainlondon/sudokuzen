# W1 Risk Register

This document tracks delivery, quality, and operational risks for W1. It is intended to stay compatible with parallel worker edits: the content is self-contained and does not depend on code changes.

## Scope and Status Model

Probability and impact are tracked as `L`, `M`, or `H`.

- `Probability`: likelihood of the risk materializing within the current W1 window.
- `Impact`: expected severity if the risk materializes.
- `Status`: `open`, `watching`, `mitigating`, `blocked`, or `closed`.

Historical signals from `progress.md` were used to seed this register, including Playwright and network setup limits, Firebase configuration gaps, and cache/version invalidation issues.

## Risk Register

| ID | Risk | Category | Probability | Impact | Trigger | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|---|
| W1-R01 | Playwright or browser automation cannot run reliably in the current environment, so visual or e2e validation is delayed. | Technical | H | H | Browser launch fails, screenshot capture stalls, or test scripts require networked package install. | Keep a local smoke-test path, use short-burst runs, record repro steps, and fall back to static verification when browser tooling is unavailable. | Worker C | watching |
| W1-R02 | Network-restricted setup blocks dependency installation or browser downloads, which prevents test execution and fresh tool setup. | Deployment | H | H | `npm install`, Playwright install, or any setup step fails with DNS/ENOTFOUND or download timeout. | Maintain offline-compatible scripts, pre-check cached dependencies, and document alternate validation flows that do not require fresh downloads. | Worker C | open |
| W1-R03 | Firebase configuration remains incomplete or inconsistent, causing leaderboards, scoring, or remote writes to fail in production-like runs. | Deployment | M | H | Missing `firebase-config.js` values, failed Firestore access, or setup instructions are not followed. | Gate Firebase-dependent features behind explicit config checks, keep setup docs current, and verify with a minimal end-to-end write/read path before release. | Infra / Worker C | mitigating |
| W1-R04 | Cache or service worker versioning becomes stale, causing old assets or logic to persist after deploy. | Deployment | M | H | Users report outdated UI after release, forced refresh is required, or version-bump logic is bypassed. | Treat version changes as release-critical, bump app and cache versions together, and verify invalidation on a clean browser profile. | Worker C | watching |
| W1-R05 | Unique-solution or puzzle validation scripts become too slow at scale, delaying regression checks for the full level set. | Technical | M | H | Verification time rises sharply, repeated runs are needed, or caches stop producing expected speedups. | Keep cache hit/miss metrics, run targeted subsets during iteration, and reserve full verification for release gating. | Worker C | open |
| W1-R06 | New level generation or import data contains invalid puzzles, duplicate solutions, or mismatched answers. | Data | M | H | Import scripts produce inconsistent clue counts, solver checks fail, or generated sets do not match expected difficulty bands. | Validate every imported batch with uniqueness and solution checks, store reports beside generated data, and quarantine suspicious batches before merging. | Worker C | open |
| W1-R07 | UI layout changes regress card sizing, grid dimensions, or page stability across breakpoints. | Quality | M | M | Screenshots show stretched cards, shifting grid height, or inconsistent layout after state changes. | Keep size-synchronization logic isolated, add regression screenshots, and compare key breakpoints after each visual change. | Frontend owner | mitigating |
| W1-R08 | Cross-worker edits collide in shared docs or generated assets, causing accidental overwrite or contradictory instructions. | Process | M | M | Two workers modify adjacent sections, generated artifacts are regenerated from different baselines, or docs disagree on the same rule. | Keep changes file-scoped, avoid rewriting unrelated sections, and record handoff notes in each touched document. | Worker C | watching |
| W1-R09 | Release timing slips because validation, tuning, or environment setup takes longer than expected. | Schedule | M | H | A blocker remains unresolved for a full day, or repeated verification cycles consume planned work time. | Track blockers daily, escalate unresolved items at 24h, and split release-critical work from nice-to-have polish. | PM / Worker C | open |
| W1-R10 | Firebase or cache-related changes are deployed without matching client-side assumptions, producing inconsistent behavior across sessions. | Deployment | M | H | One client sees the new feature while another remains on the old cache, or backend writes expect fields the client does not send. | Add release notes for schema and cache changes, verify backward compatibility, and test with a fresh profile plus a warm-cache profile. | Infra | watching |
| W1-R11 | Historical bug fixes are not preserved in regression coverage, allowing a previously solved issue to reappear. | Quality | M | M | A known issue is mentioned in `progress.md` but no test or checklist covers it in the current branch. | Maintain a bug-to-test mapping, require at least one regression check per fix, and carry forward the exact repro scenario. | QA / Worker C | open |
| W1-R12 | Tooling or docs drift from reality, so future workers follow stale instructions and waste time on broken paths. | Process | L | M | A documented command no longer works, or setup notes omit a required step from the current environment. | Update docs immediately after a failing workflow is confirmed, and prefer concise operational notes over speculative guidance. | Worker C | watching |

## Blocker Escalation Flow

The 24h rule is the default escalation threshold for any blocker that prevents progress on a W1 deliverable.

1. At blocker detection, log the blocker in the daily standup notes with the affected task, first failure point, and current owner.
2. Within the first hour, attempt one focused mitigation path and one fallback path. If both fail, mark the item `blocked`.
3. If the blocker is still active after 24 hours, escalate it immediately to the project lead and the relevant dependency owner. Include the exact failure mode, attempted mitigations, and the next decision needed.
4. If the blocker affects release scope, add a release-risk note the same day and separate blocked work from unblocked work so the team can keep moving.
5. If the blocker is external and has no internal workaround, document the dependency, the requested action, and the latest acceptable decision time.
6. Once a blocker is resolved, record the fix path and any preventive action so the same issue is not re-opened without new evidence.

Escalation rule summary:

- `0-24h`: investigate, isolate, and try fallback paths.
- `24h+`: escalate, assign a decision owner, and state the unblock requirement.
- `48h+`: re-scope if the dependency is still unresolved.

## Daily Standup Tracking Fields

Each daily standup entry should capture the following fields so risks can be traced back to concrete work items.

| Field | Purpose |
|---|---|
| Date | The standup date in `YYYY-MM-DD` format. |
| Owner | The person responsible for the update. |
| Workstream | The affected area, such as UI, data, deployment, or verification. |
| Yesterday | The concrete work completed since the last standup. |
| Today | The next intended action for the current day. |
| Blockers | Any issue preventing forward progress, with a pointer to the risk ID if applicable. |
| Risk IDs | One or more linked risks from the register above. |
| ETA | The expected completion or unblock time. |
| Validation | The check used to confirm the work is done or safe to merge. |
| Decision Needed | Any input required from another worker or lead. |

## Suggested Operating Rule

Use this register as a living document. When a risk changes meaningfully, update probability, impact, and status in the same edit so the register stays current and does not become a stale archive.
