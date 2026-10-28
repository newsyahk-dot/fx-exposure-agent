import { describe, expect, it } from "vitest";
import { rateOn } from "./fx";
import { DAY, SEED_BOOK, syntheticEcb } from "./test-fixtures";
import { timingEffect } from "./timing";

const ecb = syntheticEcb();

describe("what the wait already did", () => {
  it("values each recent foreign payment at the invoice-day and pay-day rates", () => {
    const t = timingEffect(SEED_BOOK, ecb, "KRW", DAY, 90);
    // Paid in the last 90 days: FXA-1005, 1006 (part), 2004, 2006, 2007 (11 days late), 3004, 3006 (6 days late), 4003 (18 days late).
    expect(t.rows.map((r) => r.invoiceNumber).sort()).toEqual(["FXA-1005", "FXA-1006", "FXA-2004", "FXA-2006", "FXA-2007", "FXA-3004", "FXA-3006", "FXA-4003"]);
    const r = t.rows.find((x) => x.invoiceNumber === "FXA-2006")!;
    const a = rateOn(ecb, "KRW", "EUR", r.invoiceDate)!.rate;
    const b = rateOn(ecb, "KRW", "EUR", r.paidDate)!.rate;
    expect(r.effect).toBeCloseTo(1200 * (b - a));
    expect(r.daysLate).toBe(2); // due -3, paid -1
    expect(t.net).toBeCloseTo(t.gains + t.losses);
    expect(t.skipped).toEqual([]);
  });

  it("counts payments already in the home currency separately, with no FX effect", () => {
    const t = timingEffect(SEED_BOOK, ecb, "USD", DAY, 90);
    expect(t.rows.some((r) => r.currency === "USD")).toBe(false);
    expect(t.inBase).toBe(900 + 1200);
  });

  it("says what it could not value instead of dropping it", () => {
    const t = timingEffect(SEED_BOOK, syntheticEcb(DAY, 20), "KRW", DAY, 90);
    expect(t.skipped.length).toBeGreaterThan(0);
    expect(t.skipped[0].reason).toMatch(/no .* rate for/);
  });
});
