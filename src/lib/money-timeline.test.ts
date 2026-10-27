import { describe, expect, it } from "vitest";
import type { AgentInput, AgentRun } from "./agent";
import { moneyTimeline } from "./money-timeline";

const cand = (id: string, value: number, daysToDue: number | null) =>
  ({ invoiceId: id, invoiceNumber: id, value, daysToDue, daysOverdue: daysToDue == null ? 10 : null }) as AgentInput["candidates"][number];

describe("when the money comes in", () => {
  const input = { candidates: [cand("late", 1000, null), cand("soon", 500, 3), cand("far", 4000, 60)] } as AgentInput;
  const run = {
    proposals: [
      { kind: "reminder", invoiceId: "late" },
      { kind: "early_pay_discount", invoiceId: "far", percent: 1, withinDays: 7 },
    ],
  } as unknown as AgentRun;
  const t = moneyTimeline(input, run);

  it("places invoices by due date as invoiced, late ones first", () => {
    expect(t.bins.find((b) => b.key === "late")!.asInvoiced).toBe(1000);
    expect(t.bins.find((b) => b.key === "w1")!.asInvoiced).toBe(500);
    expect(t.bins.find((b) => b.key === "later")!.asInvoiced).toBe(4000);
    expect(t.total).toBe(5500);
  });

  it("moves reminded and offered invoices as the proposals ask, net of the discount", () => {
    expect(t.bins.find((b) => b.key === "late")!.asProposed).toBe(0);
    expect(t.bins.find((b) => b.key === "w1")!.asProposed).toBeCloseTo(1000 + 500 + 3960, 6);
    expect(t.soon).toEqual({ days: 14, asInvoiced: 500, asProposed: 5460 });
  });
});
