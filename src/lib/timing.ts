// What the wait already did: for money received in the last N days, how much more or less it was worth
// in the home currency on the day it arrived than on the day it was invoiced.
//
// This is history, not a forecast — the sign is whatever the rates did, and gains are shown as plainly
// as losses. Payments made after the due date are flagged, because that part of the wait was the
// client's lateness, not the agreed terms.

import { daysBetween } from "./exposure";
import { rateOn, type EcbQuotes } from "./fx";
import type { Invoice } from "./types";

export type TimingRow = {
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  amount: number; // in the invoice currency
  invoiceDate: string;
  dueDate: string;
  paidDate: string;
  daysWaited: number;
  daysLate: number; // 0 when paid on or before the due date
  rateInvoiced: number; // home currency per unit
  ratePaid: number;
  effect: number; // home currency: amount × (ratePaid − rateInvoiced)
};

export type TimingEffect = {
  base: string;
  from: string;
  to: string;
  rows: TimingRow[];
  net: number;
  gains: number; // sum of positive effects
  losses: number; // sum of negative effects (≤ 0)
  lateNet: number; // effect of the part of each wait that ran past the due date
  inBase: number; // payments already in the home currency (no FX effect)
  skipped: { id: string; reason: string }[];
};

export function timingEffect(invoices: Invoice[], ecb: EcbQuotes, base: string, asOf: string, days = 90): TimingEffect {
  const from = new Date(Date.parse(asOf + "T00:00:00Z") - days * 86_400_000).toISOString().slice(0, 10);
  const out: TimingEffect = { base, from, to: asOf, rows: [], net: 0, gains: 0, losses: 0, lateNet: 0, inBase: 0, skipped: [] };
  for (const inv of invoices) {
    for (const p of inv.payments ?? []) {
      if (p.date < from || p.date > asOf || !(p.amount > 0)) continue;
      if (inv.currency === base) {
        out.inBase += p.amount;
        continue;
      }
      const a = rateOn(ecb, base, inv.currency, inv.invoiceDate);
      const b = rateOn(ecb, base, inv.currency, p.date);
      if (!a || !b) {
        out.skipped.push({ id: inv.id, reason: `no ${inv.currency}/${base} rate for ${a ? p.date : inv.invoiceDate}` });
        continue;
      }
      const daysLate = Math.max(0, daysBetween(inv.dueDate, p.date));
      const effect = p.amount * (b.rate - a.rate);
      out.rows.push({
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        currency: inv.currency,
        amount: p.amount,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        paidDate: p.date,
        daysWaited: daysBetween(inv.invoiceDate, p.date),
        daysLate,
        rateInvoiced: a.rate,
        ratePaid: b.rate,
        effect,
      });
      out.net += effect;
      if (effect >= 0) out.gains += effect;
      else out.losses += effect;
      if (daysLate > 0) {
        const d = rateOn(ecb, base, inv.currency, inv.dueDate);
        if (d) out.lateNet += p.amount * (b.rate - d.rate);
      }
    }
  }
  out.rows.sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect));
  return out;
}
