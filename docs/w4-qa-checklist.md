# W4 QA Checklist

## Static + Unit
1. `npm run typecheck`
2. `npm run lint`
3. `npm run test`
4. `npm run check`

## Policy Validation
1. `node scripts/validate-teach-data.mjs` (default non-strict)
2. `TEACH_VALIDATE_STRICT=1 node scripts/validate-teach-data.mjs` (strict notice gate)

## E2E Target
1. `npx playwright test e2e/replay-end-to-end.spec.ts e2e/teach-lazy-load.spec.ts e2e/hud-technique-hint.spec.ts --workers=1 --retries=0 --reporter=list`
