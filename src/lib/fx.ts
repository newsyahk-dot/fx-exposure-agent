// FX rates from the ECB reference rates, served by Frankfurter (https://frankfurter.dev, no key).
// Source must be shown on screen: "ECB euro foreign exchange reference rates via Frankfurter".
//
// We keep the raw ECB quotes (units of X per 1 EUR) and derive everything else from them, so the
// seller can pick any home currency — including in demo mode, from a saved snapshot.

import type { Rates } from "./types";

const API = "https://api.frankfurter.dev/v1";

// Home currencies the app offers. All are ECB reference currencies.
export const BASES = ["USD", "EUR", "GBP", "JPY", "KRW"] as const;
export type Base = (typeof BASES)[number];
export const isBase = (s: string | undefined | null): s is Base => !!s && (BASES as readonly string[]).includes(s);

// Every ECB reference currency (Frankfurter serves them all), so invoices in any of them can be valued.
export const ECB_CURRENCIES = [
  "AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK",
  "JPY", "KRW", "MXN", "MYR", "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD", "ZAR",
] as const;

// Raw ECB quotes: per EUR. `history` is keyed by ECB business day (YYYY-MM-DD).
export type PerEur = Record<string, number>;
export type EcbQuotes = { date: string; latest: PerEur; history: Record<string, PerEur> };

const perEurOf = (q: PerEur, ccy: string) => (ccy === "EUR" ? 1 : q[ccy]);

// Home-currency units per 1 unit of each symbol: (base per EUR) / (symbol per EUR).
// We cross from EUR quotes rather than asking Frankfurter for base=KRW: that returns rounded tiny
// numbers (USD 0.00075 -> 1,333 KRW instead of 1,324.63), a 0.7% error (measured 2026-10-23).
export function cross(perEur: PerEur, base: string, symbols: string[]): Rates {
  const b = perEurOf(perEur, base);
  const out: Rates = {};
  if (!(b > 0)) return out;
  for (const s of symbols) {
    const x = perEurOf(perEur, s);
    if (x > 0) out[s] = b / x;
  }
  return out;
}

export const ratesFor = (q: EcbQuotes, base: string, symbols: string[]) => cross(q.latest, base, symbols);

// Daily home-currency series for each symbol, oldest first, ECB days in [from, to].
export function seriesFor(q: EcbQuotes, base: string, symbols: string[], from: string, to: string): Record<string, number[]> {
  const out: Record<string, number[]> = Object.fromEntries(symbols.map((s) => [s, []]));
  for (const day of Object.keys(q.history).sort()) {
    if (day < from || day > to) continue;
    const x = cross(q.history[day], base, symbols);
    for (const s of symbols) if (x[s]) out[s].push(x[s]);
  }
  return out;
}

// The rate on a given day: the last ECB fixing on or before it (ECB does not publish on weekends
// and TARGET holidays). Null if the history does not reach back that far.
export function rateOn(q: EcbQuotes, base: string, ccy: string, day: string): { date: string; rate: number } | null {
  const days = Object.keys(q.history).filter((d) => d <= day).sort();
  for (let i = days.length - 1; i >= 0; i--) {
    const r = cross(q.history[days[i]], base, [ccy])[ccy];
    if (r > 0) return { date: days[i], rate: r };
  }
  return null;
}

export function volsFor(q: EcbQuotes, base: string, symbols: string[], from: string, to: string): Record<string, number | null> {
  const s = seriesFor(q, base, symbols, from, to);
  return Object.fromEntries(symbols.map((c) => [c, c === base ? 0 : dailyVol(s[c] ?? [])]));
}

export async function fetchEcbQuotes(from: string, to: string): Promise<EcbQuotes> {
  const symbols = ECB_CURRENCIES.filter((b) => b !== "EUR").join(",");
  const [latest, hist] = await Promise.all([
    fetch(`${API}/latest?base=EUR&symbols=${symbols}`),
    fetch(`${API}/${from}..${to}?base=EUR&symbols=${symbols}`),
  ]);
  if (!latest.ok) throw new Error(`Frankfurter latest: HTTP ${latest.status}`);
  if (!hist.ok) throw new Error(`Frankfurter history: HTTP ${hist.status}`);
  const l = (await latest.json()) as { date: string; rates: PerEur };
  const h = (await hist.json()) as { rates: Record<string, PerEur> };
  return { date: l.date, latest: l.rates, history: { ...h.rates, [l.date]: l.rates } };
}

// Only the fixings published before `day`. The demo book uses the last complete fixing before its book day, so the
// numbers (and the agent's plan) do not change in the middle of the day when the ECB publishes at ~15:00 UTC.
export function ecbBefore(q: EcbQuotes, day: string): EcbQuotes {
  const dates = Object.keys(q.history)
    .filter((d) => d < day)
    .sort();
  const last = dates.at(-1);
  if (!last) return q;
  return { date: last, latest: q.history[last], history: Object.fromEntries(dates.map((d) => [d, q.history[d]])) };
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

// One-standard-deviation swing (in the home currency) over `days` business days, square-root-of-time
// scaling. This is a size of uncertainty, not an expected loss: the move is equally likely either way.
export function oneSigma(value: number, vol: number, days: number): number {
  return days > 0 ? value * vol * Math.sqrt(days) : 0;
}
