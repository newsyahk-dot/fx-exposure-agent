// Turns the exposure into concrete PayPal actions the agent may propose.
// Every proposal is executed only after the user approves it. We show costs and the size of
// the FX swing side by side; we do not tell the user which one is "worth it".

import { daysBetween, OPEN_STATUSES } from "./exposure";
import { oneSigmaKrw } from "./fx";
import type { Invoice, Rates } from "./types";

export type Proposal =
  | {
      kind: "reminder";
      invoiceId: string;
      invoiceNumber: string;
      currency: string;
      amount: number;
      krw: number;
      daysOverdue: number;
    }
  | {
      kind: "early_pay_discount";
      invoiceId: string;
      invoiceNumber: string;
      currency: string;
      amount: number;
      krw: number;
      daysToDue: number;
      discountPct: number;
      discountWithinDays: number;
      costKrw: number; // what the discount costs if the buyer takes it
      swingNowKrw: number | null; // 1-sigma KRW swing if paid on the due date
      swingIfEarlyKrw: number | null; // 1-sigma KRW swing if paid within discountWithinDays
    };

export type ProposalOptions = {
  base?: string;
  minKrw?: number; // ignore invoices smaller than this (KRW)
  discountPct?: number;
  discountWithinDays?: number;
  minDaysToDue?: number; // only offer a discount when the due date is at least this far away
  dailyVols?: Record<string, number | null>;
};

// Calendar days -> approximate business days for the sqrt-of-time swing.
const toBusinessDays = (calendarDays: number) => Math.max(0, Math.round((calendarDays * 5) / 7));

export function buildProposals(invoices: Invoice[], rates: Rates, asOf: string, opts: ProposalOptions = {}): Proposal[] {
  const base = opts.base ?? "KRW";
  const minKrw = opts.minKrw ?? 1_000_000;
  const discountPct = opts.discountPct ?? 1;
  const within = opts.discountWithinDays ?? 7;
  const minDays = opts.minDaysToDue ?? 14;
  const out: Proposal[] = [];

  for (const inv of invoices) {
    if (!OPEN_STATUSES.has(inv.status) || inv.currency === base || !(inv.amountDue > 0)) continue;
    const rate = rates[inv.currency];
    if (!(rate > 0)) continue;
    const krw = inv.amountDue * rate;
    if (krw < minKrw) continue;
    const d = daysBetween(asOf, inv.dueDate);
    if (Number.isNaN(d)) continue;

    if (d < 0) {
      out.push({
        kind: "reminder",
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        currency: inv.currency,
        amount: inv.amountDue,
        krw,
        daysOverdue: -d,
      });
    } else if (d >= minDays) {
      const vol = opts.dailyVols?.[inv.currency] ?? null;
      out.push({
        kind: "early_pay_discount",
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        currency: inv.currency,
        amount: inv.amountDue,
        krw,
        daysToDue: d,
        discountPct,
        discountWithinDays: within,
        costKrw: (krw * discountPct) / 100,
        swingNowKrw: vol == null ? null : oneSigmaKrw(krw, vol, toBusinessDays(d)),
        swingIfEarlyKrw: vol == null ? null : oneSigmaKrw(krw, vol, toBusinessDays(within)),
      });
    }
  }
  // Overdue first (the money is already late), then by size.
  out.sort((a, b) => (a.kind === b.kind ? b.krw - a.krw : a.kind === "reminder" ? -1 : 1));
  return out;
}
