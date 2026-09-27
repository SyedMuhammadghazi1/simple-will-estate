import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountDeletionRequests, orders, willVersions } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { sampleAnswers } from "@/lib/will/sample";
import { runSigningReminders } from "@/jobs/signing-reminders";
import { ConflictError, RateLimitedError } from "@/server/errors";
import { hitRateLimit } from "@/server/rate-limit";
import { requestAccountDeletion } from "@/server/services/account";
import { currentDocuments } from "@/server/services/documents";
import { publishWillUpdate } from "@/server/services/updates";
import { saveDraftSection } from "@/server/services/wills";
import { createPaidOrder, createUser } from "./helpers";

describe("signing reminders job", () => {
  it("reminds after 7 days, never twice within 7 days, and skips signed orders", async () => {
    const customer = await createUser();
    const { order: due } = await createPaidOrder(customer.actor);
    const { order: fresh } = await createPaidOrder(customer.actor);
    const { order: signed } = await createPaidOrder(customer.actor);
    const now = new Date("2026-09-27T12:00:00Z");
    await db
      .update(orders)
      .set({ documentsReadyAt: addDays(now, -8) })
      .where(eq(orders.id, due.id));
    await db
      .update(orders)
      .set({ documentsReadyAt: addDays(now, -6) })
      .where(eq(orders.id, fresh.id));
    await db
      .update(orders)
      .set({ documentsReadyAt: addDays(now, -30), status: "executed" })
      .where(eq(orders.id, signed.id));

    expect(await runSigningReminders(now)).toMatchObject({ sent: 1 });
    expect(await runSigningReminders(now)).toMatchObject({ sent: 0 });
    expect(await runSigningReminders(addDays(now, 3))).toMatchObject({ sent: 1 }); // `fresh` now 9 days old
    expect(await runSigningReminders(addDays(now, 6))).toMatchObject({ sent: 0 });
    expect(await runSigningReminders(addDays(now, 7))).toMatchObject({ sent: 1 }); // `due` again after 7 days
    const [d] = await db.select().from(orders).where(eq(orders.id, due.id));
    expect(d!.signingReminderCount).toBe(2);
  });

  it("is safe when two runners race", async () => {
    const customer = await createUser();
    const { order } = await createPaidOrder(customer.actor);
    const now = new Date();
    await db
      .update(orders)
      .set({ documentsReadyAt: addDays(now, -10) })
      .where(eq(orders.id, order.id));
    const [a, b] = await Promise.all([runSigningReminders(now), runSigningReminders(now)]);
    expect(a.sent + b.sent).toBe(1);
  });
});

