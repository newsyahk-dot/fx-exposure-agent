// Loads the inputs the page needs: the seller's invoices, today's ECB rates and recent volatility.
//
// Two sources, same shape:
// - live: the PayPal sandbox account + Frankfurter (ECB reference rates)
// - demo: a saved snapshot (src/data/demo-snapshot.json), used when DEMO_MODE=1 or when the PayPal
//   keys are not set, so a crowd of judges never turns into a crowd of API calls.
// Everything derived (exposure table, proposals) is computed from these inputs by pure functions,
// so both sources produce the screen the same way.

import demo from "../data/demo-snapshot.json";
import { dailyVol, latestRates, rateHistory } from "./fx";
import { PayPalClient, toInvoice } from "./paypal";
import { addDays } from "./seed-data";
import type { Invoice, Rates } from "./types";

export type BookInputs = {
  source: "live" | "demo";
  asOf: string; // the day the exposure is measured (YYYY-MM-DD)
  rateDate: string; // ECB reference-rate date
  rates: Rates; // KRW per unit
  dailyVols: Record<string, number | null>;
  invoices: Invoice[];
  skipped: { id: string; reason: string }[];
  fetchedAt: string; // ISO timestamp
};

export const RATE_SOURCE = "ECB euro foreign exchange reference rates via Frankfurter";
const VOL_LOOKBACK_DAYS = 120;

export function demoMode(): boolean {
  return process.env.DEMO_MODE === "1" || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET;
}

export async function loadLiveInputs(asOf = new Date().toISOString().slice(0, 10)): Promise<BookInputs> {
  const raw = await new PayPalClient().listInvoices();
  const invoices: Invoice[] = [];
  const skipped: BookInputs["skipped"] = [];
  for (const pp of raw) {
    const r = toInvoice(pp);
    if ("invoice" in r) invoices.push(r.invoice);
    else skipped.push(r.skipped);
  }
  const ccys = [...new Set(invoices.map((i) => i.currency))].filter((c) => c !== "KRW");
  const [{ date, rates }, hist] = await Promise.all([
    latestRates(ccys),
    rateHistory(ccys, addDays(asOf, -VOL_LOOKBACK_DAYS), asOf),
  ]);
  const dailyVols = Object.fromEntries(ccys.map((c) => [c, dailyVol(hist[c] ?? [])]));
  return { source: "live", asOf, rateDate: date, rates, dailyVols, invoices, skipped, fetchedAt: new Date().toISOString() };
}

export function demoInputs(): BookInputs {
  return { ...(demo as Omit<BookInputs, "source">), source: "demo" };
}

export async function loadInputs(): Promise<BookInputs> {
  return demoMode() ? demoInputs() : loadLiveInputs();
}
