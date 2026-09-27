# Launch checklist

Everything below must be done by humans before the first real customer. The software is
engineering-complete for a pilot, but **it has not had any legal review**.

## 1. Legal & compliance (blocking)

- [ ] **Business model review by counsel**: confirm the service is lawful document preparation and
      not the unauthorized practice of law (UPL) in each state you sell in. Some states restrict
      non-lawyer will services, the questions you may ask, or the guidance you may give.
- [ ] **Per-state verification of `src/lib/states.ts` by a licensed attorney in that state.** For
      each of the 50 states + DC confirm: number of witnesses (2 is only a default), witness
      qualifications (interested witnesses), self-proving affidavit availability and exact statutory
      wording, notary requirement, whether lifetime deposit with a court/registrar is offered (and
      the fee, procedure, who may deposit), holographic/electronic will rules, and any notes. Then set
      `legalReviewStatus: "reviewed"`, `lastReviewedAt` (ISO date) and `reviewedBy`. The startup
      warning and the admin "State rules" page show what is still pending. - Louisiana is marked unsupported (civil-law notarial testament, forced heirship). Keep it so
      unless counsel builds a Louisiana product. - The self-proving affidavit text is modelled on UPC §2-504; many states require their own
      statutory form (e.g. Texas Estates Code §251.104). Replace per state.
- [ ] **Will template review**: every article in `src/lib/documents/will-document.ts` (revocation,
      family, executor powers & bond waiver, independent administration request, guardianship,
      gifts, residuary, per stirpes/survivor rules, 30-day survivorship, UTMA custodianship ages per
      state (some cap at 21), pets, digital assets (RUFADAA), taxes, governing law, attestation).
- [ ] **Signing instructions review** (`src/lib/documents/signing-instructions.ts`).
- [ ] **Screening rules review** (`src/lib/will/screening.ts`): which findings block vs. warn, the
      wording of recommendations, and any missing red flags (e.g. blended families, prior marriages
      with support obligations, community property states, pretermitted spouse/child statutes).
- [ ] **Federal estate-tax threshold**: `src/lib/config.ts` uses $15,000,000 for 2026. Verify now and
      **every January**.
- [ ] **Terms of Service, Privacy Policy, Legal Disclaimer** (`src/app/(marketing)/legal/*`) are
      templates with bracketed placeholders — replace with counsel-approved text; remove the
      "requires lawyer review" banner only then.
- [ ] Refund policy, vault retention/return/release-on-death procedure, and data-retention schedule
      (what is kept after an account deletion request) agreed with counsel.
- [ ] Privacy compliance: CCPA/CPRA and other state privacy laws, sub-processor list, DPA with
      vendors (hosting, database, email, Stripe), breach-notification plan.
- [ ] Consumer-protection review of marketing claims ("files it properly", "legally valid").
- [ ] Business entity, insurance (E&O / professional liability, cyber), and any state registrations
      for document preparers.

## 2. Operations

- [ ] Physical vault: secure storage location, access controls, intake log, fire/flood protection,
      insurance, and a procedure to release originals to executors (death certificate verification).
- [ ] Court deposit: confirm per county which courts accept lifetime deposits, fees, forms and mailing
      addresses; budget the court fees included in the price.
- [ ] Staff onboarding: create staff accounts (promote via SQL `UPDATE "user" SET role='staff' …` or a
      future admin UI), train on PII handling; confidentiality agreements; background checks.
- [ ] Support mailbox (`SUPPORT_EMAIL`) and response-time targets.
- [ ] Account deletion request handling procedure (RUNBOOK).

## 3. Infrastructure

- [ ] Domain purchased; DNS (A/AAAA/CNAME) configured; HTTPS certificate; HSTS preload only after
      confirming all subdomains are HTTPS.
- [ ] Production Postgres (managed, encrypted at rest, automated backups + PITR ≥ 30 days,
      restore tested).
- [ ] Generate production secrets (`BETTER_AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET`) and
      store them in a secret manager; **escrow the encryption key** (losing it loses all data).
- [ ] GitHub: `production` environment with required reviewers; secrets
      `PRODUCTION_DATABASE_URL`, `DEPLOY_HOOK_URL`; variables `NEXT_PUBLIC_APP_NAME`,
      `NEXT_PUBLIC_APP_URL`; branch protection on `main` requiring CI.
- [ ] Scheduler for `/api/cron/signing-reminders` (daily).
- [ ] `TRUST_PROXY=true` only if your load balancer overwrites `X-Forwarded-For`.

## 4. Payments

- [ ] Stripe account activated (business verification), statement descriptor, receipts.
- [ ] Live webhook endpoint + secret; `PAYMENTS_MODE=stripe`; live keys in production only.
- [ ] Sales-tax determination for document-preparation services by state (Stripe Tax or advisor).
- [ ] Refund workflow (currently manual in the Stripe Dashboard; the app has a `refunded` status but
      no automated refund action).

## 5. Email

- [ ] Transactional email provider (SMTP) with a verified sending domain: SPF, DKIM, DMARC.
- [ ] `EMAIL_FROM`, `SUPPORT_EMAIL` set; test every template (confirmation, documents ready,
      reminders, filing completed, password reset, deletion request).

## 6. Monitoring & security

- [ ] Uptime checks on `/api/health` and `/api/ready`; alerting to on-call.
- [ ] Log aggregation with retention and access controls (logs contain ids, not PII).
- [ ] Error tracking (e.g. Sentry) with PII scrubbing.
- [ ] Alerts on: webhook failures, `payment amount mismatch`, `document integrity check failed`,
      rising 5xx rate, reminder job failures.
- [ ] Independent penetration test; review `SECURITY.md` known limitations (MFA, email verification,
      nonce-based CSP).
- [ ] Unicode names: documents use standard PDF fonts (Latin-1). Validation rejects other scripts
      today — embed a Unicode font (e.g. Noto Serif via `@pdf-lib/fontkit`) before marketing to
      customers whose names need it.

## 7. Product sign-off

- [ ] End-to-end dry run in production with Stripe test mode, then one live low-value transaction
      refunded.
- [ ] Accessibility audit (WCAG 2.2 AA) of the wizard.
- [ ] Remove or change demo seed accounts; never run `npm run db:seed` against production.
