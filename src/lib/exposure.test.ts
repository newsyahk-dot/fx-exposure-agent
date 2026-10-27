import { describe, expect, it } from "vitest";
import { bucketOf, computeExposure, daysBetween } from "./exposure";
import { cross, dailyVol, oneSigma, rateOn, type EcbQuotes } from "./fx";
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
    expect(usd.value).toBe(1_950_000);
    expect(e.totalValue).toBe(4_950_000);
    expect(e.totalShock).toBeCloseTo(148_500);
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
    expect(e.totalValue).toBe(0);
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
  const q = { KRW: 1484.25, USD: 1.1205, JPY: 175.97, GBP: 0.86 };

  it("crosses EUR-based ECB quotes into any home currency", () => {
    const krw = cross(q, "KRW", ["USD", "EUR", "JPY"]);
    expect(krw.EUR).toBe(1484.25);
    expect(krw.USD).toBeCloseTo(1324.63, 2);
    expect(krw.JPY).toBeCloseTo(8.4347, 4);
    const usd = cross(q, "USD", ["EUR", "GBP", "USD"]);
    expect(usd.EUR).toBeCloseTo(1.1205, 6);
    expect(usd.GBP).toBeCloseTo(1.1205 / 0.86, 6);
    expect(usd.USD).toBe(1);
    expect(cross(q, "EUR", ["USD"]).USD).toBeCloseTo(1 / 1.1205, 6);
  });

  it("returns nothing rather than a wrong number when the home currency is missing", () => {
    expect(cross({ USD: 1.12 }, "KRW", ["USD"])).toEqual({});
  });

  it("uses the last ECB fixing on or before a day (weekends, holidays)", () => {
    const e: EcbQuotes = { date: "2026-10-09", latest: q, history: { "2026-10-08": { USD: 1.1 }, "2026-10-09": { USD: 1.2 } } };
    expect(rateOn(e, "USD", "EUR", "2026-10-11")).toEqual({ date: "2026-10-09", rate: 1.2 });
    expect(rateOn(e, "USD", "EUR", "2026-10-08")?.rate).toBe(1.1);
    expect(rateOn(e, "USD", "EUR", "2026-10-01")).toBeNull();
  });

  it("needs enough history before giving a volatility", () => {
    expect(dailyVol([1, 2, 3])).toBeNull();
    const flat = Array.from({ length: 30 }, () => 1300);
    expect(dailyVol(flat)).toBe(0);
  });

  it("scales the swing with the square root of time", () => {
    expect(oneSigma(1_000_000, 0.01, 4)).toBeCloseTo(20_000);
    expect(oneSigma(1_000_000, 0.01, 0)).toBe(0);
  });
});

describe("ecb fixings before a day", () => {
  it("keeps only fixings published before the day and uses the last one as latest", async () => {
    const { ecbBefore } = await import("./fx");
    const q: EcbQuotes = {
      date: "2026-10-27",
      latest: { USD: 3 },
      history: { "2026-10-23": { USD: 1 }, "2026-10-26": { USD: 2 }, "2026-10-27": { USD: 3 } },
    };
    const r = ecbBefore(q, "2026-10-27");
    expect(r.date).toBe("2026-10-26");
    expect(r.latest).toEqual({ USD: 2 });
    expect(Object.keys(r.history)).toEqual(["2026-10-23", "2026-10-26"]);
  });
  it("returns the quotes unchanged when nothing is older", async () => {
    const { ecbBefore } = await import("./fx");
    const q: EcbQuotes = { date: "2026-10-27", latest: { USD: 3 }, history: { "2026-10-27": { USD: 3 } } };
    expect(ecbBefore(q, "2026-10-01")).toBe(q);
  });
});
