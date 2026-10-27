import { describe, expect, it } from "vitest";
import type { EcbQuotes } from "./fx";
import { analyzeOwn } from "./own-analysis";
import { sampleCsv } from "./own-invoices";

// 200 ECB days of slightly moving quotes (units per EUR).
function quotes(today: string): EcbQuotes {
  const base = { USD: 1.08, GBP: 0.85, JPY: 163, CAD: 1.48, KRW: 1450 };
  const history: EcbQuotes["history"] = {};
  for (let i = 200; i >= 1; i--) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const k = 1 + 0.01 * Math.sin(i / 3);
    history[d.toISOString().slice(0, 10)] = Object.fromEntries(Object.entries(base).map(([c, v]) => [c, v * k]));
  }
  const date = Object.keys(history).sort().at(-1)!;
  return { date, latest: history[date], history };
}

describe("your own invoices", () => {
  const today = "2026-10-27";
  const { analysis: a } = analyzeOwn(sampleCsv(today), "USD", quotes(today), today, new Date(`${today}T12:00:00Z`));

  it("values every foreign invoice and keeps the home-currency one apart", () => {
    expect(a.read).toBe(6);
    expect(a.skipped).toEqual([]);
    expect(a.rows.map((r) => r.currency).sort()).toEqual(["CAD", "EUR", "GBP", "JPY"]);
    expect(a.baseTotal).toBe(2500); // the USD invoice carries no FX risk for a USD seller
    expect(a.waiting).toBeGreaterThan(0);
    expect(a.shock).toBeCloseTo(a.waiting * 0.03, 6);
  });

  it("counts what is late and plans with the same rules as the demo", () => {
    expect(a.overdueCount).toBe(2); // INV-104 and INV-107
    expect(a.run.source).toBe("rules");
    expect(a.run.proposals.filter((p) => p.kind === "reminder").map((p) => p.invoiceNumber).sort()).toEqual(["INV-104", "INV-107"]);
    for (const p of a.run.proposals) if (p.kind === "early_pay_discount") expect(p.daysToDue - p.withinDays).toBeGreaterThanOrEqual(21);
  });
});
