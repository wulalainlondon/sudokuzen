# Steam Host Bridge (No Core Changes)

This project now exposes a stable host boundary so a Steam wrapper layer
(Electron/Tauri/native webview shell) can integrate without touching game core modules.

## Contract

- Injection point: `window.__SUDOKU_HOST_BRIDGE`
- API export: `window.__SUDOKU_HOST_API`
- Internal source:
  - `src/platform/hostBridge.ts`
  - wired in `src/app/legacyRuntime.ts`

## Host Bridge Shape

```ts
window.__SUDOKU_HOST_BRIDGE = {
  name: 'steam-shell',
  version: '1.0.0',
  async setup(api) {
    // keep api reference in your shell
    // bind shell-specific keyboard shortcuts / IPC handlers
  },
  onBootReady(ctx) {
    // app is ready; safe to call api methods
  },
  onBeforeUnload() {
    // optional shell cleanup
  },
};
```

## Stable Host API (v1)

- `showLevelScreen(returnToTier?)`
- `startLevelFromModal(forceReset?, playWithGhost?, ghostData?)`
- `pauseGame()`
- `resumeGame()`
- `toggleSpeedrunMode()`
- `openReplayModal()`
- `closeReplayModal()`
- `openWildLobby()`
- `closeWildLobby()`
- `startWorldSession()`
- `continueWild()`
- `exitWild()`

## Integration Rules

- Wrapper-only logic (Steam overlay, IPC, achievements sync, shell hotkeys)
  must stay in the host bridge layer.
- Core gameplay (`src/game/**`, solver, puzzle state transitions) stays unchanged.
- If a new host capability is needed, extend `HostBridgeApi` first instead of
  reaching into internals from the wrapper.
