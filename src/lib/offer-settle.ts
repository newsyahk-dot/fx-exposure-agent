// PayPal-side bookkeeping for the conditional early-payment offer (src/lib/offer-invoice.ts). The screen already
// treats a paid offer as settling its original; these writes make PayPal agree, so the client is never asked to pay
// the original as well, and a lapsed offer can no longer be paid.

import { isOfferNumber, originalNumber, parseOfferMemo } from "./offer-invoice";
import { PayPalClient, type PPInvoice } from "./paypal";

const OPEN = new Set(["SENT", "UNPAID", "PARTIALLY_PAID"]);
const PAID = new Set(["PAID", "MARKED_AS_PAID"]);

function originalOf(offer: PPInvoice, all: PPInvoice[]): PPInvoice | undefined {
  const id = parseOfferMemo(offer.detail.memo)?.originalId;
  return all.find((x) => x.id === id) ?? all.find((x) => x.detail.invoice_number === originalNumber(offer.detail.invoice_number ?? ""));
}

// Offer paid -> record the original as paid in full, with a note naming the offer. Idempotent.
export async function settleOriginal(pp: PayPalClient, offer: PPInvoice, all?: PPInvoice[], today = new Date().toISOString().slice(0, 10)) {
  if (!PAID.has(offer.status)) return null;
  const orig = originalOf(offer, all ?? (await pp.listInvoices()));
  if (!orig || !OPEN.has(orig.status) || !orig.due_amount || !(Number(orig.due_amount.value) > 0)) return null;
  await pp.recordPayment(orig.id, {
    method: "OTHER",
    payment_date: today,
    amount: orig.due_amount,
    note: `Settled by early-payment invoice ${offer.detail.invoice_number} (discounted amount paid on time).`,
  });
  return orig.detail.invoice_number ?? orig.id;
}

// Settles originals whose offer was paid, and cancels open offers past their date (or whose original is closed).
export async function reconcileOffers(pp: PayPalClient, today = new Date().toISOString().slice(0, 10)) {
  const all = await pp.listInvoices();
  const offers = all.filter((x) => isOfferNumber(x.detail.invoice_number));
  const settled: string[] = [];
  const lapsed: string[] = [];
  for (const o of offers) {
    try {
      if (PAID.has(o.status)) {
        const n = await settleOriginal(pp, o, all, today);
        if (n) settled.push(n);
      } else if (OPEN.has(o.status)) {
        const orig = originalOf(o, all);
        const due = o.detail.payment_term?.due_date ?? "";
        if ((due && due < today) || !orig || !OPEN.has(orig.status)) {
          await pp.cancelInvoice(o.id);
          lapsed.push(o.detail.invoice_number ?? o.id);
        }
      }
    } catch (e) {
      console.error(`[offers] ${o.detail.invoice_number}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { settled, lapsed };
}
