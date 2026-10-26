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

// Foreign-currency money owed at the start of today = owed now + what was paid today in foreign currencies,
// both valued at today's rates (so the difference is the payments, not a rate move).
export function startOfDayValue(nowValue: number, paid: PaidToday[], base: string): number {
  return nowValue + paid.filter((p) => p.invoice.currency !== base).reduce((s, p) => s + p.value, 0);
}

export const isOpen = (i: Invoice) => OPEN_STATUSES.has(i.status) && i.amountDue > 0;
