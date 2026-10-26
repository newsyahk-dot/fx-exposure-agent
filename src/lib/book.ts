// Loads the inputs the page needs: the seller's invoices and the raw ECB quotes.
//
// Two sources, same shape:
// - live: the PayPal sandbox account + Frankfurter (ECB reference rates)
// - demo: a saved snapshot (src/data/demo-snapshot.json), used when DEMO_MODE=1 or when the PayPal
//   keys are not set, so a crowd of judges never turns into a crowd of API calls.
// Inputs are independent of the home currency; everything derived (rates, exposure, proposals,
// timing effect) is computed from them by pure functions for whichever home currency is picked.

import demo from "../data/demo-snapshot.json";
import type { AgentRun } from "./agent";
import { fetchEcbQuotes, type EcbQuotes } from "./fx";
import { PayPalClient, toInvoice, type PPInvoice } from "./paypal";
import { DEFAULT_POLICY, parsePolicy, POLICY_TEMPLATE, type Policy } from "./policy";
import { addDays, parseSeedNumber } from "./seed-data";
import type { Invoice } from "./types";

export type BookInputs = {
  source: "live" | "demo";
  asOf: string; // the day the exposure is measured (YYYY-MM-DD)
  fetchedAt: string; // ISO timestamp
  ecb: EcbQuotes;
  invoices: Invoice[];
  skipped: { id: string; reason: string }[];
  archived: number; // retired demo invoices left out on purpose (see retired() below)
  policy?: Policy; // live only: the seller's standing policy and notes, from a PayPal invoice template
  agentRuns?: Record<string, AgentRun>; // demo snapshot only, by home currency: the demo never calls the model
};

export const RATE_SOURCE = "ECB euro foreign exchange reference rates via Frankfurter";
export const HISTORY_DAYS = 830; // two years of start days for the evidence replay, plus the longest 90-day wait
const PAID = new Set(["PAID", "MARKED_AS_PAID", "PARTIALLY_PAID"]);

export function demoMode(): boolean {
  return process.env.DEMO_MODE === "1" || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET;
}

export async function loadLiveInputs(asOf = new Date().toISOString().slice(0, 10)): Promise<BookInputs> {
  const pp = new PayPalClient();
  const [raw, ecb, policy] = await Promise.all([pp.listInvoices(), fetchEcbQuotes(addDays(asOf, -HISTORY_DAYS), asOf), loadPolicy(pp)]);

  // The list endpoint carries no payment dates; fetch them for recently paid invoices only.
  const since = addDays(asOf, -200); // payment dates are needed for the last 90 days of payments only
  const isRetired = retired(raw);
  const needDetail = raw.filter((i) => !isRetired(i) && PAID.has(i.status) && (i.detail.invoice_date ?? "") >= since);
  const detailed = new Map<string, PPInvoice>();
  for (let i = 0; i < needDetail.length; i += 6) {
    const batch = await Promise.all(needDetail.slice(i, i + 6).map((x) => pp.getInvoice(x.id)));
    for (const d of batch) detailed.set(d.id, d);
  }

  const invoices: Invoice[] = [];
  const skipped: BookInputs["skipped"] = [];
  let archived = 0;
  for (const x of raw) {
    if (isRetired(x)) {
      archived++;
      continue;
    }
    const r = toInvoice(detailed.get(x.id) ?? x);
    if (!("invoice" in r)) skipped.push(r.skipped);
    else invoices.push(r.invoice);
  }
  return { source: "live", asOf, fetchedAt: new Date().toISOString(), ecb, invoices, skipped, archived, policy };
}

// Demo housekeeping. The sandbox account is reset by seeding a new generation of demo invoices
// (FXA-1001, FXA-1001-r2, ...), and PayPal keeps the old ones — paid invoices cannot even be edited.
// So invoices from an older generation, capability-check leftovers (CHK-...) and invoices marked
// "archived" in their memo are left out, and the page says how many. A real seller's invoice numbers
// never match these patterns.
function retired(raw: PPInvoice[]): (x: PPInvoice) => boolean {
  const newest = Math.max(0, ...raw.map((x) => parseSeedNumber(x.detail.invoice_number)?.gen ?? 0));
  // Invoices the new-invoice assistant made before the latest demo reset belong to an older story too.
  const resetAt = raw
    .filter((x) => parseSeedNumber(x.detail.invoice_number)?.gen === newest)
    .map((x) => x.detail.metadata?.create_time ?? "")
    .filter(Boolean)
    .sort()[0];
  return (x) => {
    const n = x.detail.invoice_number ?? "";
    const seed = parseSeedNumber(n);
    const oldAssistant = /^FXA-N\d{6}-/.test(n) && !!resetAt && (x.detail.metadata?.create_time ?? "") < resetAt;
    return (seed !== null && seed.gen < newest) || oldAssistant || n.startsWith("CHK-") || n.startsWith("PROBE-") || /^fxa-agent:\s+archived\b/m.test(x.detail.memo ?? "");
  };
}

// A missing or unreadable template means the default policy, which is off.
export async function loadPolicy(pp: PayPalClient): Promise<Policy> {
  try {
    const t = await pp.findTemplate(POLICY_TEMPLATE);
    return t ? parsePolicy(t.template_info?.detail?.memo, t.template_info?.detail?.note) : DEFAULT_POLICY;
  } catch {
    return DEFAULT_POLICY;
  }
}

export function demoInputs(): BookInputs {
  return { ...(demo as unknown as Omit<BookInputs, "source">), source: "demo" };
}
