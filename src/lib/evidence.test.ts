import { describe, expect, it } from "vitest";
import { bandsByWait, HORIZONS, replayBook } from "./evidence";
import type { EcbQuotes, PerEur } from "./fx";
import { addDays } from "./seed-data";

// A random-walk history (seeded), so ranges widen with the wait as they do in real data.
function walk(asOf: string, days: number): EcbQuotes {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  const history: Record<string, PerEur> = {};
  let usd = 1.1, jpy = 160, krw = 1450;
  for (let i = days; i >= 0; i--) {
    const d = addDays(asOf, -i);
    const wd = new Date(d + "T00:00:00Z").getUTCDay();
    if (wd === 0 || wd === 6) continue;
    usd *= 1 + 0.01 * rnd();
    jpy *= 1 + 0.012 * rnd();
    krw *= 1 + 0.008 * rnd();
    history[d] = { USD: usd, JPY: jpy, KRW: krw, GBP: 0.86 };
  }
  const date = Object.keys(history).sort().at(-1)!;
  return { date, latest: history[date], history };
}

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
