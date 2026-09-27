/**
 * Order status state machine.
 *
 *   draft → paid → documents_ready → awaiting_execution → executed → filing_in_progress → filed
 *                                                                                      ↘ vaulted
 *   draft → cancelled;  paid | documents_ready | awaiting_execution → refunded
 *   Updating the will (within the free-update window) returns a signed/filed order to
 *   documents_ready because the new version must be signed again.
 */

export const ORDER_STATUSES = [
  "draft",
  "paid",
  "documents_ready",
  "awaiting_execution",
  "executed",
  "filing_in_progress",
  "filed",
  "vaulted",
  "cancelled",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  draft: ["paid", "cancelled"],
  paid: ["documents_ready", "refunded"],
  documents_ready: ["awaiting_execution", "refunded"],
  awaiting_execution: ["executed", "documents_ready", "refunded"],
  executed: ["filing_in_progress", "documents_ready"],
  filing_in_progress: ["filed", "vaulted"],
  filed: ["documents_ready"],
  vaulted: ["documents_ready"],
  cancelled: [],
  refunded: [],
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "In progress",
  paid: "Paid",
  documents_ready: "Documents ready",
  awaiting_execution: "Awaiting signing",
  executed: "Signed",
  filing_in_progress: "Filing in progress",
  filed: "Filed",
  vaulted: "In our vault",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
  ) {
    super(`Illegal order status transition: ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

export function isTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}

/** Statuses in which the customer holds final (paid) documents. */
export function hasFinalDocuments(status: OrderStatus): boolean {
  return [
    "documents_ready",
    "awaiting_execution",
    "executed",
    "filing_in_progress",
    "filed",
    "vaulted",
  ].includes(status);
}

/** Statuses in which the customer may upload a signed copy / mark as signed. */
export function canRecordExecution(status: OrderStatus): boolean {
  return status === "documents_ready" || status === "awaiting_execution";
}

/** Statuses from which a paid will may be updated (a new version is created). */
export function canStartUpdate(status: OrderStatus): boolean {
  return ["documents_ready", "awaiting_execution", "executed", "filed", "vaulted"].includes(status);
}

export type TimelineState = "done" | "current" | "upcoming";

export interface TimelineStage {
  key: string;
  label: string;
  state: TimelineState;
}

const HAPPY_PATH: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "draft", label: "Answer the questions", statuses: ["draft"] },
  { key: "paid", label: "Payment received", statuses: ["paid"] },
  { key: "documents_ready", label: "Documents ready", statuses: ["documents_ready"] },
  { key: "awaiting_execution", label: "Sign with witnesses", statuses: ["awaiting_execution"] },
  { key: "executed", label: "Signed copy received", statuses: ["executed"] },
  { key: "filing", label: "Filing / safekeeping", statuses: ["filing_in_progress"] },
  { key: "complete", label: "Filed or stored", statuses: ["filed", "vaulted"] },
];

/** Customer-facing progress timeline. */
export function orderTimeline(status: OrderStatus): TimelineStage[] {
  if (status === "cancelled" || status === "refunded") {
    return [{ key: status, label: ORDER_STATUS_LABELS[status], state: "current" }];
  }
  const currentIndex = HAPPY_PATH.findIndex((s) => s.statuses.includes(status));
  return HAPPY_PATH.map((stage, i) => ({
    key: stage.key,
    label:
      stage.key === "complete" && (status === "filed" || status === "vaulted")
        ? ORDER_STATUS_LABELS[status]
        : stage.label,
    state:
      i < currentIndex || (i === currentIndex && (status === "filed" || status === "vaulted"))
        ? "done"
        : i === currentIndex
          ? "current"
          : "upcoming",
  }));
}
