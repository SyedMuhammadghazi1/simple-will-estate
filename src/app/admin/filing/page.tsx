import type { Metadata } from "next";
import Link from "next/link";
import { FilingActions } from "@/components/order/filing-actions";
import { FILING_METHOD_LABELS, FILING_STATUS_LABELS, type FilingTaskStatus } from "@/lib/filing";
import { writeAudit } from "@/server/audit";
import { listFilingQueue } from "@/server/services/filing";
import { auditActor, orderRef } from "@/server/services/orders";
import { requireRole, STAFF_ROLES } from "@/server/session";

export const metadata: Metadata = { title: "Filing queue" };

export default async function FilingQueuePage() {
  const actor = await requireRole(STAFF_ROLES, "/admin/filing");
  const queue = await listFilingQueue();
  await writeAudit(auditActor(actor), {
    action: "staff.filing_queue.viewed",
    metadata: { results: queue.length },
  });
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Filing queue</h1>
      {queue.length === 0 && <p className="text-muted">Nothing waiting. 🎉</p>}
      <ul className="space-y-4">
        {queue.map(({ task, customerName, customerEmail }) => (
          <li key={task.id} className="card space-y-3" data-testid="filing-task">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                <Link href={`/admin/orders/${task.orderId}`} className="link font-mono">
                  {orderRef(task.orderId)}
                </Link>{" "}
                · {FILING_METHOD_LABELS[task.method]} · {task.stateCode}
                {task.depositAuthority ? ` · ${task.depositAuthority}` : ""}
              </p>
              <span className="text-sm">
                {FILING_STATUS_LABELS[task.status as FilingTaskStatus] ?? task.status}
              </span>
            </div>
            <p className="text-muted text-sm">
              {customerName} ({customerEmail}) · requested{" "}
              {task.createdAt.toLocaleDateString("en-US")}
              {task.trackingNumber ? ` · tracking ${task.trackingNumber}` : ""}
            </p>
            <FilingActions taskId={task.id} method={task.method} status={task.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}
