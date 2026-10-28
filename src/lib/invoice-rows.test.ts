import { describe, expect, it } from "vitest";
import { buildAgentInput, rulesRun } from "./agent";
import { computeExposure } from "./exposure";
import { ratesFor, volsFor } from "./fx";
import { applyEdit, invoiceRows } from "./invoice-rows";
import { annualCostPct, OFFER_MAX_ANNUAL_PCT, OFFER_MIN_DAYS_SOONER } from "./offer-rule";
import { checkClientText } from "./checks";
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
    expect(p.paidAmount).toBe(eur.amountDue);
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
  it("lets the seller edit a draft: offers only within the rule, with code's own note for a new percent", () => {
    const offer = rows.find((r) => r.action?.kind === "early_pay_discount")!;
    const a = offer.action!;
    if (a.kind !== "early_pay_discount") throw new Error("expected an offer");
    const sooner = offer.daysToDue - a.withinDays;
    for (const pct of a.percents) {
      expect(sooner).toBeGreaterThanOrEqual(OFFER_MIN_DAYS_SOONER);
      expect(annualCostPct(pct, sooner)).toBeLessThanOrEqual(OFFER_MAX_ANNUAL_PCT);
    }
    expect(a.percents).toContain(a.percent);
    const other = a.percents.find((x) => x !== a.percent);
    if (other != null) {
      const e = applyEdit(a, { percent: other });
      if (e.kind !== "early_pay_discount") throw new Error("kind changed");
      expect([e.percent, e.edited]).toEqual([other, true]);
      expect(e.clientNote).toContain(`${other}% off`);
      expect(e.clientNote).toContain(a.newDueDate);
      expect(e.label.startsWith(`${other}% `)).toBe(true);
    }
    // A percent outside the rule (or the same one) leaves the draft as it was.
    expect(applyEdit(a, { percent: 5 })).toBe(a);
    expect(applyEdit(a, { percent: a.percent })).toBe(a);
    const rem = rows.find((r) => r.action?.kind === "reminder")!.action!;
    const edited = applyEdit(rem, { message: "Hello, just checking in on this invoice. Thank you!" });
    expect(edited.edited).toBe(true);
    expect(applyEdit(rem, { message: rem.kind === "reminder" ? rem.message : "" })).toBe(rem);
  });
  it("code's note for an edited percent passes the client-text check against the new terms", () => {
    const cand = input.candidates.find((c) => c.eligible.includes("early_pay_discount"))!;
    const row = rows.find((r) => r.id === cand.invoiceId)!;
    const a = row.action!;
    if (a.kind !== "early_pay_discount") return;
    for (const pct of a.percents) {
      const e = applyEdit(a, { percent: pct });
      if (e.kind !== "early_pay_discount") continue;
      const facts = `${cand.facts} Offer: ${pct}% off, new due date ${a.newDueDate}.`;
      expect(checkClientText(e.clientNote, facts, { maxLen: 300, allowOffer: true })).toBeNull();
    }
  });
});
