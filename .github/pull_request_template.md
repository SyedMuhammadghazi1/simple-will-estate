## What & why

<!-- What does this change and why? Link the issue. -->

## How was it tested?

- [ ] `npm run lint && npm run format:check && npm run typecheck`
- [ ] `npm test` (unit + integration)
- [ ] `npm run test:e2e` (if UI / flows changed)

## Checklist

- [ ] No secrets, real customer data or PII in code, logs, fixtures or screenshots
- [ ] Authorization checked for every new object access (and a test proves user B can't read user A's data)
- [ ] New sensitive fields are encrypted at rest; audit log entries added for sensitive actions
- [ ] Migrations generated with `npm run db:generate` and committed (no edits to applied migrations)
- [ ] Legal content / state rules changes reviewed by counsel (see docs/LAUNCH_CHECKLIST.md)
- [ ] Docs updated (README / docs/*) if behaviour or configuration changed
