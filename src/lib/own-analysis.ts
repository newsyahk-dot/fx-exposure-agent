// Analyses a pasted invoice list with the same code as the demo book: what is waiting, what is late, where the
// exchange-rate risk sits, and the plan under the same rules (code only; the agent plan is added by the caller).
// Pure: no PayPal, no storage.

import { rulesRun, type AgentInput, type AgentRun } from "./agent";
import type { BookInputs } from "./book";
import { ECB_CURRENCIES, type Base, type EcbQuotes } from "./fx";
import { moneyTimeline, type MoneyTimeline } from "./money-timeline";
import { parseOwnInvoices } from "./own-invoices";
import { viewFor } from "./view";

export type OwnAnalysis = {
  base: string;
  asOf: string;
  ecbDate: string;
  read: number; // invoices read
  columns: Record<string, string>;
  skipped: { row: number; reason: string }[];
  waiting: number; // foreign-currency invoices, home-currency value
  overdue: number;
  overdueCount: number;
  shock: number; // ±3% stress test on the foreign total
  baseTotal: number; // invoices already in the home currency
  rows: { currency: string; total: number; value: number; shock: number; overdue: number; count: number }[];
  run: AgentRun;
  timeline: MoneyTimeline;
  clients: Record<string, string>; // invoice id -> client name, for the proposal cards
  // One row per pasted line, for the grid on /try: read invoices with their value and risk, and rows that could not be
  // read with the reason (nothing silently dropped).
  lines: OwnLine[];
};

export type OwnLine = {
  row: number | null; // line number in the pasted list, when known
  number: string;
  client: string;
  currency: string;
  amount: number | null;
  dueDate: string;
  daysToDue: number | null;
  value: number | null; // in the home currency
  atRisk: number | null; // ±3% stress test, home currency (0 for home-currency invoices)
  error?: string; // set when the row could not be read or valued
};

export function analyzeOwn(text: string, base: Base, ecb: EcbQuotes, today: string, now = new Date()): { analysis: OwnAnalysis; agentInput: AgentInput } {
  const parsed = parseOwnInvoices(text, new Set<string>(ECB_CURRENCIES));
  const inputs: BookInputs = { source: "live", asOf: today, fetchedAt: now.toISOString(), ecb, invoices: parsed.invoices, skipped: [], archived: 0 };
  const view = viewFor(inputs, base, now);
  const e = view.exposure;
  const overdueOf = (ccy?: string) =>
    parsed.invoices
      .filter((i) => i.currency !== base && (!ccy || i.currency === ccy) && i.dueDate < today && (view.rates[i.currency] ?? 0) > 0)
      .reduce((s, i) => s + i.amountDue * view.rates[i.currency], 0);
  const analysis: OwnAnalysis = {
    base,
    asOf: today,
    ecbDate: ecb.date,
    read: parsed.invoices.length,
    columns: parsed.columns,
    skipped: [...parsed.skipped, ...e.skipped.map((s) => ({ row: Number(s.id.replace("own-", "")) || 0, reason: s.reason }))],
    waiting: e.totalValue,
    overdue: overdueOf(),
    overdueCount: parsed.invoices.filter((i) => i.currency !== base && i.dueDate < today).length,
    shock: e.totalShock,
    baseTotal: e.baseTotal,
    rows: e.rows.map((r) => ({ currency: r.currency, total: r.total, value: r.value, shock: r.shock, overdue: overdueOf(r.currency), count: r.invoiceCount })),
    run: rulesRun(view.agentInput, "your invoices — rules"),
    timeline: { bins: [], soon: { days: 14, asInvoiced: 0, asProposed: 0 }, total: 0 },
    clients: Object.fromEntries(parsed.invoices.filter((i) => i.recipientName).map((i) => [i.id, i.recipientName!])),
    lines: [],
  };
  analysis.timeline = moneyTimeline(view.agentInput, analysis.run);
  const day = Date.parse(today);
  const unvalued = new Map(e.skipped.map((k) => [k.id, k.reason]));
  analysis.lines = [
    ...parsed.invoices.map((i): OwnLine => {
      const rate = i.currency === base ? 1 : view.rates[i.currency];
      const value = rate > 0 ? i.amountDue * rate : null;
      const err = unvalued.get(i.id);
      return {
        row: Number(i.id.replace("own-", "")) || null,
        number: i.number,
        client: i.recipientName ?? "",
        currency: i.currency,
        amount: i.amountDue,
        dueDate: i.dueDate,
        daysToDue: Math.round((Date.parse(i.dueDate) - day) / 86_400_000),
        value,
        atRisk: value == null ? null : i.currency === base ? 0 : (value * 3) / 100,
        ...(err ? { error: err } : {}),
      };
    }),
    ...parsed.skipped.map((k): OwnLine => ({
      row: k.row, number: "", client: "", currency: "", amount: null, dueDate: "", daysToDue: null, value: null, atRisk: null, error: k.reason,
    })),
  ].sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
  return { analysis, agentInput: view.agentInput };
}
