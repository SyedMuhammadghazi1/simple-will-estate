import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/forms/submit-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { PLANS, formatCents } from "@/lib/pricing";
import { listOrdersForUser, listWills, orderRef } from "@/server/services/orders";
import { decryptDraft } from "@/server/services/wills";
import { requireUser } from "@/server/session";
import { createOrderAction } from "./actions";

export const metadata: Metadata = { title: "My wills" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const actor = await requireUser("/dashboard");
  const { plan: suggested } = await searchParams;
  const orders = await listOrdersForUser(actor.userId);
  const rows = await Promise.all(
    orders.map(async (o) => {
      const wills = await listWills(o.id);
      const names = wills.map((w) => decryptDraft(w).about.fullLegalName.trim()).filter(Boolean);
      return { order: o, names };
    }),
  );
  const active = rows.filter((r) => r.order.status !== "cancelled");

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold">My wills</h1>
        <p className="text-muted mt-1">Welcome, {actor.name}.</p>
      </div>

      {active.length > 0 && (
        <section aria-labelledby="orders-heading" className="space-y-3">
          <h2 id="orders-heading" className="text-xl font-semibold">
            Your orders
          </h2>
          <ul className="space-y-3">
            {active.map(({ order, names }) => (
              <li key={order.id} className="card flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">
                    {PLANS[order.plan].name} ·{" "}
                    <span className="text-muted font-mono text-sm">{orderRef(order.id)}</span>
                  </p>
                  <p className="text-muted text-sm">
                    {names.length ? names.join(" & ") : "Not started yet"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={order.status} />
                  <Link href={`/dashboard/orders/${order.id}`} className="btn btn-secondary">
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="new-heading" className="space-y-4">
        <h2 id="new-heading" className="text-xl font-semibold">
          {active.length ? "Start another will" : "Start your will"}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {Object.values(PLANS).map((plan) => (
            <form
              key={plan.id}
              action={createOrderAction}
              className={`card flex flex-col gap-3 ${suggested === plan.id ? "ring-brand ring-2" : ""}`}
            >
              <input type="hidden" name="plan" value={plan.id} />
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="text-muted flex-1 text-sm">{plan.description}</p>
              <p className="text-2xl font-bold">{formatCents(plan.amountCents)}</p>
              <p className="text-muted text-xs">You only pay after reviewing your answers.</p>
              <SubmitButton pendingText="Starting…">
                Start {plan.id === "individual" ? "individual will" : "couple wills"}
              </SubmitButton>
            </form>
          ))}
        </div>
      </section>
    </div>
  );
}
