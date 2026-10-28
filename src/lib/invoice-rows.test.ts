import { describe, expect, it } from "vitest";
import { buildAgentInput, rulesRun } from "./agent";
import { computeExposure } from "./exposure";
import { ratesFor, volsFor } from "./fx";
import { invoiceRows } from "./invoice-rows";
import { addDays } from "./seed-data";
import { DAY, SEED_BOOK, syntheticEcb } from "./test-fixtures";

const ecb = syntheticEcb();
const ccys = ["USD", "EUR", "GBP", "JPY", "KRW"];
const rates = ratesFor(ecb, "USD", ccys);
const vols = volsFor(ecb, "USD", ccys, addDays(DAY, -120), DAY);
const input = buildAgentInput(SEED_BOOK, rates, vols, computeExposure(SEED_BOOK, rates, DAY, { base: "USD" }), "USD", DAY, new Date(DAY + "T09:00:00Z"));
const run = rulesRun(input, "test");

describe("invoice grid rows", () => {
  const rows = invoiceRows(SEED_BOOK, rates, vols, { base: "USD", asOf: DAY, shockPct: 3, input, run });
  it("lists every open invoice once, largest risk first", () => {
    const open = SEED_BOOK.filter((i) => i.amountDue > 0 && i.status !== "MARKED_AS_PAID");
    expect(rows).toHaveLength(open.length);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].atRisk).toBeGreaterThanOrEqual(rows[i].atRisk);
  });
  it("home-currency invoices carry no FX risk; overdue ones have no swing to their due date", () => {
    const usd = rows.find((r) => r.currency === "USD")!;
    expect([usd.atRisk, usd.swing]).toEqual([0, 0]);
    const late = rows.find((r) => r.currency !== "USD" && r.daysToDue < 0)!;
    expect(late.swing).toBeNull();
    expect(late.atRisk).toBeCloseTo(late.value * 0.03, 9);
  });
  it("shows what the agent proposed today", () => {
    expect(rows.some((r) => r.agent === "Reminder proposed")).toBe(true);
    expect(rows.some((r) => /% offer proposed$/.test(r.agent))).toBe(true);
  });
  it("keeps an invoice paid today (greyed) and shows an open early-payment offer", () => {
    const eur = SEED_BOOK.find((i) => i.currency === "EUR" && i.amountDue > 0 && i.dueDate > DAY)!;
    const paid = { ...eur, status: "PAID", amountDue: 0, payments: [{ date: DAY, amount: eur.amountDue }] };
    const withOffer = { ...eur, id: "X2", number: "X2", offer: { id: "O", number: "X2-EP", amount: 990, dueDate: addDays(DAY, 7), percent: 1, state: "open" as const } };
    const r = invoiceRows([paid, withOffer], rates, vols, { base: "USD", asOf: DAY, shockPct: 3, input, run });
    const p = r.find((x) => x.id === eur.id)!;
    expect([p.paidToday, p.agent, p.atRisk]).toEqual([true, "Paid today", 0]);
    const o = r.find((x) => x.id === "X2")!;
    expect(o.offerState).toBe("open");
    expect(o.offer).toMatch(/^EUR 990 · [A-Z][a-z]{2} \d{1,2}$/);
  });
  it("carries the agent's open proposal for approving from the grid, and the client's payment history", () => {
    const withAction = rows.filter((r) => r.action);
    expect(withAction.length).toBe(run.proposals.length);
    for (const r of withAction) {
      const p = run.proposals.find((x) => x.invoiceId === r.id)!;
      expect(r.action!.kind).toBe(p.kind);
      if (p.kind === "reminder" && r.action!.kind === "reminder") expect(r.action!.message).toBe(p.message);
      if (p.kind === "early_pay_discount" && r.action!.kind === "early_pay_discount") expect(r.action!.percent).toBe(p.percent);
    }
    expect(rows.some((r) => /^pays (on time|~\d+ days late)$/.test(r.usuallyPays))).toBe(true);
    const withHistory = rows.filter((r) => r.history.length);
    expect(withHistory.length).toBeGreaterThan(0);
    for (const r of withHistory) {
      expect(r.history.length).toBeLessThanOrEqual(6);
      const days = r.history.map((h) => h.paidOn);
      expect(days).toEqual([...days].sort().reverse());
      for (const h of r.history) expect(h.daysLate).toBeGreaterThanOrEqual(0);
    }
    expect(rows.filter((r) => r.usuallyPays).every((r) => r.history.length > 0)).toBe(true);
  });
});
