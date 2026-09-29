import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, user, wills, type UserRole } from "@/db/schema";
import { getAuth } from "@/server/auth";
import type { Actor } from "@/server/session";
import { createOrder, listWills } from "@/server/services/orders";
import { markOrderPaid } from "@/server/services/payments";
import { saveDraftSection } from "@/server/services/wills";
import { SECTION_SCHEMAS, type WillAnswers, type WillSectionKey } from "@/lib/will/answers";
import { sampleAnswers } from "@/lib/will/sample";

export const PDF_BYTES = new Uint8Array(
  Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\ntrailer\n%%EOF\n"),
);
export const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
]);

let counter = 0;

export interface TestUser {
  actor: Actor;
  cookie: string;
}

/** Creates a real Better Auth user (email + password) and returns an actor and session cookie. */
export async function createUser(
  role: UserRole = "customer",
  name = "Test Person",
): Promise<TestUser> {
  counter++;
  const email = `user${counter}-${Date.now()}@example.test`;
  const res = await getAuth().api.signUpEmail({
    body: { name, email, password: "correct-horse-battery" },
    asResponse: true,
  });
  if (!res.ok) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const [row] = await db.select().from(user).where(eq(user.email, email));
  if (!row) throw new Error("user not created");
  if (role !== "customer") await db.update(user).set({ role }).where(eq(user.id, row.id));
  return {
    actor: { userId: row.id, role, email, name, ip: "127.0.0.1", userAgent: "vitest" },
    cookie,
  };
}

export async function fillWill(
  actor: Actor,
  willId: string,
  answers: WillAnswers = sampleAnswers(),
) {
  for (const key of Object.keys(SECTION_SCHEMAS) as WillSectionKey[]) {
    await saveDraftSection(actor, willId, key, answers[key]);
  }
}

/** Creates an order with complete answers. */
export async function createCompletedOrder(actor: Actor, answers: WillAnswers = sampleAnswers()) {
  const order = await createOrder(actor, "individual");
  const [will] = await listWills(order.id);
  if (!will) throw new Error("no will");
  await fillWill(actor, will.id, answers);
  return { order, will };
}

/** Creates a paid order (documents_ready) with documents generated. */
export async function createPaidOrder(actor: Actor, answers: WillAnswers = sampleAnswers()) {
  const { order, will } = await createCompletedOrder(actor, answers);
  await db.transaction((tx) =>
    markOrderPaid(tx, order.id, { source: "test_bypass", amountTotalCents: order.amountCents }),
  );
  const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
  const [freshWill] = await db.select().from(wills).where(eq(wills.id, will.id));
  return { order: fresh!, will: freshWill! };
}

export function authedRequest(url: string, cookie: string | null, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  headers.set("origin", "http://localhost:3001");
  return new Request(new URL(url, "http://localhost:3001"), { ...init, headers });
}

export function params<T extends Record<string, string>>(p: T) {
  return { params: Promise.resolve(p) };
}

/**
 * A request body streamed in chunks without a Content-Length (like chunked encoding), counting
 * how many bytes the server actually pulled.
 */
export function streamedBody(totalBytes: number, chunkBytes = 64 * 1024) {
  const chunk = new Uint8Array(chunkBytes).fill(0x61);
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) return controller.close();
      sent += chunk.length;
      controller.enqueue(chunk);
    },
  });
  return { body, sent: () => sent, init: { body, duplex: "half" } as RequestInit };
}
