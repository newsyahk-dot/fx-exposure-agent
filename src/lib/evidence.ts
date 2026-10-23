// Evidence from two years of real ECB reference rates — no forecasts, no assumptions about where rates go.
//
// 1. Range by wait: for every start day in the window, how much did each currency move against the home
//    currency over the next 7…90 days? The 5th–95th percentile of those moves is the range that money
//    waiting that long fell inside nine times out of ten.
// 2. Your book, replayed: apply every historical start day to the seller's open invoices at once (so the
//    currencies' co-movement counts) and read off the same range, for two payment timelines. The
//    timelines are assumptions and are shown as such; the rate paths are history.

import type { AgentInput, AgentRun } from "./agent";
import { cross, type EcbQuotes } from "./fx";
import { addDays } from "./seed-data";

export const HORIZONS = [7, 14, 21, 30, 45, 60, 75, 90];
export const LOOKBACK_DAYS = 730;

// Home-currency rate per symbol for every ECB day, sorted, with a lookup for "last fixing on or before".
function series(ecb: EcbQuotes, base: string, ccys: string[]) {
  const days = Object.keys(ecb.history).sort();
  const rows = days.map((d) => cross(ecb.history[d], base, ccys));
  const onOrBefore = (day: string): number => {
    let lo = 0;
    let hi = days.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (days[mid] <= day) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  };
  return { days, rows, onOrBefore };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return Number.NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// Start days: ECB days in [asOf − lookback − maxHorizon, asOf − maxHorizon], so every horizon is observed.
function startDays(s: ReturnType<typeof series>, asOf: string, maxH: number, lookback: number) {
  const first = addDays(asOf, -(lookback + maxH));
  const last = addDays(asOf, -maxH);
  return s.days.map((d, i) => ({ d, i })).filter(({ d }) => d >= first && d <= last);
}

export type Band = { currency: string; horizon: number; p5: number; p95: number; n: number }; // relative moves

export function bandsByWait(ecb: EcbQuotes, base: string, ccys: string[], asOf: string, lookback = LOOKBACK_DAYS): Band[] {
  const foreign = ccys.filter((c) => c !== base);
  const s = series(ecb, base, foreign);
  const maxH = Math.max(...HORIZONS);
  const starts = startDays(s, asOf, maxH, lookback);
  const out: Band[] = [];
  for (const c of foreign) {
    for (const h of HORIZONS) {
      const moves: number[] = [];
      for (const { d, i } of starts) {
        const a = s.rows[i][c];
        const j = s.onOrBefore(addDays(d, h));
        const b = j >= 0 ? s.rows[j][c] : undefined;
        if (a > 0 && b && b > 0) moves.push(b / a - 1);
      }
      moves.sort((x, y) => x - y);
      out.push({ currency: c, horizon: h, p5: percentile(moves, 0.05), p95: percentile(moves, 0.95), n: moves.length });
    }
  }
  return out;
}

export type Position = { currency: string; value: number; waitDays: number }; // value in the home currency
export type Replay = { p5: number; p95: number; n: number; from: string; to: string }; // in home-currency money

// Replays every historical start day over the whole book at once; returns the 5th–95th percentile of the
// total change in home-currency value.
export function replayBook(ecb: EcbQuotes, base: string, positions: Position[], asOf: string, lookback = LOOKBACK_DAYS): Replay {
  const ccys = [...new Set(positions.map((p) => p.currency))];
  const s = series(ecb, base, ccys);
  const maxH = Math.max(1, ...positions.map((p) => p.waitDays));
  const starts = startDays(s, asOf, maxH, lookback);
  const totals: number[] = [];
  for (const { d, i } of starts) {
    let t = 0;
    let ok = true;
    for (const p of positions) {
      const a = s.rows[i][p.currency];
      const j = s.onOrBefore(addDays(d, Math.max(0, p.waitDays)));
      const b = j >= 0 ? s.rows[j][p.currency] : undefined;
      if (!(a > 0) || !(b && b > 0)) {
        ok = false;
        break;
      }
      t += p.value * (b / a - 1);
    }
    if (ok) totals.push(t);
  }
  totals.sort((x, y) => x - y);
  return { p5: percentile(totals, 0.05), p95: percentile(totals, 0.95), n: totals.length, from: starts[0]?.d ?? "", to: starts.at(-1)?.d ?? "" };
}

// --- Two payment timelines for the seller's open book --------------------------------------------


// Assumptions, shown on screen next to the result.
export const ASSUME = {
  overdueWaitDays: 14, // an overdue invoice with no reminder is paid this many days from today
  afterReminderDays: 7, // a reminded invoice is paid this many days from today
};

export function timelines(input: AgentInput, run: AgentRun): { asInvoiced: Position[]; withProposals: Position[] } {
  const asInvoiced: Position[] = [];
  const withProposals: Position[] = [];
  const byId = new Map(run.proposals.map((p) => [p.invoiceId, p]));
  for (const c of input.candidates) {
    const wait = c.daysToDue ?? ASSUME.overdueWaitDays;
    asInvoiced.push({ currency: c.currency, value: c.value, waitDays: wait });
    const p = byId.get(c.invoiceId);
    if (p?.kind === "reminder") withProposals.push({ currency: c.currency, value: c.value, waitDays: ASSUME.afterReminderDays });
    else if (p?.kind === "early_pay_discount")
      withProposals.push({ currency: c.currency, value: c.value * (1 - p.percent / 100), waitDays: p.withinDays });
    else withProposals.push({ currency: c.currency, value: c.value, waitDays: wait });
  }
  return { asInvoiced, withProposals };
}
