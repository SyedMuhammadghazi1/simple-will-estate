# Deployment

Plainwill is a stateless Next.js server plus PostgreSQL. All state (sessions, rate limits,
documents, uploads) lives in Postgres, so you can run several instances behind a load balancer.

## Required production configuration

| Variable                                                             | Notes                                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `NODE_ENV=production`                                                | Set by the Docker image / `next start`                                                            |
| `DATABASE_URL`                                                       | Managed Postgres 16, TLS (`?sslmode=require`)                                                     |
| `APP_URL`, `NEXT_PUBLIC_APP_URL`                                     | Public HTTPS URL (NEXT_PUBLIC_* is baked in at build time)                                        |
| `BETTER_AUTH_SECRET`                                                 | `openssl rand -base64 48`                                                                         |
| `DATA_ENCRYPTION_KEY`, `DATA_ENCRYPTION_KEY_ID`                      | `openssl rand -base64 32`; **back up in your secret manager** — losing it loses all customer data |
| `PAYMENTS_MODE=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Live keys only after launch checklist sign-off                                                    |
| `CRON_SECRET`                                                        | ≥16 chars, used by the scheduler                                                                  |
| `SMTP_*`, `EMAIL_FROM`, `SUPPORT_EMAIL`                              | Verified sending domain (SPF/DKIM/DMARC)                                                          |
| `TRUST_PROXY=true`                                                   | When behind a load balancer that sets `X-Forwarded-For`                                           |

The app refuses to start requests with an invalid configuration (e.g. `PAYMENTS_MODE=test-bypass`
in production, missing Stripe or cron secrets).

## Option A — Docker on any container host (Render, Fly.io, Railway, ECS, Kubernetes)

```bash
docker build -t plainwill \
  --build-arg NEXT_PUBLIC_APP_NAME=Plainwill \
  --build-arg NEXT_PUBLIC_APP_URL=https://plainwill.example .

# 1. migrations (run before each release; safe to re-run)
docker run --rm -e DATABASE_URL=... plainwill node migrate.mjs

# 2. app (listens on $PORT, default 3000; non-root; HEALTHCHECK on /api/health)
docker run -d -p 3000:3000 --env-file prod.env plainwill
```

- **Render**: Web Service from the GHCR image or Dockerfile; health check path `/api/health`;
  pre-deploy command `node migrate.mjs`; add a Cron Job (see below). Use the Render deploy hook URL
  as `DEPLOY_HOOK_URL`.
- **Fly.io**: `fly launch --dockerfile Dockerfile`; `[deploy] release_command = "node migrate.mjs"`;
  `[[http_service.checks]] path = "/api/health"`.
- **Railway**: deploy the Dockerfile; set the pre-deploy command to `node migrate.mjs`; use a Railway
  cron service or GitHub Actions for the reminder job.
- Readiness probe: `GET /api/ready` (checks the database). Liveness: `GET /api/health`.

### GitHub Actions pipeline

- `.github/workflows/ci.yml` — lint, format, typecheck, migrate, unit + integration, build, Playwright
  e2e and a Docker build + container smoke test on every PR and push to `main`.
- `.github/workflows/deploy.yml` — after CI succeeds for a push to `main` (or manually): builds
  and pushes `ghcr.io/<owner>/<repo>:<sha>` (the commit CI tested) and `:latest`, runs
  `node migrate.mjs` with `secrets.PRODUCTION_DATABASE_URL`, then POSTs `secrets.DEPLOY_HOOK_URL`.
  Both jobs run in the `production` environment (add required reviewers there) and are skipped
  with a notice when the secrets are not configured. Optional repository variables:
  `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`.

## Option B — Vercel + managed Postgres (e.g. Neon)

1. Create a Neon project (Postgres 16). Use the **pooled** connection string for `DATABASE_URL`
   and keep `DATABASE_POOL_MAX` small (e.g. 3) because serverless functions scale out.
2. Import the repo in Vercel (framework: Next.js). Set all environment variables above.
   `output: "standalone"` is ignored by Vercel and harmless.
3. Run migrations from CI or locally before promoting a deployment:
   `DATABASE_URL=<neon direct url> npm run db:migrate`.
4. Cron: `vercel.json` schedules `GET /api/cron/signing-reminders` daily; Vercel sends
   `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set.
5. Function size/time: PDF generation happens in the Stripe webhook; keep the default Node.js
   runtime (not Edge).

## Stripe setup

1. Create the webhook endpoint `https://<your-domain>/api/webhooks/stripe` with events
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
2. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Prices are **not** Stripe Price objects — the app sends `price_data` from `src/lib/pricing.ts`
   and re-checks `amount_total` in the webhook.
4. Local testing: `stripe listen --forward-to localhost:3001/api/webhooks/stripe` with
   `PAYMENTS_MODE=stripe` and test keys, or use `PAYMENTS_MODE=test-bypass` (dev only).

## Scheduled jobs

| Job               | Schedule | How                                                                                                                                                                         |
| ----------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signing reminders | daily    | `POST` or `GET /api/cron/signing-reminders` with `Authorization: Bearer $CRON_SECRET`, or `node job-signing-reminders.mjs` in the image, or `npm run job:signing-reminders` |

The job is idempotent: an order is reminded at most once per 7 days, and concurrent runs are safe.
Example GitHub Actions schedule:

```yaml
on: { schedule: [{ cron: "17 15 * * *" }] }
jobs:
  remind:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS -X POST -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" https://plainwill.example/api/cron/signing-reminders
```

## Migrations

- Generated with `npm run db:generate` and committed under `drizzle/`; applied with
  `npm run db:migrate` (dev) or `node migrate.mjs` (image). Migrations are forward-only; write
  expand/contract migrations for zero-downtime changes.
- `0001_immutable_records.sql` installs triggers that forbid UPDATE/DELETE on `will_versions`,
  `documents` and `audit_log`.

## Backups

- Enable automated daily backups + point-in-time recovery on the managed database (≥30 days).
- The database contains encrypted PDFs and scans; backups are useless without
  `DATA_ENCRYPTION_KEY` (and any previous keys) — store keys separately from backups.
- Test a restore quarterly (see [RUNBOOK.md](RUNBOOK.md#restoring-the-database)).
- Physical originals in the vault need their own register and off-site policy (launch checklist).
