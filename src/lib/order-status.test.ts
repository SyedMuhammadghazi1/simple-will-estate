import { describe, expect, it } from "vitest";
import {
  IllegalTransitionError,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  assertTransition,
  canRecordExecution,
  canStartUpdate,
  canTransition,
  hasFinalDocuments,
  isTerminal,
  orderTimeline,
  type OrderStatus,
} from "./order-status";

describe("order status machine", () => {
  it.each([
    ["draft", "paid"],
    ["draft", "cancelled"],
    ["paid", "documents_ready"],
    ["paid", "refunded"],
    ["documents_ready", "awaiting_execution"],
    ["awaiting_execution", "executed"],
    ["executed", "filing_in_progress"],
    ["filing_in_progress", "filed"],
    ["filing_in_progress", "vaulted"],
    ["filed", "documents_ready"],
    ["vaulted", "documents_ready"],
    ["executed", "documents_ready"],
  ] as [OrderStatus, OrderStatus][])("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it.each([
    ["draft", "documents_ready"],
    ["draft", "executed"],
    ["paid", "executed"],
    ["documents_ready", "executed"],
    ["documents_ready", "filed"],
    ["executed", "filed"],
    ["filing_in_progress", "refunded"],
    ["filed", "vaulted"],
    ["cancelled", "draft"],
    ["refunded", "paid"],
    ["paid", "draft"],
  ] as [OrderStatus, OrderStatus][])("rejects %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(IllegalTransitionError);
  });

  it("never allows self-transitions", () => {
    for (const s of ORDER_STATUSES) expect(canTransition(s, s)).toBe(false);
  });

  it("only references known statuses", () => {
    for (const targets of Object.values(ORDER_TRANSITIONS)) {
      for (const t of targets) expect(ORDER_STATUSES).toContain(t);
    }
  });

  it("marks cancelled and refunded as terminal", () => {
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("refunded")).toBe(true);
    expect(isTerminal("filed")).toBe(false);
  });

  it("every non-terminal status is reachable from draft", () => {
    const seen = new Set<OrderStatus>(["draft"]);
    const queue: OrderStatus[] = ["draft"];
    while (queue.length) {
      const s = queue.shift() as OrderStatus;
      for (const t of ORDER_TRANSITIONS[s]) {
        if (!seen.has(t)) {
          seen.add(t);
          queue.push(t);
        }
      }
    }
    expect([...seen].sort()).toEqual([...ORDER_STATUSES].sort());
  });

  it("exposes status capabilities", () => {
    expect(hasFinalDocuments("draft")).toBe(false);
    expect(hasFinalDocuments("paid")).toBe(false);
    expect(hasFinalDocuments("documents_ready")).toBe(true);
    expect(canRecordExecution("awaiting_execution")).toBe(true);
    expect(canRecordExecution("executed")).toBe(false);
    expect(canStartUpdate("filing_in_progress")).toBe(false);
    expect(canStartUpdate("filed")).toBe(true);
  });
});

describe("orderTimeline", () => {
  it("marks earlier stages done and the current stage current", () => {
    const t = orderTimeline("awaiting_execution");
    expect(t.map((s) => s.state)).toEqual([
      "done",
      "done",
      "done",
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("marks everything done when filed or vaulted", () => {
    expect(orderTimeline("vaulted").every((s) => s.state === "done")).toBe(true);
    expect(orderTimeline("filed").at(-1)?.label).toBe("Filed");
  });

  it("shows a single stage for cancelled orders", () => {
    expect(orderTimeline("refunded")).toEqual([
      { key: "refunded", label: "Refunded", state: "current" },
    ]);
  });
});
