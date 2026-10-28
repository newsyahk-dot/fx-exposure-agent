// A conditional early-payment offer, built from plain invoices.
//
// PayPal's own early-payment discount (conditional-rules) answers HTTP 500 in the sandbox (2026-10-23 and again
// 2026-10-28), and editing the sent invoice made the discount unconditional — the client kept it even when paying
// late, and the seller's terms were overwritten. So the offer is a second invoice instead:
// - the seller's invoice stays exactly as she sent it;
// - the client gets an "early payment" invoice for the discounted amount, due on the earlier date;
// - if the client pays that one, the original is settled (recorded as paid, with a note);
// - if the date passes unpaid, the offer has expired: the app ignores it and cancels it when it can, and the
//   original applies as before.
// Offer invoices are tied to their original by number (`<original>-EP`) and by a line in their private memo.

import type { Invoice } from "./types";

export const OFFER_SUFFIX = "-EP";
const MEMO = /^fxa-offer:\s+(\S+)\s+([\d.]+)\s*$/m;
const PAID = /^(PAID|MARKED_AS_PAID)$/;
const OPEN = new Set(["SENT", "UNPAID", "SCHEDULED"]);

export const offerNumber = (original: string) => `${original}${OFFER_SUFFIX}`;
export const isOfferNumber = (n: string | undefined) => !!n && n.endsWith(OFFER_SUFFIX);
export const originalNumber = (n: string) => (isOfferNumber(n) ? n.slice(0, -OFFER_SUFFIX.length) : n);

export const offerMemoLine = (originalId: string, percent: number) => `fxa-offer: ${originalId} ${percent}`;
export function parseOfferMemo(memo: string | undefined): { originalId: string; percent: number } | null {
  const m = MEMO.exec(memo ?? "");
  return m ? { originalId: m[1], percent: Number(m[2]) } : null;
}

// The discounted amount, in the invoice currency's smallest unit PayPal accepts (no decimals for JPY).
export function offerAmount(amountDue: number, percent: number, currency: string): number {
  const v = amountDue * (1 - percent / 100);
  return currency === "JPY" ? Math.round(v) : Math.round(v * 100) / 100;
}

export type OfferInfo = {
  id: string;
  number: string;
  amount: number; // what the client pays if they use the offer (invoice currency)
  dueDate: string; // pay by this date to get the discount
  percent: number;
  state: "open" | "paid" | "expired" | "closed";
};

// Splits offer invoices off the list and attaches each to its original. A paid offer settles its original on screen
// even before the original is recorded as paid in PayPal (that write happens on the payment event).
export function attachOffers(invoices: Invoice[], asOf: string): Invoice[] {
  const offers = invoices.filter((i) => i.offerFor || isOfferNumber(i.number));
  if (!offers.length) return invoices;
  const byOriginal = new Map<string, Invoice>();
  for (const o of offers) {
    const key = o.offerFor?.originalId ?? `#${originalNumber(o.number)}`;
    const prev = byOriginal.get(key);
    if (!prev || (prev.createdAt ?? "") < (o.createdAt ?? "")) byOriginal.set(key, o);
  }
  const out: Invoice[] = [];
  for (const inv of invoices) {
    if (offers.includes(inv)) continue;
    const o = byOriginal.get(inv.id) ?? byOriginal.get(`#${inv.number}`);
    if (!o) {
      out.push(inv);
      continue;
    }
    const percent = o.offerFor?.percent ?? 0;
    const amount = o.total ?? o.amountDue;
    const state: OfferInfo["state"] = PAID.test(o.status)
      ? "paid"
      : !OPEN.has(o.status)
        ? "closed"
        : o.dueDate < asOf
          ? "expired"
          : "open";
    const offer: OfferInfo = { id: o.id, number: o.number, amount, dueDate: o.dueDate, percent, state };
    if (state === "paid" && inv.amountDue > 0) {
      // Settled through the offer: what was received is the offer's payment, not the original amount.
      const payments = o.payments?.length ? o.payments : [{ date: o.dueDate < asOf ? o.dueDate : asOf, amount }];
      out.push({ ...inv, status: "PAID", amountDue: 0, payments, offer });
    } else if (state === "paid" && /PAID/.test(inv.status)) {
      // Already recorded as paid in PayPal: still count what was actually received.
      out.push({ ...inv, payments: o.payments?.length ? o.payments : inv.payments, offer });
    } else out.push({ ...inv, offer });
  }
  return out;
}
