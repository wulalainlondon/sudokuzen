# W14 Scope Freeze (Replay Learning Loop Telemetry + Step Deep-Link)

## Goal
Turn replay recommendations into a measurable learning loop by deep-linking into teach steps and recording conversion metrics.

## In Scope
1. Replay recommendation opens teach with replay source and step-oriented open options.
2. Replay launches skip demo and jump to first interactive step.
3. Add learning loop telemetry: recommendation clicks, replay-to-teach completions, next-day learning returns, completion rate.
4. Show loop metrics in Stats > Learning tab.

## Out of Scope
1. Cloud sync for learning loop telemetry.
2. Per-technique conversion funnel visualization.
3. Auto-start practice after step jump.

## Exit Criteria
1. `npm run check` pass.
2. Replay recommendation no longer lands only at module entry state.
3. Stats learning tab displays loop metrics and updates after interactions.
