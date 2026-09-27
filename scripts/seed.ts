/**
 * Seeds an admin, a staff member and a demo customer with orders in several states.
 * Idempotent: existing users are reused and demo orders are only created once.
 *
 *   npm run db:seed
 */
import "./load-env";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { orders, user, type UserRole } from "@/db/schema";
import { sampleAnswers } from "@/lib/will/sample";
import type { Actor } from "@/server/actor";
import { getAuth } from "@/server/auth";
import { recordExecutionAndChooseFiling, uploadSignedWill } from "@/server/services/execution";
import { applyFilingAction } from "@/server/services/filing";
import { createOrder, listWills } from "@/server/services/orders";
import { markOrderPaid } from "@/server/services/payments";
import { saveDraftSection, submitStep } from "@/server/services/wills";
import { SECTION_SCHEMAS, type WillAnswers, type WillSectionKey } from "@/lib/will/answers";

const PASSWORD = process.env.SEED_PASSWORD ?? "Plainwill-demo-2026";

const USERS: { email: string; name: string; role: UserRole }[] = [
  { email: "admin@plainwill.test", name: "Avery Admin", role: "admin" },
  { email: "staff@plainwill.test", name: "Sam Staff", role: "staff" },
  { email: "customer@plainwill.test", name: "Jordan Avery Sample", role: "customer" },
];

async function ensureUser(u: (typeof USERS)[number]): Promise<Actor> {
  let [row] = await db.select().from(user).where(eq(user.email, u.email));
  if (!row) {
    await getAuth().api.signUpEmail({ body: { email: u.email, name: u.name, password: PASSWORD } });
    [row] = await db.select().from(user).where(eq(user.email, u.email));
  }
  if (!row) throw new Error(`could not create ${u.email}`);
  if (row.role !== u.role) await db.update(user).set({ role: u.role }).where(eq(user.id, row.id));
  return {
    userId: row.id,
    role: u.role,
    email: u.email,
    name: u.name,
    ip: null,
    userAgent: "seed",
  };
}

async function fill(actor: Actor, willId: string, answers: WillAnswers) {
  for (const key of Object.keys(SECTION_SCHEMAS) as WillSectionKey[]) {
    await saveDraftSection(actor, willId, key, answers[key]);
  }
}

async function paidOrder(actor: Actor, answers: WillAnswers) {
  const order = await createOrder(actor, "individual");
  const [will] = await listWills(order.id);
  await fill(actor, will!.id, answers);
  await db.transaction((tx) =>
    markOrderPaid(tx, order.id, { source: "test_bypass", amountTotalCents: order.amountCents }),
  );
  return { order, will: will! };
}

const SIGNED_PDF = new Uint8Array(
  Buffer.from("%PDF-1.4\n% demo signed will scan\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n"),
);

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "1") {
    throw new Error("Refusing to seed demo data with NODE_ENV=production.");
  }
  const [admin, staff, customer] = await Promise.all(USERS.map(ensureUser));
  if (!admin || !staff || !customer) throw new Error("seed users missing");

  const existing = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.userId, customer.userId));
  if (existing.length === 0) {
    // 1. A draft that is half-way through the wizard
    const draft = await createOrder(customer, "couple");
    const [w1] = await listWills(draft.id);
    const partial = sampleAnswers();
    await submitStep(customer, w1!.id, "about", "about", partial.about);
    await submitStep(customer, w1!.id, "situation", "situation", partial.situation);

    // 2. Paid, documents ready (Texas)
    await paidOrder(customer, sampleAnswers());

    // 3. Signed, waiting for staff to deposit with the court (Texas)
    const court = await paidOrder(customer, sampleAnswers());
    await uploadSignedWill(customer, court.order.id, court.will.id, {
      bytes: SIGNED_PDF,
      filename: "signed-will.pdf",
    });
    await recordExecutionAndChooseFiling(customer, court.order.id, "court_deposit", {
      signedWithWitnesses: true,
    });

    // 4. Stored in the vault (California — no court deposit)
    const ca = sampleAnswers();
    ca.about = {
      ...ca.about,
      stateCode: "CA",
      county: "Alameda",
      city: "Oakland",
      postalCode: "94612",
    };
    const vault = await paidOrder(customer, ca);
    await uploadSignedWill(customer, vault.order.id, vault.will.id, {
      bytes: SIGNED_PDF,
      filename: "signed-will.pdf",
    });
    const { taskId } = await recordExecutionAndChooseFiling(customer, vault.order.id, "vault", {
      signedWithWitnesses: true,
    });
    await applyFilingAction(staff, taskId, { action: "vaulted", vaultReference: "VAULT-A-001" });
    console.log("Created 4 demo orders for the demo customer.");
  } else {
    console.log("Demo orders already exist — skipping.");
  }

  console.log("\nDemo credentials (password for all accounts):", PASSWORD);
  for (const u of USERS) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
}

main()
  .catch((err: unknown) => {
    console.error("Seed failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
