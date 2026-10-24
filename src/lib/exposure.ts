// Turns open invoices into an FX exposure table: currency x when the money is due.
//
// Rules this file keeps:
// - No direction calls. The shock is symmetric (+/- shockPct); we never say which way rates will go.
// - Nothing is silently dropped. An invoice we cannot value (no rate, bad date) goes to `skipped`
//   with a reason, so the table never looks smaller than the real book.

import { BUCKETS, type Bucket, type Invoice, type Rates } from "./types";

// Statuses where money is still expected. PAYMENT_PENDING is excluded: the buyer has paid and
// PayPal is clearing it, so the amount is no longer open to the seller's choices.
export const OPEN_STATUSES = new Set(["SENT", "UNPAID", "PARTIALLY_PAID", "SCHEDULED"]);

const DAY_MS = 86_400_000;

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + "T00:00:00Z");
  const b = Date.parse(to + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / DAY_MS);
}

export function bucketOf(dueDate: string, asOf: string): Bucket | null {
  const d = daysBetween(asOf, dueDate);
  if (Number.isNaN(d)) return null;
  if (d < 0) return "overdue";
  if (d >= 28) return "later";
  return (`w${Math.floor(d / 7) + 1}`) as Bucket;
}

export type CurrencyRow = {
  currency: string;
  total: number;
  buckets: Record<Bucket, number>;
  value: number; // total in the home currency at today's rate
  shock: number; // home-currency change if this currency moves shockPct either way
  invoiceCount: number;
};

export type Exposure = {
  asOf: string;
  base: string;
  shockPct: number;
  rows: CurrencyRow[]; // foreign currencies only, largest home-currency value first
  baseTotal: number; // invoices already in the base currency (no FX exposure)
  totalValue: number; // foreign exposure in the home currency
  totalShock: number;
  skipped: { id: string; reason: string }[];
};

function emptyBuckets(): Record<Bucket, number> {
  return Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
}

export function computeExposure(
  invoices: Invoice[],
  rates: Rates,
  asOf: string,
  opts: { base?: string; shockPct?: number } = {},
): Exposure {
  const base = opts.base ?? "KRW";
  const shockPct = opts.shockPct ?? 3;
  const byCcy = new Map<string, CurrencyRow>();
  const skipped: Exposure["skipped"] = [];
  let baseTotal = 0;

  for (const inv of invoices) {
    if (!OPEN_STATUSES.has(inv.status)) continue;
    if (!(inv.amountDue > 0)) continue;
    if (inv.currency === base) {
      baseTotal += inv.amountDue;
      continue;
    }
    const rate = rates[inv.currency];
    if (!(rate > 0)) {
      skipped.push({ id: inv.id, reason: `no ${inv.currency}/${base} rate` });
      continue;
    }
    const bucket = bucketOf(inv.dueDate, asOf);
    if (!bucket) {
      skipped.push({ id: inv.id, reason: `unreadable due date "${inv.dueDate}"` });
      continue;
    }
    let row = byCcy.get(inv.currency);
    if (!row) {
      row = { currency: inv.currency, total: 0, buckets: emptyBuckets(), value: 0, shock: 0, invoiceCount: 0 };
      byCcy.set(inv.currency, row);
    }
    row.total += inv.amountDue;
    row.buckets[bucket] += inv.amountDue;
    row.invoiceCount += 1;
  }

  const rows = [...byCcy.values()].map((r) => {
    const value = r.total * rates[r.currency];
    return { ...r, value, shock: (value * shockPct) / 100 };
  });
  rows.sort((a, b) => b.value - a.value);

  return {
    asOf,
    base,
    shockPct,
    rows,
    baseTotal,
    totalValue: rows.reduce((s, r) => s + r.value, 0),
    totalShock: rows.reduce((s, r) => s + r.shock, 0),
    skipped,
  };
}
