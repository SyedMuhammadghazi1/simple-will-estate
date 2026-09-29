# Security Policy

Plainwill stores highly sensitive personal information (family details, wishes, signed legal
documents). Please treat security reports with urgency.

## Reporting a vulnerability

Email **security@plainwill.example** (replace with the real address before launch) with a
description, reproduction steps and impact. Do not open a public issue. We aim to acknowledge
within 2 business days and to fix critical issues within 7 days.

## Security design summary

| Area              | Control                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication    | Better Auth email + password (scrypt hashes, min length 10), DB-backed sessions, `HttpOnly`/`SameSite=Lax` cookies (`Secure` over HTTPS)                                                                                                                            |
| Authorization     | `requireUser` / `requireRole` on every page, action and route; every object lookup is scoped to the owner (other users' objects return 404); staff roles `staff`/`admin`; role cannot be self-assigned (`input: false`)                                             |
| Data at rest      | Questionnaire drafts, immutable will versions, generated PDFs, uploaded scans, file names and staff notes are encrypted with AES-256-GCM (`DATA_ENCRYPTION_KEY`), key-id prefixed for rotation, with associated data binding each ciphertext to its row             |
| Integrity         | Will versions store a SHA-256 of the canonical answers; documents and uploads store a SHA-256 checked on every download; `will_versions`, `documents` and `audit_log` are immutable (DB triggers)                                                                   |
| Uploads           | PDF/PNG/JPEG only, detected by magic bytes (never by extension/MIME), 10 MB max, stored encrypted in Postgres, served as attachments with `nosniff`                                                                                                                 |
| Payments          | Prices come from server config; Stripe webhook signature verified on the raw body; amount re-checked; event ids persisted for idempotency. The `PAYMENTS_MODE=test-bypass` switch is rejected by env validation in production and compiled out of production builds |
| Abuse             | Postgres-backed fixed-window rate limits on sign-in/up and password reset (per IP and per account), autosave, checkout, uploads, previews and export; client IPs come from a platform header or trusted proxy hops, never the leftmost `X-Forwarded-For` entry      |
| Request size      | Route handlers read bodies with a cap and answer 413 beyond it (Stripe webhook 1 MB, auth endpoints 64 KB, signed-will uploads 10 MB); server actions use Next.js's 1 MB default                                                                                    |
| Auditing          | `audit_log` records sensitive actions, status changes and **every staff view of customer PII** (never the PII itself)                                                                                                                                               |
| Transport/browser | CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer and permissions policies; origin check on upload route; server actions have built-in origin checks                                                                                                   |
| Logging           | pino JSON logs with redaction; questionnaire contents are never logged                                                                                                                                                                                              |
| Errors            | Generic error pages and JSON errors; stack traces never returned to clients                                                                                                                                                                                         |

## Known limitations / follow-ups

- No multi-factor authentication or email verification yet (recommended before launch).
- Account deletion requests are processed manually by staff (see `docs/RUNBOOK.md`).
- `drizzle-kit` (dev-only) pulls a vulnerable `esbuild` version flagged by `npm audit`; it is not
  shipped in the production image.
- CSP allows `'unsafe-inline'` scripts (required by Next.js without nonces). Consider nonce-based CSP.
