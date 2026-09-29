# Handoff: project status (paused 2026-09-29)

Work on this repo is paused. This file records where things stand so the next session can resume
without re-discovering context. To resume: open a Claude Code session on this repo and ask it to
read `HANDOFF.md` and continue from "Next steps".

## What this is

Plainwill (working name, set via `NEXT_PUBLIC_APP_NAME`): a flat-fee will service. Customers
complete a guided will wizard, pay once via Stripe Checkout ($99 individual / $169 couple), get a
state-specific will PDF + signing instructions, upload the signed copy, and staff handle court
deposit or vault safekeeping. See `README.md` and `docs/ARCHITECTURE.md`.

## State at pause

- `main` on GitHub is complete and green: lint, format, typecheck, 295 unit + integration tests,
  production build, 3 Playwright e2e tests and the Docker image smoke test all pass in GitHub
  Actions (CI run for `0f879af`).
- The Deploy workflow runs after CI succeeds: it built and pushed the image to GHCR; the migrate
  and deploy steps skip with a notice until `PRODUCTION_DATABASE_URL` and `DEPLOY_HOOK_URL` are
  set as secrets in the `production` environment.
- Nothing is deployed to a live host yet. No real Stripe keys or SMTP have been used.

## History of the work

1. Built from scratch (Next.js 16, Drizzle/Postgres, Better Auth, Stripe, Vitest, Playwright).
2. Independent security/correctness review fixed 9 bugs, including:
   - answers edited during checkout bypassing validation at payment time;
   - silently dropped duplicate or late payments;
   - an open redirect via `?next=`;
   - no per-account sign-in limit on the Better Auth endpoint;
   - deploys not gated on CI;
   - an upload size check that chunked bodies could bypass.
3. Hardening pass:
   - spoof-resistant client IP (`CLIENT_IP_HEADER` / `TRUSTED_PROXY_HOPS`);
   - `SKIP_ENV_VALIDATION` ignored at production runtime;
   - one Stripe Checkout Session per order (no double charges);
   - capped webhook/auth request bodies;
   - optimistic concurrency for autosaves.
4. CI fixes: e2e sign-out race; deploy skips commits that are no longer the head of `main`.

## Known gaps (not built or not verified)

- No in-app refund action (refund in the Stripe dashboard; the `refunded` status exists).
- Account deletion requests are processed manually by staff; no UI to change user roles (SQL).
- No MFA or email verification. PDFs use standard fonts, so names outside Latin-1 are rejected.
- Mailpit/SMTP path not exercised (emails logged to console in dev).

## Before real customers (see `docs/LAUNCH_CHECKLIST.md`)

- A licensed attorney must verify every state entry (all are `unreviewed`), the will/affidavit
  templates, the screening rules and the terms/privacy/disclaimer text; check unauthorized-practice-
  of-law rules per state. Re-confirm the $15M federal estate-tax figure every January.
- Live Stripe keys + webhook, production secrets (escrow `DATA_ENCRYPTION_KEY`), email sending
  domain, GitHub `production` environment secrets, vault/court-deposit procedures, monitoring.

## Next steps

1. Pick a host (see `docs/DEPLOYMENT.md`), create managed Postgres, set secrets, deploy.
2. Configure Stripe test mode end to end against the deployed URL, then live mode.
3. Close the known gaps above in priority order (refund action, email verification, MFA).
4. Review and merge Dependabot PRs.
