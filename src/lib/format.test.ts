import { describe, expect, it } from "vitest";
import demo from "../data/demo-snapshot.json";
import { demoInputs } from "./book";
import { computeExposure } from "./exposure";
import { cell, krwCompact, money } from "./format";
import { buildProposals } from "./proposals";

describe("format", () => {
  it("compacts won for tiles", () => {
    expect(krwCompact(1_569_607)).toBe("₩1.57M");
    expect(krwCompact(52_320_219)).toBe("₩52.3M");
    expect(krwCompact(86_101)).toBe("₩86K");
    expect(krwCompact(9_800)).toBe("₩9,800");
    expect(krwCompact(-2_000_000)).toBe("-₩2.00M");
  });

  it("uses no decimals for yen", () => {
    expect(money("JPY", 310000)).toBe("JPY 310,000");
    expect(money("USD", 4200)).toBe("USD 4,200.00");
    expect(cell("USD", 0)).toBe("");
  });
});

describe("demo snapshot", () => {
  it("holds everything the page needs and produces the same screen as live", () => {
    const d = demoInputs();
    expect(d.source).toBe("demo");
    expect(d.rates.USD).toBeGreaterThan(0);
    expect(d.invoices.length).toBe((demo as { invoices: unknown[] }).invoices.length);
    const e = computeExposure(d.invoices, d.rates, d.asOf);
    expect(e.rows.map((r) => r.currency).sort()).toEqual(["EUR", "JPY", "USD"]);
    const p = buildProposals(d.invoices, d.rates, d.asOf, { dailyVols: d.dailyVols });
    expect(p.some((x) => x.kind === "reminder")).toBe(true);
    expect(p.some((x) => x.kind === "early_pay_discount" && x.swingNowKrw != null)).toBe(true);
  });
});
