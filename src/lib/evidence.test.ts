import { describe, expect, it } from "vitest";
import { bandsByWait, HORIZONS, replayBook } from "./evidence";
import { walkEcb as walk } from "./test-fixtures";

const asOf = "2026-10-23";
const ecb = walk(asOf, 830);

describe("range by wait", () => {
  it("widens with the wait and covers about two years of start days", () => {
    const b = bandsByWait(ecb, "KRW", ["USD", "EUR", "JPY", "KRW"], asOf);
    const usd = b.filter((x) => x.currency === "USD");
    expect(usd.map((x) => x.horizon)).toEqual(HORIZONS);
    expect(usd[0].n).toBeGreaterThan(450);
    expect(usd.at(-1)!.p95 - usd.at(-1)!.p5).toBeGreaterThan(usd[0].p95 - usd[0].p5);
    expect(b.some((x) => x.currency === "KRW")).toBe(false);
  });
});

describe("book replay", () => {
  it("gives a narrower range when the same money arrives sooner", () => {
    const later = replayBook(ecb, "KRW", [{ currency: "USD", value: 10_000_000, waitDays: 60 }, { currency: "JPY", value: 5_000_000, waitDays: 45 }], asOf);
    const sooner = replayBook(ecb, "KRW", [{ currency: "USD", value: 10_000_000, waitDays: 7 }, { currency: "JPY", value: 5_000_000, waitDays: 7 }], asOf);
    expect(later.n).toBeGreaterThan(450);
    expect(sooner.p95 - sooner.p5).toBeLessThan(later.p95 - later.p5);
    expect(later.p5).toBeLessThan(0);
    expect(later.p95).toBeGreaterThan(0);
  });
});
