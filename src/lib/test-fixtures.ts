// Shared test data: the seed book as it sits in PayPal right after seeding, and a deterministic
// ECB history (weekdays only, gentle wiggles) so volatility and timing have something to measure.

import type { EcbQuotes, PerEur } from "./fx";
import { addDays, SEED_INVOICES } from "./seed-data";
import type { Invoice } from "./types";

export const DAY = "2026-10-23";

export const SEED_BOOK: Invoice[] = SEED_INVOICES.map((s) => {
  const paid = s.outcome.kind === "paid" ? s.amount : s.outcome.kind === "partial" ? s.outcome.paid : 0;
  return {
    id: `INV2-TEST-${s.number.slice(4)}-XXXX`,
    number: s.number,
    status: s.outcome.kind === "open" ? "SENT" : s.outcome.kind === "paid" ? "MARKED_AS_PAID" : "PARTIALLY_PAID",
    currency: s.currency,
    amountDue: s.amount - paid,
    total: s.amount,
    dueDate: addDays(DAY, s.dueOffset),
    invoiceDate: addDays(DAY, s.issueOffset),
    recipientName: s.client,
    payments: s.outcome.kind === "open" ? undefined : [{ date: addDays(DAY, s.outcome.paidOffset), amount: paid }],
  };
});

export function syntheticEcb(asOf = DAY, days = 200): EcbQuotes {
  const history: Record<string, PerEur> = {};
  for (let i = days; i >= 0; i--) {
    const d = addDays(asOf, -i);
    const wd = new Date(d + "T00:00:00Z").getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const w = (k: number) => 1 + 0.004 * Math.sin(i / k) + 0.002 * Math.sin(i * 1.7 + k);
    history[d] = { USD: 1.12 * w(3), JPY: 176 * w(5), GBP: 0.86 * w(7), KRW: 1484 * w(4) };
  }
  const date = Object.keys(history).sort().at(-1)!;
  return { date, latest: history[date], history };
}

// A random-walk history (seeded), so ranges widen with the wait as they do in real data.
export function walkEcb(asOf: string, days: number): EcbQuotes {
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

