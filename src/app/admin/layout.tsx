import Link from "next/link";
import type { ReactNode } from "react";
import { requireRole, STAFF_ROLES } from "@/server/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireRole(STAFF_ROLES, "/admin");
  const links = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/filing", label: "Filing queue" },
    { href: "/admin/states", label: "State rules" },
    ...(actor.role === "admin" ? [{ href: "/admin/audit", label: "Audit log" }] : []),
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-sm">
          Staff console · signed in as {actor.email} ({actor.role})
        </p>
        <nav aria-label="Staff" className="flex flex-wrap gap-2 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="btn btn-secondary min-h-9 px-3 py-1.5">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="bg-warn-light text-warn mb-6 rounded-md p-3 text-xs">
        Every view of customer information in this console is recorded in the audit log.
      </p>
      {children}
    </div>
  );
}
