import type { Metadata } from "next";
import Link from "next/link";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { unreviewedStates } from "@/lib/states";
import { adminDashboardCounts } from "@/server/services/admin";
import { requireRole, STAFF_ROLES } from "@/server/session";

export const metadata: Metadata = { title: "Staff console" };

export default async function AdminHome() {
  const actor = await requireRole(STAFF_ROLES, "/admin");
  const { counts, openFiling, pendingDeletion } = await adminDashboardCounts(actor);
  const unreviewed = unreviewedStates();
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Overview</h1>
      {unreviewed.length > 0 && (
        <div
          role="alert"
          className="bg-danger-light text-danger rounded-md border border-red-200 p-4 text-sm"
        >
          <strong>{unreviewed.length} jurisdictions</strong> have state rules that are not yet
          verified by a licensed attorney.{" "}
          <Link href="/admin/states" className="underline">
            Review status
          </Link>
          .
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/admin/filing" className="card hover:border-brand">
          <p className="text-muted text-sm">Open filing tasks</p>
          <p className="text-3xl font-bold" data-testid="open-filing-count">
            {openFiling}
          </p>
        </Link>
        <Link href="/admin/orders?status=awaiting_execution" className="card hover:border-brand">
          <p className="text-muted text-sm">Awaiting signing</p>
          <p className="text-3xl font-bold">
            {(counts.documents_ready ?? 0) + (counts.awaiting_execution ?? 0)}
          </p>
        </Link>
        <div className="card">
          <p className="text-muted text-sm">Pending deletion requests</p>
          <p className="text-3xl font-bold">{pendingDeletion.length}</p>
        </div>
      </div>
      <section className="card">
        <h2 className="text-lg font-semibold">Orders by status</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-5">
          {ORDER_STATUSES.map((s) => (
            <li key={s}>
              <Link href={`/admin/orders?status=${s}`} className="link text-sm">
                {ORDER_STATUS_LABELS[s]}: {counts[s] ?? 0}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {pendingDeletion.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold">Deletion requests</h2>
          <p className="text-muted text-sm">
            Process manually following the retention policy in docs/RUNBOOK.md.
          </p>
          <ul className="mt-2 text-sm">
            {pendingDeletion.map((d) => (
              <li key={d.id}>
                Request {d.id.slice(0, 8)} — {d.createdAt.toLocaleDateString("en-US")}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
