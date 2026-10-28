// One row per open invoice for the invoice grid (src/app/invoice-grid.tsx): what each one puts at risk, how long it
// still waits, and what the agent is doing about it today. Plain data, computed on the server.

import { toBusinessDays, type AgentInput, type AgentRun } from "./agent";
import { daysBetween, OPEN_STATUSES } from "./exposure";
import { oneSigma } from "./fx";
import { clientHistory } from "./invoice-plan";
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
  usuallyPays: string; // this client's history: "on time", "~6 days late", or "" when there is none
  // The agent's proposal for this invoice when it still waits for a click: approvable from the grid with the
  // agent's own wording, through the same server action and checks as the card.
  action?:
    | { kind: "reminder"; label: string; subject: string; message: string }
    | { kind: "early_pay_discount"; label: string; percent: number; withinDays: number; clientNote: string };
};

// "on time" / "~6 days late" from the client's fully paid invoices; "" when there are none.
function usuallyPays(invoices: Invoice[], client: string | undefined): string {
  if (!client) return "";
  const h = clientHistory(invoices, client);
  if (h.avgDaysLate == null) return "";
  return h.avgDaysLate <= 1 ? "pays on time" : `pays ~${h.avgDaysLate} days late`;
}

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
    let action: InvoiceRow["action"];
    if (proposal) {
      const s = proposalState(proposal, o.input, invoices, o.run?.plannedAt).state;
      if (s === "open")
        action =
          proposal.kind === "reminder"
            ? { kind: "reminder", label: `Reminder to ${inv.recipientName ?? inv.number}`, subject: proposal.subject, message: proposal.message }
            : {
                kind: "early_pay_discount",
                label: `${proposal.percent}% early-payment offer to ${inv.recipientName ?? inv.number}`,
                percent: proposal.percent,
                withinDays: proposal.withinDays,
                clientNote: proposal.clientNote,
              };
      const what = proposal.kind === "reminder" ? "Reminder" : `${proposal.percent}% offer`;
      agent = s === "open" ? `${what} proposed` : s === "done" ? `${what} sent` : s === "paid" ? "Paid" : `${what} (changed)`;
    } else if (o.run?.notProposed.some((n) => n.invoiceNumber === inv.number)) agent = "Left alone";
    else if (o.run && !home) agent = "New — see Today"; // arrived after the day's plan; the agent's answer is on Today
    // Done today but not (or no longer) in the plan — e.g. approved before the plan was made again.
    const doneToday = (inv.agentLog ?? []).filter((e) => (e.kind === "reminder" || e.kind === "early_pay_discount") && e.at.slice(0, 10) >= o.asOf).at(-1);
    if (doneToday && !action && !/sent$/.test(agent)) agent = doneToday.kind === "reminder" ? "Reminder sent" : "Offer sent";
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
      usuallyPays: usuallyPays(invoices, inv.recipientName),
      ...(action ? { action } : {}),
    });
  }
  return rows.sort((a, b) => b.atRisk - a.atRisk || a.daysToDue - b.daysToDue);
}

const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
