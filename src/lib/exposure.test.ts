import { describe, expect, it } from "vitest";
import { bucketOf, computeExposure, daysBetween } from "./exposure";
import { crossToKrw, dailyVol, oneSigmaKrw } from "./fx";
import { buildProposals } from "./proposals";
import type { Invoice } from "./types";

const AS_OF = "2026-10-23";
const RATES = { USD: 1300, EUR: 1500, JPY: 9 };

const inv = (p: Partial<Invoice>): Invoice => ({
  id: p.id ?? "I-1",
  number: p.number ?? "0001",
  status: p.status ?? "SENT",
  currency: p.currency ?? "USD",
  amountDue: p.amountDue ?? 1000,
  dueDate: p.dueDate ?? "2026-10-30",
  invoiceDate: p.invoiceDate ?? "2026-10-01",
});

describe("buckets", () => {
  it("splits by days to due", () => {
    expect(daysBetween(AS_OF, "2026-10-30")).toBe(7);
    expect(bucketOf("2026-10-22", AS_OF)).toBe("overdue");
    expect(bucketOf("2026-10-23", AS_OF)).toBe("w1");
    expect(bucketOf("2026-10-29", AS_OF)).toBe("w1");
    expect(bucketOf("2026-10-30", AS_OF)).toBe("w2");
    expect(bucketOf("2026-11-19", AS_OF)).toBe("w4");
    expect(bucketOf("2026-11-20", AS_OF)).toBe("later");
    expect(bucketOf("not-a-date", AS_OF)).toBeNull();
  });
});

describe("computeExposure", () => {
  it("sums open foreign invoices, values them in KRW and applies a symmetric shock", () => {
    const e = computeExposure(
      [
        inv({ id: "a", currency: "USD", amountDue: 1000, dueDate: "2026-10-20" }),
        inv({ id: "b", currency: "USD", amountDue: 500, dueDate: "2026-11-05" }),
        inv({ id: "c", currency: "EUR", amountDue: 2000, dueDate: "2026-12-31" }),
      ],
      RATES,
      AS_OF,
    );
    expect(e.rows.map((r) => r.currency)).toEqual(["EUR", "USD"]); // 3.0M KRW before 1.95M KRW
    const usd = e.rows.find((r) => r.currency === "USD")!;
    expect(usd.total).toBe(1500);
    expect(usd.buckets.overdue).toBe(1000);
    expect(usd.buckets.w2).toBe(500);
    expect(usd.krw).toBe(1_950_000);
    expect(e.totalKrw).toBe(4_950_000);
    expect(e.totalShockKrw).toBeCloseTo(148_500);
  });

  it("ignores paid, draft and zero-balance invoices", () => {
    const e = computeExposure(
      [inv({ status: "PAID" }), inv({ status: "DRAFT" }), inv({ status: "PAYMENT_PENDING" }), inv({ amountDue: 0 })],
      RATES,
      AS_OF,
    );
    expect(e.rows).toHaveLength(0);
    expect(e.skipped).toHaveLength(0);
  });

  it("keeps base-currency invoices out of the FX exposure", () => {
    const e = computeExposure([inv({ currency: "KRW", amountDue: 5_000_000 })], RATES, AS_OF);
    expect(e.rows).toHaveLength(0);
    expect(e.baseTotal).toBe(5_000_000);
    expect(e.totalKrw).toBe(0);
  });

  it("reports what it cannot value instead of dropping it silently", () => {
    const e = computeExposure(
      [inv({ id: "x", currency: "GBP" }), inv({ id: "y", dueDate: "soon" })],
      RATES,
      AS_OF,
    );
    expect(e.skipped).toEqual([
      { id: "x", reason: "no GBP/KRW rate" },
      { id: "y", reason: 'unreadable due date "soon"' },
    ]);
  });
});

describe("fx helpers", () => {
  it("crosses EUR-based ECB quotes into KRW per unit", () => {
    const r = crossToKrw({ KRW: 1484.25, USD: 1.1205, JPY: 175.97 }, ["USD", "EUR", "JPY"]);
    expect(r.EUR).toBe(1484.25);
    expect(r.USD).toBeCloseTo(1324.63, 2);
    expect(r.JPY).toBeCloseTo(8.4347, 4);
  });

  it("returns nothing rather than a wrong number when KRW is missing", () => {
    expect(crossToKrw({ USD: 1.12 }, ["USD"])).toEqual({});
  });

  it("needs enough history before giving a volatility", () => {
    expect(dailyVol([1, 2, 3])).toBeNull();
    const flat = Array.from({ length: 30 }, () => 1300);
    expect(dailyVol(flat)).toBe(0);
  });

  it("scales the swing with the square root of time", () => {
    expect(oneSigmaKrw(1_000_000, 0.01, 4)).toBeCloseTo(20_000);
    expect(oneSigmaKrw(1_000_000, 0.01, 0)).toBe(0);
  });
});

describe("buildProposals", () => {
  const book = [
    inv({ id: "late", number: "L1", currency: "USD", amountDue: 2000, dueDate: "2026-10-13" }),
    inv({ id: "far", number: "F1", currency: "EUR", amountDue: 3000, dueDate: "2026-11-30" }),
    inv({ id: "near", number: "N1", currency: "EUR", amountDue: 3000, dueDate: "2026-10-28" }),
    inv({ id: "small", number: "S1", currency: "USD", amountDue: 100, dueDate: "2026-10-01" }),
  ];

  it("proposes reminders for overdue invoices and discounts for distant ones, overdue first", () => {
    const p = buildProposals(book, RATES, AS_OF, { dailyVols: { EUR: 0.005 } });
    expect(p.map((x) => `${x.kind}:${x.invoiceId}`)).toEqual(["reminder:late", "early_pay_discount:far"]);
    const r = p[0];
    expect(r.kind === "reminder" && r.daysOverdue).toBe(10);
  });

  it("prices the discount and shows both swings without picking a side", () => {
    const p = buildProposals(book, RATES, AS_OF, { dailyVols: { EUR: 0.005 } });
    const d = p.find((x) => x.kind === "early_pay_discount")!;
    if (d.kind !== "early_pay_discount") throw new Error("unexpected");
    expect(d.costKrw).toBe(45_000); // 1% of 4.5M KRW
    expect(d.swingNowKrw!).toBeGreaterThan(d.swingIfEarlyKrw!);
  });

  it("leaves the swing empty when volatility is unknown", () => {
    const p = buildProposals(book, RATES, AS_OF);
    const d = p.find((x) => x.kind === "early_pay_discount")!;
    if (d.kind !== "early_pay_discount") throw new Error("unexpected");
    expect(d.swingNowKrw).toBeNull();
  });
});
