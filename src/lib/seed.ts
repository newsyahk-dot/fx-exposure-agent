// Seeding and resetting the demo book on the PayPal sandbox seller account. Used by
// scripts/seed-sandbox.mts. Sandbox only (PayPalClient refuses any other host).

import { PayPalClient, PayPalError, type PPInvoice } from "./paypal";
import { addDays, draftBody, money, parseSeedNumber, SEED_INVOICES, seedNumber } from "./seed-data";

type Log = (line: string) => void;
const CLOSED = new Set(["CANCELLED", "PAID", "MARKED_AS_PAID", "REFUNDED", "MARKED_AS_REFUNDED", "PARTIALLY_REFUNDED"]);

export function currentGeneration(invoices: PPInvoice[]): number {
  return Math.max(0, ...invoices.map((i) => parseSeedNumber(i.detail.invoice_number)?.gen ?? 0));
}

// Creates whatever invoices of generation `gen` are missing. Idempotent.
export async function seedGeneration(
  pp: PayPalClient,
  gen: number,
  o: { seedDay: string; recipient: string; apply: boolean; log: Log },
) {
  const existing = new Map((await pp.listInvoices()).map((i) => [i.detail.invoice_number, i]));
  let created = 0;
  for (const s of SEED_INVOICES) {
    const number = seedNumber(s.number, gen);
    const line = `${number} ${s.currency} ${s.amount} due ${addDays(o.seedDay, s.dueOffset)} (${s.outcome.kind}) — ${s.why}`;
    // A leftover draft means an earlier run failed half-way: remove it and start that invoice again.
    const prev = existing.get(number);
    if (prev?.status === "DRAFT" && o.apply) {
      await pp.deleteDraft(prev.id);
      existing.delete(number);
    }
    if (existing.has(number)) {
      o.log(`skip   ${line} [exists: ${existing.get(number)!.status}]`);
      continue;
    }
    if (!o.apply) {
      o.log(`would  ${line}`);
      continue;
    }
    try {
      const draft = await pp.createDraftInvoice(draftBody(s, o.seedDay, o.recipient, gen));
      await pp.sendInvoice(draft.id, { send_to_recipient: true });
      if (s.outcome.kind !== "open") {
        await pp.recordPayment(draft.id, {
          method: "BANK_TRANSFER",
          payment_date: addDays(o.seedDay, s.outcome.paidOffset),
          amount: money(s.currency, s.outcome.kind === "paid" ? s.amount : s.outcome.paid),
          note: "Demo payment recorded by seed script",
        });
      }
      const after = await pp.getInvoice(draft.id);
      created++;
      o.log(`made   ${line} -> ${draft.id} ${after.status} due_amount ${after.due_amount?.value ?? "?"}`);
    } catch (e) {
      o.log(`FAIL   ${line} -> ${e instanceof PayPalError ? e.message : String(e)}`);
    }
  }
  return created;
}

// Takes every open seed invoice off the book so a fresh generation can replace it.
// Open ones are cancelled; partly paid ones cannot be (PayPal: CANNOT_CANCEL_PAID_INVOICE), so the
// rest is recorded as paid. Returns how many were closed.
export async function closeSeedInvoices(pp: PayPalClient, o: { apply: boolean; log: Log; today: string }) {
  let closed = 0;
  for (const i of await pp.listInvoices()) {
    if (!parseSeedNumber(i.detail.invoice_number) || CLOSED.has(i.status)) continue;
    const what = `${i.detail.invoice_number} ${i.status}`;
    if (!o.apply) {
      o.log(`would close ${what}`);
      continue;
    }
    try {
      if (i.status === "DRAFT") await pp.deleteDraft(i.id);
      else if (i.status === "PARTIALLY_PAID" && i.due_amount)
        await pp.recordPayment(i.id, { method: "OTHER", payment_date: o.today, amount: i.due_amount, note: "Closed by demo reset" });
      else await pp.cancelInvoice(i.id);
      closed++;
      o.log(`closed ${what}`);
    } catch (e) {
      o.log(`FAIL close ${what} -> ${e instanceof PayPalError ? e.message : String(e)}`);
    }
  }
  return closed;
}
