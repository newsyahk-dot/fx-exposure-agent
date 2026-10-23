// Seeds the PayPal sandbox seller account with the demo book in src/lib/seed-data.ts.
//
//   npx tsx scripts/seed-sandbox.mts            # dry run: shows what would be created
//   npx tsx scripts/seed-sandbox.mts --apply    # creates, sends and records payments
//
// Idempotent: invoice numbers that already exist on the account are skipped.
// Sandbox only (PayPalClient refuses any other host). Never prints credentials.

import { PayPalClient, PayPalError } from "../src/lib/paypal";
import { addDays, draftBody, money, SEED_INVOICES, SEED_PREFIX } from "../src/lib/seed-data";

const apply = process.argv.includes("--apply");
const recipient = process.env.SEED_RECIPIENT_EMAIL ?? "sb-lhwuh53492948@personal.example.com";
const seedDay = process.env.SEED_DAY ?? new Date().toISOString().slice(0, 10);

const pp = new PayPalClient();
const existing = new Map((await pp.listInvoices()).map((i) => [i.detail.invoice_number, i]));
console.log(`seed day ${seedDay} · recipient ${recipient} · ${existing.size} invoices already on the account`);

let created = 0;
for (const s of SEED_INVOICES) {
  const line = `${s.number} ${s.currency} ${s.amount} due ${addDays(seedDay, s.dueOffset)} (${s.outcome.kind}) — ${s.why}`;
  // A leftover draft means an earlier run failed half-way: remove it and start that invoice again.
  const prev = existing.get(s.number);
  if (prev?.status === "DRAFT" && apply) {
    await pp.deleteDraft(prev.id);
    existing.delete(s.number);
  }
  if (existing.has(s.number)) {
    console.log(`skip   ${line} [exists: ${existing.get(s.number)!.status}]`);
    continue;
  }
  if (!apply) {
    console.log(`would  ${line}`);
    continue;
  }
  try {
    const draft = await pp.createDraftInvoice(draftBody(s, seedDay, recipient));
    await pp.sendInvoice(draft.id, { send_to_recipient: true });
    if (s.outcome.kind !== "open") {
      const paid = s.outcome.kind === "paid" ? s.amount : s.outcome.paid;
      await pp.recordPayment(draft.id, {
        method: "BANK_TRANSFER",
        payment_date: addDays(seedDay, s.outcome.paidOffset),
        amount: money(s.currency, paid),
        note: "Demo payment recorded by seed script",
      });
    }
    const after = await pp.getInvoice(draft.id);
    created++;
    console.log(`made   ${line} -> ${draft.id} ${after.status} due_amount ${after.due_amount?.value ?? "?"}`);
  } catch (e) {
    console.log(`FAIL   ${line} -> ${e instanceof PayPalError ? e.message : String(e)}`);
  }
}

const now = await pp.listInvoices();
const ours = now.filter((i) => i.detail.invoice_number?.startsWith(SEED_PREFIX));
const byStatus = ours.reduce<Record<string, number>>((m, i) => ((m[i.status] = (m[i.status] ?? 0) + 1), m), {});
console.log(`${apply ? "created" : "dry run, would create"} ${apply ? created : SEED_INVOICES.filter((s) => !existing.has(s.number)).length}; seed invoices on account by status:`, byStatus);
