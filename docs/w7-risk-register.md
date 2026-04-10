# W7 Risk Register

## R1 — Stats data shape mismatch between legacy stats and React modal
- Probability: Medium
- Impact: Medium
- Mitigation:
  - Keep new learning payload additive.
  - Backward-compatible defaults when data missing.

## R2 — i18n key drift causes typecheck failure
- Probability: Medium
- Impact: Medium
- Mitigation:
  - Add keys to zh-TW first, then mirror to all locales in same PR.

## R3 — Dashboard noise without actionability
- Probability: Medium
- Impact: Product quality
- Mitigation:
  - Include “next actions” section (unread/unfinished techniques).
