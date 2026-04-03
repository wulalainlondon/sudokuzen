# PR Checklist

Use this checklist before merge.

- [ ] R1 Single Owner: touched UI regions have exactly one renderer owner.
- [ ] R2 Refresh Contract: no destructive refresh; refresh is coalesced + deduped.
- [ ] R3 Platform Boundary: platform-specific logic stays in platform layer.
- [ ] R4 State Mutation: new UI code does not directly mutate unrelated `gs` fields.
- [ ] R5 Async Side Effects: listeners/timers are cleaned up and reentry-safe.
- [ ] R6 Perf Budget: large list/grid changes avoid full re-mounts.
- [ ] R7 Regression Tests: includes at least one regression test for bug-fixed behavior.

## Required Evidence in PR Description

- What changed
- Why this approach is safe
- How it was validated (lint/test/e2e/manual)
- Any architecture impact (R1-R7)
