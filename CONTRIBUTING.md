# Contributing

## Setup

See the quickstart in [README.md](README.md). Use Node 22 (`nvm use`) and **npm**.

## Workflow

1. Branch from `main` (`feat/…`, `fix/…`).
2. Keep domain logic pure in `src/lib` with unit tests next to it (`*.test.ts`). I/O lives in
   `src/server` / `src/db`; integration tests live in `tests/integration` and run against the real
   test database.
3. Schema changes: edit `src/db/schema.ts`, run `npm run db:generate`, commit the SQL in `drizzle/`.
   Never edit a migration that has been applied anywhere.
4. Before pushing run the gates:
   ```bash
   npm run lint && npm run format:check && npm run typecheck && npm test
   npm run build && npm run test:e2e   # when UI or flows change
   ```
5. Open a PR using the template. CI must be green.

## Rules of the road

- Every object access must be authorised (owner or staff) — add an IDOR test for new routes.
- Never log PII or questionnaire contents. Use ids and codes in logs and audit metadata.
- Encrypt new sensitive columns with `src/server/encryption.ts` and a row-specific AAD.
- Legal text and state rules must not be presented as verified until counsel has reviewed them
  (`legalReviewStatus`), see [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md).
- Money is integer cents; prices only come from `src/lib/pricing.ts`.
