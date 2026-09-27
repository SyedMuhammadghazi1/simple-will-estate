import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { PLANS, formatCents } from "@/lib/pricing";
import { adminListOrders } from "@/server/services/admin";
import { orderRef } from "@/server/services/orders";
import { requireRole, STAFF_ROLES } from "@/server/session";

export const metadata: Metadata = { title: "Orders" };

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; plan?: string; q?: string; page?: string }>;
}) {
  const actor = await requireRole(STAFF_ROLES, "/admin/orders");
  const sp = await searchParams;
  const { rows, total, page, pageSize } = await adminListOrders(actor, {
    status: sp.status,
    plan: sp.plan,
    q: sp.q,
    page: Number(sp.page ?? "1") || 1,
  });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (p: number) =>
    new URLSearchParams({
      ...(sp.status ? { status: sp.status } : {}),
      ...(sp.plan ? { plan: sp.plan } : {}),
      ...(sp.q ? { q: sp.q } : {}),
      page: String(p),
    }).toString();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Orders</h1>
      <form className="card grid gap-3 sm:grid-cols-4" role="search">
        <div className="sm:col-span-2">
          <label htmlFor="q" className="label">
            Search (email, name or order ref)
          </label>
          <input id="q" name="q" defaultValue={sp.q} className="input mt-1" />
        </div>
        <div>
          <label htmlFor="status" className="label">
            Status
          </label>
          <select id="status" name="status" defaultValue={sp.status ?? ""} className="input mt-1">
            <option value="">All</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="plan" className="label">
            Plan
          </label>
          <select id="plan" name="plan" defaultValue={sp.plan ?? ""} className="input mt-1">
            <option value="">All</option>
            {Object.values(PLANS).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary sm:col-span-4 sm:justify-self-start">
          Filter
        </button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Orders</caption>
          <thead className="bg-stone-50">
            <tr>
              <th scope="col" className="p-3">
                Ref
              </th>
              <th scope="col" className="p-3">
                Customer
              </th>
              <th scope="col" className="p-3">
                Plan
              </th>
              <th scope="col" className="p-3">
                State
              </th>
              <th scope="col" className="p-3">
                Status
              </th>
              <th scope="col" className="p-3">
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-line border-t">
                <td className="p-3 font-mono">
                  <Link href={`/admin/orders/${r.id}`} className="link">
                    {orderRef(r.id)}
                  </Link>
                </td>
                <td className="p-3">
                  {r.customerName}
                  <br />
                  <span className="text-muted">{r.customerEmail}</span>
                </td>
                <td className="p-3">
                  {PLANS[r.plan].name}
                  <br />
                  <span className="text-muted">{formatCents(r.amountCents)}</span>
                </td>
                <td className="p-3">{r.stateCode ?? "–"}</td>
                <td className="p-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="p-3">{r.createdAt.toLocaleDateString("en-US")}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted p-6 text-center">
                  No orders match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="flex items-center gap-3 text-sm">
        {page > 1 && (
          <Link href={`/admin/orders?${qs(page - 1)}`} className="link">
            ← Previous
          </Link>
        )}
        <span>
          Page {page} of {pages} ({total} orders)
        </span>
        {page < pages && (
          <Link href={`/admin/orders?${qs(page + 1)}`} className="link">
            Next →
          </Link>
        )}
      </nav>
    </div>
  );
}
