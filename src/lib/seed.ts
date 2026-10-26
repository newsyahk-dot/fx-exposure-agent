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
  await inBatches(SEED_INVOICES, async (s) => {
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
      return;
    }
    if (!o.apply) {
      o.log(`would  ${line}`);
      return;
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
  });
  return created;
}

// Invoices the new-invoice assistant created (src/lib/invoice-plan.ts invoiceNumber) are demo invoices too.
const isAssistantInvoice = (n: string | undefined) => /^FXA-N\d{6}-/.test(n ?? "");

// Four PayPal calls in flight at a time: a reset takes seconds instead of a minute, within sandbox rate limits.
async function inBatches<T>(items: T[], f: (x: T) => Promise<void>, size = 4) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(f));
}

// Takes every open seed invoice off the book so a fresh generation can replace it.
// Open ones are cancelled; partly paid ones cannot be (PayPal: CANNOT_CANCEL_PAID_INVOICE), so the
// rest is recorded as paid. Returns how many were closed.
export async function closeSeedInvoices(pp: PayPalClient, o: { apply: boolean; log: Log; today: string }) {
  let closed = 0;
  const open = (await pp.listInvoices()).filter(
    (i) => (parseSeedNumber(i.detail.invoice_number) || isAssistantInvoice(i.detail.invoice_number)) && !CLOSED.has(i.status),
  );
  await inBatches(open, async (i) => {
    const what = `${i.detail.invoice_number} ${i.status}`;
    if (!o.apply) {
      o.log(`would close ${what}`);
      return;
    }
    try {
      // Drafts and scheduled invoices cannot be cancelled (CANNOT_CANCEL_SCHEDULED_INVOICE); they can be deleted.
      if (i.status === "DRAFT" || i.status === "SCHEDULED") await pp.deleteDraft(i.id);
      else if (i.status === "PARTIALLY_PAID" && i.due_amount)
        await pp.recordPayment(i.id, { method: "OTHER", payment_date: o.today, amount: i.due_amount, note: "Closed by demo reset" });
      else await pp.cancelInvoice(i.id);
      closed++;
      o.log(`closed ${what}`);
    } catch (e) {
      o.log(`FAIL close ${what} -> ${e instanceof PayPalError ? e.message : String(e)}`);
    }
  });
  return closed;
}

// Puts the demo book back to its starting shape: closes the open demo invoices, seeds a new generation dated
// today. Used by the "Reset demo" button and the nightly cron, so every visitor can run the whole loop.
export async function resetDemoBook(pp: PayPalClient, o: { today: string; recipient: string; log: Log }) {
  const gen = currentGeneration(await pp.listInvoices()) + 1;
  const closed = await closeSeedInvoices(pp, { apply: true, log: o.log, today: o.today });
  const created = await seedGeneration(pp, gen, { seedDay: o.today, recipient: o.recipient, apply: true, log: o.log });
  return { gen, closed, created };
}

export const SEED_RECIPIENT = process.env.SEED_RECIPIENT_EMAIL ?? "sb-lhwuh53492948@personal.example.com";
