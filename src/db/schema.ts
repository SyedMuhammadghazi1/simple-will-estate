import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Better Auth tables (field names must match Better Auth's defaults)
// ---------------------------------------------------------------------------

export const USER_ROLES = ["customer", "staff", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").$type<UserRole>().notNull().default("customer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Orders & wills
// ---------------------------------------------------------------------------

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    plan: text("plan").$type<"individual" | "couple">().notNull(),
    status: text("status").notNull().default("draft"),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    stateCode: text("state_code"),
    /** The order's current (latest) Stripe Checkout Session; reused while it can still be paid. */
    stripeCheckoutSessionId: text("stripe_checkout_session_id").unique(),
    /** Checkout Sessions created so far; part of each creation's Stripe idempotency key. */
    checkoutAttempts: integer("checkout_attempts").notNull().default(0),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    paymentSource: text("payment_source").$type<"stripe" | "test_bypass">(),
    screeningAcknowledged: jsonb("screening_acknowledged").$type<string[]>().notNull().default([]),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    documentsReadyAt: timestamp("documents_ready_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updateWindowEndsAt: timestamp("update_window_ends_at", { withTimezone: true }),
    filingMethod: text("filing_method").$type<"court_deposit" | "vault">(),
    lastSigningReminderAt: timestamp("last_signing_reminder_at", { withTimezone: true }),
    signingReminderCount: integer("signing_reminder_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("orders_user_id_idx").on(t.userId),
    index("orders_status_idx").on(t.status),
    index("orders_created_at_idx").on(t.createdAt),
  ],
);

export const wills = pgTable(
  "wills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** 1 for the primary testator, 2 for the partner in a couple order. */
    position: smallint("position").notNull(),
    /** AES-256-GCM encrypted JSON of the autosaved answers (AAD = "will-draft:<id>"). */
    draftCiphertext: text("draft_ciphertext").notNull(),
    currentStep: text("current_step").notNull().default("about"),
    completedSteps: jsonb("completed_steps").$type<string[]>().notNull().default([]),
    draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex("wills_order_position_uq").on(t.orderId, t.position)],
);

/** Immutable snapshots of answers taken at payment / each update (see DB trigger). */
export const willVersions = pgTable(
  "will_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    willId: uuid("will_id")
      .notNull()
      .references(() => wills.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    version: integer("version").notNull(),
    answersCiphertext: text("answers_ciphertext").notNull(),
    /** SHA-256 of the canonical JSON of the plaintext answers. */
    answersSha256: text("answers_sha256").notNull(),
    stateCode: text("state_code").notNull(),
    reason: text("reason").$type<"initial" | "update">().notNull(),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("will_versions_will_version_uq").on(t.willId, t.version),
    index("will_versions_order_idx").on(t.orderId),
  ],
);

/** Final generated documents (encrypted PDFs), immutable once written. */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => willVersions.id),
    willId: uuid("will_id")
      .notNull()
      .references(() => wills.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    kind: text("kind").$type<"will" | "signing_instructions">().notNull(),
    sha256: text("sha256").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    dataCiphertext: bytea("data_ciphertext").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("documents_version_kind_uq").on(t.versionId, t.kind),
    index("documents_order_idx").on(t.orderId),
  ],
);

/** Customer uploads of the signed will (encrypted bytes). */
export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    willId: uuid("will_id")
      .notNull()
      .references(() => wills.id),
    versionId: uuid("version_id")
      .notNull()
      .references(() => willVersions.id),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => user.id),
    kind: text("kind").$type<"signed_will">().notNull().default("signed_will"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    filenameCiphertext: text("filename_ciphertext").notNull(),
    dataCiphertext: bytea("data_ciphertext").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("uploads_order_idx").on(t.orderId), index("uploads_will_idx").on(t.willId)],
);

export const filingTasks = pgTable(
  "filing_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    method: text("method").$type<"court_deposit" | "vault">().notNull(),
    status: text("status").notNull().default("pending"),
    stateCode: text("state_code").notNull(),
    depositAuthority: text("deposit_authority"),
    trackingNumber: text("tracking_number"),
    courtReference: text("court_reference"),
    filedOn: date("filed_on", { mode: "string" }),
    vaultReference: text("vault_reference"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedByUserId: text("updated_by_user_id"),
    ...timestamps,
  },
  (t) => [
    index("filing_tasks_status_idx").on(t.status),
    uniqueIndex("filing_tasks_one_open_per_order_uq")
      .on(t.orderId)
      .where(sql`${t.status} in ('pending', 'sent_to_court')`),
  ],
);

export const orderNotes = pgTable(
  "order_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id),
    bodyCiphertext: text("body_ciphertext").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_notes_order_idx").on(t.orderId)],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    actorUserId: text("actor_user_id"),
    actorType: text("actor_type").$type<"customer" | "staff" | "system">().notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_status_history_order_idx").on(t.orderId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Platform tables
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    orderId: uuid("order_id"),
    /** Never contains PII payloads — ids, codes and counts only. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_created_at_idx").on(t.createdAt),
    index("audit_log_order_idx").on(t.orderId),
    index("audit_log_action_idx").on(t.action),
    index("audit_log_actor_idx").on(t.actorUserId),
  ],
);

export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index("rate_limits_window_idx").on(t.windowStart),
  ],
);

export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id"),
    userId: text("user_id"),
    kind: text("kind").notNull(),
    /** Unique per logical email so retries never double-send. */
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: text("status").$type<"sent" | "failed">().notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_log_order_idx").on(t.orderId)],
);

export const accountDeletionRequests = pgTable(
  "account_deletion_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    status: text("status")
      .$type<"pending" | "completed" | "rejected">()
      .notNull()
      .default("pending"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processedByUserId: text("processed_by_user_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("account_deletion_one_pending_uq")
      .on(t.userId)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export type OrderRow = typeof orders.$inferSelect;
export type WillRow = typeof wills.$inferSelect;
export type WillVersionRow = typeof willVersions.$inferSelect;
export type FilingTaskRow = typeof filingTasks.$inferSelect;
export type UserRow = typeof user.$inferSelect;
