# On-call runbook

## Health checks

| Endpoint          | Meaning                            | Expected                                            |
| ----------------- | ---------------------------------- | --------------------------------------------------- |
| `GET /api/health` | Process is alive (no dependencies) | `200 {"status":"ok"}`                               |
| `GET /api/ready`  | Database reachable (`select 1`)    | `200 {"status":"ready"}`; `503` when the DB is down |

The Docker image has a `HEALTHCHECK` on `/api/health`. Point load-balancer readiness at `/api/ready`.

## Logs

- JSON (pino) on stdout. Useful fields: `level`, `msg`, `route`, `err.message`, `orderId`
  (8-char refs in some messages), `audit` (action name).
- PII and questionnaire contents are never logged; emails/tokens/passwords are redacted.
- Startup always logs `LEGAL REVIEW PENDING: …` until every state is reviewed — expected pre-launch.
- Common searches: `"unhandled route error"`, `"stripe webhook processing failed"`,
  `"payment amount mismatch"`, `"document integrity check failed"`, `"email send failed"`.

## Common incidents

### Customer paid but order still "In progress"

1. Stripe Dashboard → Developers → Webhooks → endpoint → find the event for the session.
2. If it failed (non-2xx), check logs for `stripe webhook processing failed`, fix the cause, then
   **Resend** the event from Stripe. Processing is idempotent (`stripe_events`).
3. If `payment amount mismatch` was logged, the charged amount differs from the server price —
   investigate before doing anything (possible tampering or a price change mid-checkout).

### Replaying webhooks

- Stripe Dashboard → event → "Resend", or `stripe events resend evt_…`.
- To replay an event that was already recorded (e.g. after restoring an old backup), delete its row
  from `stripe_events` first: `DELETE FROM stripe_events WHERE id = 'evt_…';` — `markOrderPaid` is
  still a no-op for orders that are no longer drafts.

### Signing reminders not sent

- `POST /api/cron/signing-reminders` with the bearer token returns `{candidates, sent, failed}`.
- Failed sends release their claim and are retried on the next run. Check SMTP credentials.

### Emails not delivered

- `email_log` shows `status = 'failed'` with the error. Re-triggering the same flow retries failed
  keys (dedupe keys prevent double sends).

## Rolling back

1. Redeploy the previous image tag (`ghcr.io/<owner>/<repo>:<previous-sha>`) or promote the previous
   Vercel deployment.
2. Migrations are forward-only. If a release included a migration, roll forward with a fix unless the
   migration is purely additive (older code ignores new columns/tables).
3. Never edit or delete rows in `will_versions`, `documents` or `audit_log` — triggers prevent it.

## Rotating secrets

| Secret                  | Procedure                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`    | Replace and redeploy. All sessions are invalidated (users sign in again).             |
| `CRON_SECRET`           | Update in the app and in the scheduler at the same time.                              |
| `STRIPE_WEBHOOK_SECRET` | Roll in Stripe (keeps the old secret valid for a grace period), update env, redeploy. |
| `STRIPE_SECRET_KEY`     | Roll in Stripe, update env, redeploy.                                                 |
| SMTP credentials        | Update env, redeploy, send a test (sign-up → password reset).                         |
| `DATA_ENCRYPTION_KEY`   | See below.                                                                            |

### Rotating the data-encryption key

1. Generate a new key: `openssl rand -base64 32`, choose a new id (e.g. `k2`).
2. Set `DATA_ENCRYPTION_KEY=<new>`, `DATA_ENCRYPTION_KEY_ID=k2` and
   `DATA_ENCRYPTION_PREVIOUS_KEYS=k1:<old key>`; deploy. New writes use `k2`, old data still decrypts.
3. Re-encrypt mutable data: `npm run job:reencrypt` (dry run) then `npm run job:reencrypt -- --apply`.
4. **Keep `k1` in `DATA_ENCRYPTION_PREVIOUS_KEYS` permanently** unless you also migrate the immutable
   `will_versions` / `documents` rows (requires a reviewed maintenance migration that temporarily
   disables the immutability triggers). If a key is compromised, plan that migration.

## Restoring the database

1. Restore the managed-database snapshot / PITR into a **new** instance.
2. Point a staging deployment at it with the same `DATA_ENCRYPTION_KEY`(s) and verify: sign in as
   staff, open an order, download a document (integrity is checked against its SHA-256).
3. Switch `DATABASE_URL` in production, redeploy, check `/api/ready`.
4. Replay Stripe events created after the snapshot time (see "Replaying webhooks").

## Processing account deletion requests (manual)

1. Staff console → Overview lists pending requests (ids only).
2. Export the customer's data (they can also do it themselves) and confirm identity by email.
3. Follow the retention policy agreed with counsel (launch checklist). Typical approach: delete
   drafts and uploads for unpaid orders, anonymise the `user` row (name/email), keep paid order
   records, filed/vaulted document records and the audit log where legally required.
4. Mark the request `completed` in `account_deletion_requests` and reply to the customer.

## Filing queue operations

- Staff console → Filing queue shows open tasks (every view is audited).
- Court deposit: mail the original with tracking → "Mark sent to court" (tracking number) → when the
  court confirms, "Mark filed" (court reference + date). Customer is emailed.
- Vault: store the original, record the vault reference → "Mark vaulted".
