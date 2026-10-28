// One row per open invoice for the invoice grid (src/app/invoice-grid.tsx): what each one puts at risk, how long it
// still waits, and what the agent is doing about it today. Plain data, computed on the server.

import { toBusinessDays, type AgentInput, type AgentRun } from "./agent";
import { daysBetween, OPEN_STATUSES } from "./exposure";
import { oneSigma } from "./fx";
import { proposalState } from "./plan-state";
import type { Invoice, Rates } from "./types";

export type InvoiceRow = {
  id: string;
  number: string;
  client: string;
  currency: string;
  amount: number;
  dueDate: string;
  daysToDue: number; // negative = overdue
  value: number; // in the home currency
  atRisk: number; // ±SHOCK_PCT% of value; 0 for home-currency invoices
  swing: number | null; // typical swing (1σ) until the due date; null when overdue or unknown
  agent: string; // what the agent is doing about it today
  offer: string; // the early-payment offer sent for it ("EUR 4,950.00 by 2026-11-01"), or ""
  offerState: "" | "open" | "paid" | "expired" | "closed";
  paidToday: boolean; // paid since the start of the book day: kept in the grid so the change is visible
};

export function invoiceRows(
  invoices: Invoice[],
  rates: Rates,
  vols: Record<string, number | null>,
  o: { base: string; asOf: string; shockPct: number; input: AgentInput; run: AgentRun | null },
): InvoiceRow[] {
  const rows: InvoiceRow[] = [];
  for (const inv of invoices) {
    const paidToday = /PAID/.test(inv.status) && !(inv.amountDue > 0) && (inv.payments ?? []).some((x) => x.date >= o.asOf);
    if (!paidToday && (!OPEN_STATUSES.has(inv.status) || !(inv.amountDue > 0))) continue;
    const home = inv.currency === o.base;
    const rate = home ? 1 : rates[inv.currency];
    if (!(rate > 0)) continue; // the exposure table lists it under "not counted"
    const value = inv.amountDue * rate;
    const d = daysBetween(o.asOf, inv.dueDate);
    const vol = vols[inv.currency];
    const proposal = o.run?.proposals.find((p) => p.invoiceId === inv.id);
    let agent = home ? "No FX risk" : "—";
    if (proposal) {
      const s = proposalState(proposal, o.input, invoices, o.run?.plannedAt).state;
      const what = proposal.kind === "reminder" ? "Reminder" : `${proposal.percent}% offer`;
      agent = s === "open" ? `${what} proposed` : s === "done" ? `${what} sent` : s === "paid" ? "Paid" : `${what} (changed)`;
    } else if (o.run?.notProposed.some((n) => n.invoiceNumber === inv.number)) agent = "Left alone";
    else if (o.run && !home) agent = "New — see Today"; // arrived after the day's plan; the agent's answer is on Today
    if (paidToday) agent = inv.offer?.state === "paid" ? "Paid today (offer)" : "Paid today";
    rows.push({
      id: inv.id,
      number: inv.number,
      client: inv.recipientName ?? "",
      currency: inv.currency,
      amount: inv.amountDue,
      dueDate: inv.dueDate,
      daysToDue: d,
      value,
      atRisk: home ? 0 : (value * o.shockPct) / 100,
      swing: home ? 0 : d > 0 && vol != null ? oneSigma(value, vol, toBusinessDays(d)) : null,
      agent,
      offer: inv.offer ? `${inv.currency} ${Math.round(inv.offer.amount).toLocaleString("en-US")} · ${shortDay(inv.offer.dueDate)}` : "",
      offerState: inv.offer?.state ?? "",
      paidToday,
    });
  }
  return rows.sort((a, b) => b.atRisk - a.atRisk || a.daysToDue - b.daysToDue);
}

const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
