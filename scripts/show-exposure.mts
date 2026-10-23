// Reads the sandbox seller's invoices and prints the exposure table and the agent's proposals,
// valued with today's ECB reference rates. Read-only.
//
//   npx tsx scripts/show-exposure.mts

import { computeExposure } from "../src/lib/exposure";
import { dailyVol, latestRates, rateHistory } from "../src/lib/fx";
import { PayPalClient, toInvoice } from "../src/lib/paypal";
import { buildProposals } from "../src/lib/proposals";
import { addDays } from "../src/lib/seed-data";
import { BUCKETS, type Invoice } from "../src/lib/types";

const asOf = new Date().toISOString().slice(0, 10);
const raw = await new PayPalClient().listInvoices();
const invoices: Invoice[] = [];
const skipped: { id: string; reason: string }[] = [];
for (const pp of raw) {
  const r = toInvoice(pp);
  if ("invoice" in r) invoices.push(r.invoice);
  else skipped.push(r.skipped);
}
const ccys = [...new Set(invoices.map((i) => i.currency))];
const { date, rates } = await latestRates(ccys);
const hist = await rateHistory(ccys, addDays(asOf, -120), asOf);
const vols = Object.fromEntries(ccys.map((c) => [c, dailyVol(hist[c] ?? [])]));

const e = computeExposure(invoices, rates, asOf);
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
console.log(`${raw.length} invoices on the account · as of ${asOf} · ECB reference rates ${date} via Frankfurter`);
console.log(["ccy", ...BUCKETS, "KRW", "±3% KRW"].join("\t"));
for (const r of e.rows) console.log([r.currency, ...BUCKETS.map((b) => fmt(r.buckets[b])), fmt(r.krw), fmt(r.shockKrw)].join("\t"));
console.log(`total foreign exposure ₩${fmt(e.totalKrw)} · ±3% = ₩${fmt(e.totalShockKrw)} · skipped ${[...skipped, ...e.skipped].length}`);

for (const p of buildProposals(invoices, rates, asOf, { dailyVols: vols })) {
  if (p.kind === "reminder") console.log(`reminder   ${p.invoiceNumber} ${p.currency} ${fmt(p.amount)} (₩${fmt(p.krw)}), ${p.daysOverdue}d overdue`);
  else
    console.log(
      `discount   ${p.invoiceNumber} ${p.currency} ${fmt(p.amount)} (₩${fmt(p.krw)}), due in ${p.daysToDue}d: cost ₩${fmt(p.costKrw)} · 1σ swing ₩${p.swingNowKrw == null ? "?" : fmt(p.swingNowKrw)} -> ₩${p.swingIfEarlyKrw == null ? "?" : fmt(p.swingIfEarlyKrw)}`,
    );
}