describe("will updates within the 12-month window", () => {
  it("creates a new version, new documents, and requires re-signing", async () => {
    const customer = await createUser();
    const { order, will } = await createPaidOrder(customer.actor);
    await db.update(orders).set({ status: "filed" }).where(eq(orders.id, order.id));

    await expect(publishWillUpdate(customer.actor, will.id)).rejects.toMatchObject({
      code: "no_changes",
    });

    const gifts = {
      gifts: [
        ...sampleAnswers().gifts.gifts,
        {
          id: "g2",
          description: "my bicycle",
          recipientName: "Riley Sample",
          alternateRecipientName: "",
        },
      ],
    };
    await saveDraftSection(customer.actor, will.id, "gifts", gifts);
    const v2 = await publishWillUpdate(customer.actor, will.id);
    expect(v2.version).toBe(2);
    expect(v2.reason).toBe("update");

    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.status).toBe("documents_ready");
    expect(o!.executedAt).toBeNull();
    const docs = await currentDocuments(order);
    expect(docs.every((d) => d.version === 2)).toBe(true);
    expect(
      await db.select().from(willVersions).where(eq(willVersions.willId, will.id)),
    ).toHaveLength(2);
  });

  it("refuses updates after the window or while filing is in progress", async () => {
    const customer = await createUser();
    const { order, will } = await createPaidOrder(customer.actor);
    await db.update(orders).set({ status: "filing_in_progress" }).where(eq(orders.id, order.id));
    await expect(publishWillUpdate(customer.actor, will.id)).rejects.toBeInstanceOf(ConflictError);
    await db
      .update(orders)
      .set({ status: "filed", paidAt: addDays(new Date(), -400) })
      .where(eq(orders.id, order.id));
    await expect(publishWillUpdate(customer.actor, will.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("moves the order to the state the new version was made for", async () => {
    const customer = await createUser();
    const { order, will } = await createPaidOrder(customer.actor); // Texas
    await saveDraftSection(customer.actor, will.id, "about", {
      ...sampleAnswers().about,
      stateCode: "CA",
      county: "Alameda",
      city: "Oakland",
      postalCode: "94612",
    });
    await publishWillUpdate(customer.actor, will.id);
    // The order page derives witness/notary guidance and the filing options from this.
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.stateCode).toBe("CA");
  });
});

describe("account deletion requests", () => {
  it("records one pending request per user", async () => {
    const customer = await createUser();
    await requestAccountDeletion(customer.actor);
    await expect(requestAccountDeletion(customer.actor)).rejects.toBeInstanceOf(ConflictError);
    const rows = await db
      .select()
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.userId, customer.actor.userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("pending");
  });
});

describe("Postgres fixed-window rate limiter", () => {
  it("counts per key and window", async () => {
    const rule = { name: "test", limit: 3, windowSeconds: 60 };
    const now = new Date("2026-09-27T12:00:10Z");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hitRateLimit(rule, "k", now));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]!.retryAfterSeconds).toBe(50);
    expect((await hitRateLimit(rule, "other", now)).allowed).toBe(true);
    expect((await hitRateLimit(rule, "k", new Date("2026-09-27T12:01:00Z"))).allowed).toBe(true);
  });

  it("surfaces as a typed error from services", async () => {
    const customer = await createUser();
    const { enforceRateLimit } = await import("@/server/rate-limit");
    const rule = { name: "tiny", limit: 1, windowSeconds: 60 };
    await enforceRateLimit(rule, customer.actor.userId);
    await expect(enforceRateLimit(rule, customer.actor.userId)).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });
});

describe("per-IP buckets", () => {
  it("uses a per-IP key when the IP is known and a larger shared bucket otherwise", async () => {
    const { ipBucket } = await import("@/server/rate-limit");
    const rule = { name: "r", limit: 5, windowSeconds: 60 };
    expect(ipBucket(rule, "203.0.113.9")).toEqual([rule, "ip:203.0.113.9"]);
    expect(ipBucket(rule, null)).toEqual([{ ...rule, limit: 100 }, "ip:unknown"]);
  });
});

describe("auth API route rate limits", () => {
  it("throttles password guessing per account, not only per IP", async () => {
    const { POST } = await import("@/app/api/auth/[...all]/route");
    const customer = await createUser();
    const attempt = (email: string, password: string) =>
      POST(
        new Request("http://localhost:3001/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:3001" },
          body: JSON.stringify({ email, password }),
        }),
      );
    // Keep every attempt inside one fixed rate-limit window.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-27T12:00:05Z") });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        statuses.push((await attempt(customer.actor.email, `wrong-guess-${i}`)).status);
      }
      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
      expect(statuses[10]).toBe(429);
      // Same bucket as the sign-in server action: case/whitespace variants don't reset it.
      const variant = await attempt(` ${customer.actor.email.toUpperCase()} `, "x");
      expect(variant.status).toBe(429);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("password reset", () => {
  it("creates a single-use reset token without revealing whether the account exists", async () => {
    const { getAuth } = await import("@/server/auth");
    const { verification } = await import("@/db/schema");
    const customer = await createUser();
    await getAuth().api.requestPasswordReset({
      body: { email: customer.actor.email, redirectTo: "/reset-password" },
    });
    await getAuth().api.requestPasswordReset({
      body: { email: "nobody@example.test", redirectTo: "/reset-password" },
    });
    const tokens = await db.select().from(verification);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.identifier).toMatch(/^reset-password:/);
  });
});
