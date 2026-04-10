# W4 Risk Register

## R1 — Strict validator breaks existing CI unexpectedly
- Probability: Medium
- Impact: High
- Mitigation:
  - Use env-gated strict mode (`TEACH_VALIDATE_STRICT=1`) instead of default hard fail.
  - Add tests that lock behavior.

## R2 — Replay sanitizer changes cloud merge payload shape
- Probability: Medium
- Impact: Medium
- Mitigation:
  - Reuse existing sanitizer contract already used by UI replay path.
  - Add merge/normalization unit tests to verify shape.

## R3 — Replay e2e remains flaky due to dynamic gameplay path
- Probability: Medium
- Impact: Medium
- Mitigation:
  - Assert semantic invariant (“only mistakes or empty placeholder”), not brittle class-only assumption.
  - Run with `--workers=1 --retries=0` in CI-like local verification.
