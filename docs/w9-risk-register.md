# W9 Risk Register

## R1 — Diagnosis wording feels generic
- Probability: Medium
- Impact: Medium
- Mitigation:
  - Use concrete counters from replay (mistakes, key ratio, pace).

## R2 — Replay UI clutter
- Probability: Medium
- Impact: UX
- Mitigation:
  - Keep diagnosis compact and collapsible-ready structure.

## R3 — State sync bugs between legacy replay and React store
- Probability: Medium
- Impact: Medium
- Mitigation:
  - Add bridge/store field with clear reset behavior on open/close.
