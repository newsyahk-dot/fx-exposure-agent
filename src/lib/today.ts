// What changed today: payments that arrived, and how much was at risk at the start of the day.
// Derived from the invoices themselves (their payment dates), so nothing extra has to be stored.

import { OPEN_STATUSES } from "./exposure";
import type { Invoice, Rates } from "./types";

export type PaidToday = { invoice: Invoice; amount: number; value: number }; // amount in the invoice currency, value in home

export function paidToday(invoices: Invoice[], rates: Rates, base: string, asOf: string): PaidToday[] {
  return invoices
    .map((invoice) => {
      const amount = (invoice.payments ?? []).filter((p) => p.date === asOf).reduce((s, p) => s + p.amount, 0);
      const rate = invoice.currency === base ? 1 : rates[invoice.currency];
      return { invoice, amount, value: rate > 0 ? amount * rate : 0 };
    })
    .filter((p) => p.amount > 0);
}

// What moved the foreign-currency total today, at today's rates (so it is the invoices, not a rate move):
// payments that came in, and invoices issued today. Start of today = now + paid − added.
export type DayChange = { paid: number; added: number };

export function dayChange(invoices: Invoice[], paid: PaidToday[], rates: Rates, base: string, asOf: string): DayChange {
  const foreign = (i: Invoice) => i.currency !== base && rates[i.currency] > 0;
  const paidValue = paid.filter((p) => foreign(p.invoice)).reduce((s, p) => s + p.value, 0);
  const paidById = new Map(paid.map((p) => [p.invoice.id, p.amount]));
  // An invoice issued today counts with what it was issued for: still owed plus anything already paid today.
  const added = invoices
    .filter((i) => foreign(i) && i.invoiceDate === asOf && (isOpen(i) || paidById.has(i.id)))
    .reduce((s, i) => s + ((isOpen(i) ? i.amountDue : 0) + (paidById.get(i.id) ?? 0)) * rates[i.currency], 0);
  return { paid: paidValue, added };
}

export const isOpen = (i: Invoice) => OPEN_STATUSES.has(i.status) && i.amountDue > 0;
