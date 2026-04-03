# UI Refresh Rules

This file defines concrete refresh behavior for stage map / level list / other portal-driven UI.

## 1) Event Coalescing

- Refresh events must be coalesced to max 1 dispatch per animation frame.
- Pattern:
  - queue flag + `requestAnimationFrame`.
  - clear queue flag inside RAF callback.

## 2) Signature Dedupe

- Build a cheap deterministic signature from rendered card/view model fields.
- Skip refresh if signature is unchanged and screen context is unchanged.

## 3) Non-Destructive Refresh

- Do not reset list DOM to empty for regular refresh.
- Do not introduce skeleton placeholders during stable state refresh.
- Keep existing items mounted; only update changed content/classes.

## 4) Paging/Incremental Rendering

- Large lists should render an initial window and extend on scroll.
- Refresh should not reset paging unless context changed (for example tier switched).

## 5) Ownership Guard

- If a region is React-owned, legacy renderers dispatch refresh events only.
- Legacy code must not directly rewrite React-owned host contents.

## 6) Visual Stability

- Avoid CSS rules that animate all list items by default.
- Animations should be opt-in via specific classes (`duo-glow`, `level-item--current`, etc.).
- Do not attach global pulsing effects to base card selectors.

## 7) Validation

- Unit test:
  - repeated refresh requests in one frame dispatch once.
- Functional test:
  - entering a tier does not visually flash all level cards.
