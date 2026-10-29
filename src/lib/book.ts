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
import { ecbBefore, fetchEcbQuotes, type EcbQuotes } from "./fx";
import { attachOffers, isOfferNumber, originalNumber } from "./offer-invoice";
import { PayPalClient, toInvoice, type PPInvoice } from "./paypal";
import { DEFAULT_POLICY, parsePolicy, POLICY_TEMPLATE, type Policy } from "./policy";
import { addDays, parseSeedNumber } from "./seed-data";
import type { Invoice } from "./types";import { itemNames } from "./invoice-items";


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
  startedAt?: string; // live demo book: when the current generation was seeded (the last reset), ISO time
};

export const RATE_SOURCE = "ECB euro foreign exchange reference rates via Frankfurter";
export const HISTORY_DAYS = 830; // two years of start days for the evidence replay, plus the longest 90-day wait
const PAID = new Set(["PAID", "MARKED_AS_PAID", "PARTIALLY_PAID"]);

export function demoMode(): boolean {
  return process.env.DEMO_MODE === "1" || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET;
}

// The day the book is measured on. For the demo book that is the day it was last started over, for up to
// BOOK_DAY_HOLD_HOURS: the nightly reset (Vercel Cron, which only promises "within the hour") then decides when the
// day turns, and it plans every currency before visitors see the new book. Without this, every visit between 00:00
// UTC and the reset waited about a minute for a new plan (measured 2026-10-27). A real seller's book has no demo
// start, so its day is today.
export const BOOK_DAY_HOLD_HOURS = 36;
export function bookDay(startedAt: string | undefined, now: Date): string {
  const today = now.toISOString().slice(0, 10);
  const age = startedAt ? now.getTime() - Date.parse(startedAt) : NaN;
  return startedAt && age >= 0 && age < BOOK_DAY_HOLD_HOURS * 3_600_000 ? startedAt.slice(0, 10) : today;
}

export async function loadLiveInputs(day?: string): Promise<BookInputs> {
  const pp = new PayPalClient();
  const now = new Date();
  const until = day ?? now.toISOString().slice(0, 10);
  const [raw, allEcb, policy] = await Promise.all([pp.listInvoices(), fetchEcbQuotes(addDays(until, -HISTORY_DAYS - 7), until), loadPolicy(pp)]);
  const startedAt = bookStartedAt(raw);
  const asOf = day ?? bookDay(startedAt, now);
  const ecb = ecbBefore(allEcb, asOf); // the last complete fixing before the book day

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
  // Line items for open invoices, so the agent can name the billed work in a reminder (cached per invoice).
  const open = invoices.filter((i) => !i.items && i.amountDue > 0 && !i.offerFor);
  for (let i = 0; i < open.length; i += 6) {
    await Promise.all(
      open.slice(i, i + 6).map(async (inv) => {
        try {
          const items = await itemNames(inv.id);
          if (items.length) inv.items = items;
        } catch {
          // outside Next (scripts) the cache is not available; the book works without items
        }
      }),
    );
  }
  return { source: "live", asOf, fetchedAt: now.toISOString(), ecb, invoices: attachOffers(invoices, asOf), skipped, archived, policy, startedAt };
}

// Demo housekeeping. The sandbox account is reset by seeding a new generation of demo invoices
// (FXA-1001, FXA-1001-r2, ...), and PayPal keeps the old ones — paid invoices cannot even be edited.
// So invoices from an older generation, capability-check leftovers (CHK-...) and invoices marked
// "archived" in their memo are left out, and the page says how many. A real seller's invoice numbers
// never match these patterns.
// When the current demo generation was seeded: the earliest creation time among its invoices.
export function bookStartedAt(raw: PPInvoice[]): string | undefined {
  const newest = Math.max(0, ...raw.map((x) => parseSeedNumber(x.detail.invoice_number)?.gen ?? 0));
  return raw
    .filter((x) => parseSeedNumber(x.detail.invoice_number)?.gen === newest)
    .map((x) => x.detail.metadata?.create_time ?? "")
    .filter(Boolean)
    .sort()[0];
}

function retired(raw: PPInvoice[]): (x: PPInvoice) => boolean {
  const newest = Math.max(0, ...raw.map((x) => parseSeedNumber(x.detail.invoice_number)?.gen ?? 0));
  // Invoices the new-invoice assistant made before the latest demo reset belong to an older story too.
  const resetAt = bookStartedAt(raw);
  const isRetired = (x: PPInvoice): boolean => {
    const n = x.detail.invoice_number ?? "";
    // An early-payment offer goes with its original (src/lib/offer-invoice.ts).
    if (isOfferNumber(n)) {
      const orig = raw.find((y) => y.detail.invoice_number === originalNumber(n));
      return !orig || isRetired(orig) || /^fxa-agent:\s+archived\b/m.test(x.detail.memo ?? "");
    }
    const seed = parseSeedNumber(n);
    const oldAssistant = /^FXA-N\d{6}-/.test(n) && !!resetAt && (x.detail.metadata?.create_time ?? "") < resetAt;
    return (seed !== null && seed.gen < newest) || oldAssistant || n.startsWith("CHK-") || n.startsWith("PROBE-") || /^fxa-agent:\s+archived\b/m.test(x.detail.memo ?? "");
  };
  return isRetired;
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

// PayPal's invoice list can lag a few seconds behind the invoices a reset just created. Planning from a half-listed
// book gives the plans a wrong key (and a partial book), so visitors would plan again. Wait until the new generation
// is listed and its count stops changing (two reads 4 s apart), up to about a minute.
export async function settledBook(gen: number): Promise<BookInputs> {
  let last = -1;
  let inputs = await loadLiveInputs();
  for (let i = 0; i < 15; i++) {
    const n = inputs.invoices.filter((x) => parseSeedNumber(x.number)?.gen === gen).length;
    if (n > 0 && n === last) break;
    last = n;
    await new Promise((r) => setTimeout(r, 4000));
    inputs = await loadLiveInputs();
  }
  return inputs;
}
