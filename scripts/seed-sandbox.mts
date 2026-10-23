// Seeds the PayPal sandbox seller account with the demo book in src/lib/seed-data.ts.
//
//   npx tsx scripts/seed-sandbox.mts                  # dry run: shows what would be created
//   npx tsx scripts/seed-sandbox.mts --apply          # fills in the current generation (idempotent)
//   npx tsx scripts/seed-sandbox.mts --reset --apply  # closes every open seed invoice, seeds a new generation
//
// Use --reset after a demo run: approved actions change invoices (discounts, due dates) for good.
// Sandbox only. Never prints credentials.

import { PayPalClient } from "../src/lib/paypal";
import { closeSeedInvoices, currentGeneration, seedGeneration } from "../src/lib/seed";
import { parseSeedNumber } from "../src/lib/seed-data";

const apply = process.argv.includes("--apply");
const reset = process.argv.includes("--reset");
const recipient = process.env.SEED_RECIPIENT_EMAIL ?? "sb-lhwuh53492948@personal.example.com";
const seedDay = process.env.SEED_DAY ?? new Date().toISOString().slice(0, 10);
const log = (l: string) => console.log(l);

const pp = new PayPalClient();
const gen0 = currentGeneration(await pp.listInvoices());
let gen = Math.max(1, gen0);
console.log(`seed day ${seedDay} · recipient ${recipient} · current generation ${gen0 || "none"}${apply ? "" : " · DRY RUN"}`);

if (reset) {
  const n = await closeSeedInvoices(pp, { apply, log, today: seedDay });
  gen = gen0 + 1;
  console.log(`${apply ? "closed" : "would close"} ${apply ? n : "the open seed invoices above"}; new generation ${gen}`);
}

const created = await seedGeneration(pp, gen, { seedDay, recipient, apply, log });

const ours = (await pp.listInvoices()).filter((i) => parseSeedNumber(i.detail.invoice_number)?.gen === gen);
const byStatus = ours.reduce<Record<string, number>>((m, i) => ((m[i.status] = (m[i.status] ?? 0) + 1), m), {});
console.log(`${apply ? `created ${created}` : "dry run"}; generation ${gen} on account by status:`, byStatus);
