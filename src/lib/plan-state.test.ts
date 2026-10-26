import { describe, expect, it } from "vitest";
import { buildAgentInput, rulesRun } from "./agent";
import { appendAgentLog, parseAgentLog } from "./agent-log";
import { computeExposure } from "./exposure";
import { ratesFor, volsFor } from "./fx";
import { notInPlan, proposalState } from "./plan-state";
import { addDays } from "./seed-data";
import { DAY, SEED_BOOK, syntheticEcb } from "./test-fixtures";
import type { Invoice } from "./types";

const NOW = new Date(DAY + "T09:00:00Z");
const ecb = syntheticEcb();
const input = (book: Invoice[]) => {
  const ccys = ["USD", "EUR", "JPY", "GBP", "KRW"];
  const rates = ratesFor(ecb, "USD", ccys);
  return buildAgentInput(book, rates, volsFor(ecb, "USD", ccys, addDays(DAY, -120), DAY), computeExposure(book, rates, DAY, { base: "USD" }), "USD", DAY, NOW);
};

const planned = "2026-10-23T08:00:00.000Z";
const run = { ...rulesRun(input(SEED_BOOK), "test"), plannedAt: planned };
const reminder = run.proposals.find((p) => p.kind === "reminder")!;
const offer = run.proposals.find((p) => p.kind === "early_pay_discount")!;
const withInvoice = (id: string, f: (i: Invoice) => Invoice) => SEED_BOOK.map((i) => (i.id === id ? f(i) : i));

describe("proposal state against the current book", () => {
  it("open while nothing happened", () => {
    expect(proposalState(reminder, input(SEED_BOOK), SEED_BOOK, planned)).toEqual({ state: "open" });
    expect(proposalState(offer, input(SEED_BOOK), SEED_BOOK, planned)).toEqual({ state: "open" });
  });
  it("done once the action is logged after the plan, with the autopilot mark", () => {
    const book = withInvoice(reminder.invoiceId, (i) => ({ ...i, agentLog: parseAgentLog(appendAgentLog(undefined, "reminder", new Date("2026-10-23T09:30:00Z"), true)) }));
    expect(proposalState(reminder, input(book), book, planned)).toEqual({ state: "done", at: "2026-10-23T09:30:00.000Z", auto: true });
  });
  it("an action logged before the plan does not count as done", () => {
    const book = withInvoice(offer.invoiceId, (i) => ({ ...i, agentLog: parseAgentLog(appendAgentLog(undefined, "early_pay_discount", new Date("2026-10-22T09:30:00Z"))) }));
    expect(proposalState(offer, input(book), book, planned)).toEqual({ state: "changed" }); // already discounted: not eligible
  });
  it("paid, closed", () => {
    const paid = withInvoice(reminder.invoiceId, (i) => ({ ...i, status: "MARKED_AS_PAID", amountDue: 0 }));
    expect(proposalState(reminder, input(paid), paid, planned)).toEqual({ state: "paid" });
    const gone = SEED_BOOK.filter((i) => i.id !== reminder.invoiceId);
    expect(proposalState(reminder, input(gone), gone, planned)).toEqual({ state: "closed" });
  });
  it("finds eligible invoices the plan never saw", () => {
    const extra: Invoice = { ...SEED_BOOK.find((i) => i.id === offer.invoiceId)!, id: "INV2-NEW", number: "FXA-N-NEW" };
    expect(notInPlan(run, input([...SEED_BOOK, extra])).map((c) => c.invoiceNumber)).toEqual(["FXA-N-NEW"]);
    expect(notInPlan(run, input(SEED_BOOK))).toEqual([]);
  });
});
