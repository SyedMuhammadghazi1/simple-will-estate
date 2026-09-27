import type { Metadata } from "next";
import Link from "next/link";
import { adminListAudit } from "@/server/services/admin";
import { requireRole } from "@/server/session";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; orderId?: string; page?: string }>;
}) {
  const actor = await requireRole(["admin"], "/admin/audit");
  const sp = await searchParams;
  const { rows, page } = await adminListAudit(actor, {
    action: sp.action,
    orderId: sp.orderId,
    page: Number(sp.page ?? "1") || 1,
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Audit log</h1>
      <form className="card flex flex-wrap items-end gap-3" role="search">
        <div>
          <label htmlFor="action" className="label">
            Action starts with
          </label>
          <input
            id="action"
            name="action"
            defaultValue={sp.action}
            className="input mt-1"
            placeholder="staff."
          />
        </div>
        <div>
          <label htmlFor="orderId" className="label">
            Order id
          </label>
          <input id="orderId" name="orderId" defaultValue={sp.orderId} className="input mt-1" />
        </div>
        <button type="submit" className="btn btn-primary">
          Filter
        </button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50">
            <tr>
              <th scope="col" className="p-3">
                Time
              </th>
              <th scope="col" className="p-3">
                Actor
              </th>
              <th scope="col" className="p-3">
                Action
              </th>
              <th scope="col" className="p-3">
                Target
              </th>
              <th scope="col" className="p-3">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry, actorEmail }) => (
              <tr key={entry.id} className="border-line border-t align-top">
                <td className="p-3 whitespace-nowrap">{entry.createdAt.toLocaleString("en-US")}</td>
                <td className="p-3">
                  {actorEmail ?? entry.actorRole ?? "system"}
                  {entry.actorRole ? (
                    <span className="text-muted"> ({entry.actorRole})</span>
                  ) : null}
                </td>
                <td className="p-3 font-mono">{entry.action}</td>
                <td className="p-3">
                  {entry.orderId ? (
                    <Link className="link font-mono" href={`/admin/orders/${entry.orderId}`}>
                      {entry.orderId.slice(0, 8)}
                    </Link>
                  ) : (
                    (entry.targetType ?? "–")
                  )}
                </td>
                <td className="text-muted p-3 font-mono text-xs break-all">
                  {JSON.stringify(entry.metadata)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Pagination" className="flex gap-3 text-sm">
        {page > 1 && (
          <Link className="link" href={`/admin/audit?page=${page - 1}`}>
            ← Newer
          </Link>
        )}
        {rows.length === 50 && (
          <Link className="link" href={`/admin/audit?page=${page + 1}`}>
            Older →
          </Link>
        )}
      </nav>
    </div>
  );
}
