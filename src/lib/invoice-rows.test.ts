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
    expect([usd.atRisk, usd.swing, usd.agent]).toEqual([0, 0, "No FX risk"]);
    const late = rows.find((r) => r.currency !== "USD" && r.daysToDue < 0)!;
    expect(late.swing).toBeNull();
    expect(late.atRisk).toBeCloseTo(late.value * 0.03, 9);
  });
  it("shows what the agent proposed today", () => {
    expect(rows.some((r) => r.agent === "Reminder proposed")).toBe(true);
    expect(rows.some((r) => /% offer proposed$/.test(r.agent))).toBe(true);
  });
});
