# W5 QA Checklist

1. `npm run typecheck`
2. `npm run lint`
3. `npm run test`
4. `npm run check`
5. `npx playwright test e2e/replay-end-to-end.spec.ts e2e/teach-lazy-load.spec.ts e2e/hud-technique-hint.spec.ts --workers=1 --retries=0 --reporter=list`
