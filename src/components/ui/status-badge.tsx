import { ORDER_STATUS_LABELS, isOrderStatus } from "@/lib/order-status";

const TONES: Record<string, string> = {
  draft: "bg-stone-100 text-stone-800",
  paid: "bg-blue-100 text-blue-900",
  documents_ready: "bg-amber-100 text-amber-900",
  awaiting_execution: "bg-amber-100 text-amber-900",
  executed: "bg-indigo-100 text-indigo-900",
  filing_in_progress: "bg-indigo-100 text-indigo-900",
  filed: "bg-green-100 text-green-900",
  vaulted: "bg-green-100 text-green-900",
  cancelled: "bg-stone-200 text-stone-700",
  refunded: "bg-stone-200 text-stone-700",
};

export function StatusBadge({ status }: { status: string }) {
  const label = isOrderStatus(status) ? ORDER_STATUS_LABELS[status] : status;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[status] ?? "bg-stone-100"}`}
      data-testid="order-status"
      data-status={status}
    >
      {label}
    </span>
  );
}
