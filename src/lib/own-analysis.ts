// Analyses a pasted invoice list with the same code as the demo book: what is waiting, what is late, where the
// exchange-rate risk sits, and the plan under the same rules (code only; the agent plan is added by the caller).
// Pure: no PayPal, no storage.

import { rulesRun, type AgentInput, type AgentRun } from "./agent";
import type { BookInputs } from "./book";
import { ECB_CURRENCIES, type Base, type EcbQuotes } from "./fx";
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
  };
  return { analysis, agentInput: view.agentInput };
}
