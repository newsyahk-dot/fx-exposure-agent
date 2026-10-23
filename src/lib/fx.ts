// FX rates from the ECB reference rates, served by Frankfurter (https://frankfurter.dev, no key).
// Source must be shown on screen: "ECB euro foreign exchange reference rates via Frankfurter".

import type { Rates } from "./types";

const API = "https://api.frankfurter.dev/v1";

// ECB publishes everything against EUR, so we ask for EUR-based quotes and cross them:
// KRW per 1 X = (KRW per EUR) / (X per EUR). Asking Frankfurter for base=KRW instead returns
// rounded tiny numbers (USD 0.00075 -> 1,333 KRW instead of 1,324.63), a 0.7% error.
export function crossToKrw(perEur: Record<string, number>, symbols: string[]): Rates {
  const krw = perEur.KRW;
  const out: Rates = {};
  if (!(krw > 0)) return out;
  for (const s of symbols) {
    if (s === "EUR") out.EUR = krw;
    else if (perEur[s] > 0) out[s] = krw / perEur[s];
  }
  return out;
}

const query = (symbols: string[]) => [...new Set(["KRW", ...symbols.filter((s) => s !== "EUR")])].join(",");

export async function latestRates(symbols: string[]): Promise<{ date: string; rates: Rates }> {
  const res = await fetch(`${API}/latest?base=EUR&symbols=${query(symbols)}`);
  if (!res.ok) throw new Error(`Frankfurter latest: HTTP ${res.status}`);
  const j = (await res.json()) as { date: string; rates: Record<string, number> };
  return { date: j.date, rates: crossToKrw(j.rates, symbols) };
}

// Daily KRW-per-unit series for each symbol, oldest first.
export async function rateHistory(symbols: string[], from: string, to: string): Promise<Record<string, number[]>> {
  const res = await fetch(`${API}/${from}..${to}?base=EUR&symbols=${query(symbols)}`);
  if (!res.ok) throw new Error(`Frankfurter history: HTTP ${res.status}`);
  const j = (await res.json()) as { rates: Record<string, Record<string, number>> };
  const out: Record<string, number[]> = Object.fromEntries(symbols.map((s) => [s, []]));
  for (const day of Object.keys(j.rates).sort()) {
    const x = crossToKrw(j.rates[day], symbols);
    for (const s of symbols) if (x[s]) out[s].push(x[s]);
  }
  return out;
}

// Standard deviation of daily log returns. Needs at least 20 observations to mean anything.
export function dailyVol(series: number[]): number | null {
  if (series.length < 21) return null;
  const r: number[] = [];
  for (let i = 1; i < series.length; i++) r.push(Math.log(series[i] / series[i - 1]));
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v);
}

// One-standard-deviation KRW swing over `days` business days (square-root-of-time scaling).
// This is a size of uncertainty, not an expected loss: the move is equally likely either way.
export function oneSigmaKrw(krw: number, vol: number, days: number): number {
  return days > 0 ? krw * vol * Math.sqrt(days) : 0;
}
