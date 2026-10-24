// Reads the sandbox seller's invoices and prints the exposure table, the timing effect and the
// rule-based eligibility for one home currency. Read-only; does not call the model.
//
//   npx tsx scripts/show-exposure.mts [USD|EUR|GBP|JPY|KRW]

import { loadLiveInputs } from "../src/lib/book";
import { compact } from "../src/lib/format";
import { BUCKETS } from "../src/lib/types";
import { pickBase, viewFor } from "../src/lib/view";

const base = pickBase(process.argv[2]);
const inputs = await loadLiveInputs();
const v = viewFor(inputs, base, new Date());
const c = (n: number) => compact(base, n);
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
console.log(`${inputs.invoices.length} invoices (${inputs.archived} archived) · as of ${inputs.asOf} · ECB ${inputs.ecb.date} · home ${base}`);
console.log(["ccy", ...BUCKETS, base, "±3%"].join("\t"));
for (const r of v.exposure.rows) console.log([r.currency, ...BUCKETS.map((b) => fmt(r.buckets[b])), c(r.value), c(r.shock)].join("\t"));
console.log(`foreign exposure ${c(v.exposure.totalValue)} · ±3% ${c(v.exposure.totalShock)} · already in ${base} ${c(v.exposure.baseTotal)}`);
const t = v.timing;
console.log(`timing, last 90 days: net ${c(t.net)} (gains ${c(t.gains)}, losses ${c(t.losses)}, late part ${c(t.lateNet)}) over ${t.rows.length} payments`);
for (const r of t.rows) console.log(`  ${r.invoiceNumber} ${r.currency} ${fmt(r.amount)} ${r.invoiceDate} -> ${r.paidDate} late ${r.daysLate}d: ${c(r.effect)}`);
for (const k of v.agentInput.candidates) console.log(`  ${k.invoiceNumber} eligible: ${k.eligible.join(",") || "-"} ${k.notEligible.join("; ")}`);
