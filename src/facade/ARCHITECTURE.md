# Window Facade & React Bridge — Architecture Rule

## The Problem (V1-V25 bug)

ES module `import { fn }` gives a **direct function reference**.
`window.fn` is a **separate binding** that can be overwritten.

If a React bridge overrides `window.fn` but callers use
`import { fn }`, the bridge is never triggered.

## Rule

**Any function that may be intercepted by a bridge MUST be
called via `window`, never via direct module import.**

Currently bridged functions:
- `showTeachModal` → React TeachOverlay
- `hideTeachModal` → React TeachOverlay
- `openTeachFromLibrary` → React TeachOverlay

## How to call bridged functions

```typescript
// ❌ WRONG — bypasses bridge
import { showTeachModal } from './teach-legacy';
showTeachModal(3, 'tier');

// ✅ CORRECT — bridge can intercept
(window as any).showTeachModal(3, 'tier');
```

## When adding a new bridge

1. Override `window.fnName` in the bridge installer
2. Search codebase for `import.*fnName` — convert ALL to `window.fnName`
3. Add the function name to this list

## Host Wrapper Rule (Steam / native shell)

Wrapper integrations must not call core modules directly.
Use the host boundary only:

- `window.__SUDOKU_HOST_BRIDGE` (injected by wrapper)
- `window.__SUDOKU_HOST_API` (exported by app, API v1)

See: `docs/steam-host-bridge.md`
