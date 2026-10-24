// Checks that the two agent actions work on the PayPal sandbox, using throw-away invoices
// (numbers start with CHK-, so the demo book in seed-data.ts is left untouched):
//   1. send_invoice_reminder         POST /v2/invoicing/invoices/{id}/remind
//   2. early-payment discount rule   POST /v2/invoicing/invoices/{id}/conditional-rules
// After the check the CHK- invoices are cancelled (pass --keep to leave them open).
//
//   npx tsx scripts/check-actions.mts

import { PayPalClient, PayPalError } from "../src/lib/paypal";
import { addDays, money } from "../src/lib/seed-data";

const pp = new PayPalClient();
const today = new Date().toISOString().slice(0, 10);
const recipient = process.env.SEED_RECIPIENT_EMAIL ?? "sb-lhwuh53492948@personal.example.com";
const stamp = Date.now().toString(36).toUpperCase();
const results: { check: string; ok: boolean; detail: string }[] = [];

async function make(currency: string, amount: number, issueOffset: number, dueOffset: number, tag: string) {
  const draft = await pp.createDraftInvoice({
    detail: {
      currency_code: currency,
      invoice_number: `CHK-${stamp}-${tag}`,
      invoice_date: addDays(today, issueOffset),
      payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: addDays(today, dueOffset) },
      note: "Capability check — safe to ignore",
    },
    primary_recipients: [{ billing_info: { email_address: recipient } }],
    items: [{ name: "Capability check", quantity: "1", unit_amount: money(currency, amount) }],
  });
  await pp.sendInvoice(draft.id, { send_to_recipient: true });
  return draft.id;
}

async function step(check: string, fn: () => Promise<string>) {
  try {
    results.push({ check, ok: true, detail: await fn() });
  } catch (e) {
    results.push({ check, ok: false, detail: e instanceof PayPalError ? e.message : String(e) });
  }
}

const made: string[] = [];

// 1. Reminder on an overdue invoice.
await step("reminder on overdue USD invoice", async () => {
  const id = await make("USD", 1500, -40, -10, "R");
  made.push(id);
  const r = await pp.sendReminder(id, {
    subject: "Friendly reminder: invoice past due",
    note: "This invoice was due 10 days ago. Thank you for settling it at your convenience.",
  });
  const after = await pp.getInvoice(id);
  return `${id}: HTTP ok (${r === undefined ? "204 no body" : "body"}), status ${after.status}`;
});

// 2. Early-payment discount on a EUR invoice due in 30 days, and on a JPY one (no minor unit).
for (const [ccy, amount, tag] of [["EUR", 2000, "D1"], ["JPY", 300000, "D2"]] as const) {
  await step(`early-payment discount 1% within 7 days (${ccy})`, async () => {
    const id = await make(ccy, amount, -2, 30, tag);
    made.push(id);
    const before = await pp.getInvoice(id);
    await pp.createEarlyPaymentDiscount(id, 1, addDays(today, 7));
    const after = (await pp.getInvoice(id)) as unknown as Record<string, unknown>;
    // Where PayPal reflects the rule is not documented; report every field that mentions it.
    const hits = findPaths(after, /conditional|early|discount/i);
    return `${id}: rule accepted; status ${before.status} -> ${String(after.status)}; due_amount ${JSON.stringify(after.due_amount)}; fields: ${hits.join(" | ") || "(none on GET)"}`;
  });
}

// 3. Fallback: edit the sent invoice (flat 1% discount, due date pulled in to 7 days, re-sent).
for (const [ccy, amount, tag] of [["EUR", 2000, "F1"], ["JPY", 300000, "F2"]] as const) {
  await step(`fallback: 1% discount + due in 7 days via invoice update (${ccy})`, async () => {
    const id = await make(ccy, amount, -2, 30, tag);
    made.push(id);
    const due = addDays(today, 7);
    const r = await pp.offerEarlyPaymentByUpdate(id, 1, due, `Early-payment offer: 1% off, now due ${due}.`);
    return `${id}: status ${r.status}, due ${r.detail.payment_term?.due_date}, total ${r.amount?.value} ${ccy} (was ${amount}), due_amount ${r.due_amount?.value}`;
  });
}

if (!process.argv.includes("--keep")) {
  for (const id of made) {
    await step(`cancel ${id}`, async () => {
      await pp.cancelInvoice(id);
      return (await pp.getInvoice(id)).status;
    });
  }
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.check}\n      ${r.detail}`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;

function findPaths(o: unknown, re: RegExp, path = ""): string[] {
  if (!o || typeof o !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    const p = path ? `${path}.${k}` : k;
    if (re.test(k)) out.push(`${p}=${JSON.stringify(v)}`);
    else out.push(...findPaths(v, re, p));
  }
  return out;
}
