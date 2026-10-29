// One row per open invoice for the invoice grid (src/app/invoice-grid.tsx): what each one puts at risk, how long it
// still waits, and what the agent is doing about it today. Plain data, computed on the server.

import { toBusinessDays, type AgentInput, type AgentRun } from "./agent";
import { bucketOf, daysBetween, OPEN_STATUSES } from "./exposure";
import { oneSigma } from "./fx";
import { clientHistory, sameClient } from "./invoice-plan";
import { offerNoteTemplate, percentsWithinRule } from "./offer-rule";
import { proposalState } from "./plan-state";
import type { Bucket, Invoice, Rates } from "./types";

export type InvoiceRow = {
  id: string;
  number: string;
  client: string;
  currency: string;
  amount: number;
  dueDate: string;
  daysToDue: number; // negative = overdue
  bucket: Bucket | null; // the exposure grid's due-date bucket (src/lib/exposure.ts bucketOf)
  value: number; // in the home currency
  atRisk: number; // ±SHOCK_PCT% of value; 0 for home-currency invoices
  swing: number | null; // typical swing (1σ) until the due date; null when overdue or unknown
  agent: string; // what the agent is doing about it today
  offer: string; // the early-payment offer sent for it ("EUR 4,950.00 by 2026-11-01"), or ""
  offerState: "" | "open" | "paid" | "expired" | "closed";
  paidToday: boolean; // paid since the start of the book day: kept in the grid so the change is visible
  paidAmount: number; // what was paid since the start of the book day (shown on a paid-today row)
  usuallyPays: string; // this client's history: "on time", "~6 days late", or "" when there is none
  detailOf?: string; // grid only: an expanded detail row under the invoice with this id
  history: { number: string; amount: number; currency: string; dueDate: string; paidOn: string; daysLate: number }[]; // their paid invoices, newest first
  // The agent's proposal for this invoice when it still waits for a click: approvable from the grid with the
  // agent's own wording, through the same server action and checks as the card.
  action?:
    | { kind: "reminder"; label: string; subject: string; message: string; edited?: boolean }
    | {
        kind: "early_pay_discount";
        label: string;
        percent: number;
        withinDays: number;
        clientNote: string;
        newDueDate: string;
        percents: number[]; // what the seller may pick instead, within the app's offer rule
        edited?: boolean;
      };

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
                newDueDate: proposal.newDueDate,
                percents: percentsWithinRule(d - proposal.withinDays),
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
      bucket: bucketOf(inv.dueDate, o.asOf),
      value,
      atRisk: home ? 0 : (value * o.shockPct) / 100,
      swing: home ? 0 : d > 0 && vol != null ? oneSigma(value, vol, toBusinessDays(d)) : null,
      agent,
      offer: inv.offer ? `${inv.currency} ${Math.round(inv.offer.amount).toLocaleString("en-US")} · ${shortDay(inv.offer.dueDate)}` : "",
      offerState: inv.offer?.state ?? "",
      paidToday,
      paidAmount: paidToday ? (inv.payments ?? []).filter((x) => x.date >= o.asOf).reduce((s, x) => s + x.amount, 0) : 0,
      usuallyPays: usuallyPays(invoices, inv.recipientName),
      history: paidHistory(invoices, inv.recipientName),
      ...(action ? { action } : {}),
    });
  }
  return rows.sort((a, b) => b.atRisk - a.atRisk || a.daysToDue - b.daysToDue);
}

const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// The client's fully paid invoices, newest first (at most 6): when each was due and when it was paid.
function paidHistory(invoices: Invoice[], client: string | undefined): InvoiceRow["history"] {
  if (!client) return [];
  return invoices
    .filter((i) => sameClient(i.recipientName, client) && !(i.amountDue > 0) && i.payments?.length)
    .map((i) => {
      const paidOn = i.payments!.map((p) => p.date).sort().at(-1)!;
      return {
        number: i.number,
        amount: i.total ?? i.payments!.reduce((s, p) => s + p.amount, 0),
        currency: i.currency,
        dueDate: i.dueDate,
        paidOn,
        daysLate: Math.max(0, daysBetween(i.dueDate, paidOn)),
      };
    })
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn))
    .slice(0, 6);
}

// A seller's edit to the agent's draft, applied to the row's action. A changed percent replaces the client note with
// code's own sentence, since the agent's named the old percent. The server checks the result again on approval.
export type DraftEdit = { message?: string; percent?: number };
export function applyEdit(a: NonNullable<InvoiceRow["action"]>, e: DraftEdit | undefined): NonNullable<InvoiceRow["action"]> {
  if (!e) return a;
  if (a.kind === "reminder") return e.message != null && e.message !== a.message ? { ...a, message: e.message, edited: true } : a;
  if (e.percent == null || e.percent === a.percent || !a.percents.includes(e.percent)) return a;
  return {
    ...a,
    percent: e.percent,
    clientNote: offerNoteTemplate(a.newDueDate, e.percent),
    label: a.label.replace(/^[\d.]+% /, `${e.percent}% `),
    edited: true,
  };
}
