// When the money from clients abroad comes in: each open foreign invoice placed in a week by when it is due (late ones
// first), as invoiced and as the agent's proposals ask (a reminded invoice paid within ASSUME.afterReminderDays, an
// offer by its new due date, net of the discount). The proposal timeline is an assumption and is labelled as one.
// Pure (types only), so the Today page and the /try page can both use it.

import type { AgentInput, AgentRun } from "./agent";
import { ASSUME } from "./evidence";

export const TIMELINE_BINS = [
  { key: "late", label: "Late", max: -1 },
  { key: "w1", label: "This week", max: 7 },
  { key: "w2", label: "Week 2", max: 14 },
  { key: "w3", label: "Week 3", max: 21 },
  { key: "w4", label: "Week 4", max: 28 },
  { key: "w6", label: "Weeks 5–6", max: 42 },
  { key: "w8", label: "Weeks 7–8", max: 56 },
  { key: "later", label: "Later", max: Infinity },
] as const;

export type MoneyTimeline = {
  bins: { key: string; label: string; asInvoiced: number; asProposed: number }[];
  soon: { days: number; asInvoiced: number; asProposed: number }; // due within `days` (late counts as not yet in)
  total: number;
};

const SOON_DAYS = 14;

const binOf = (days: number | null) => (days == null || days < 0 ? 0 : TIMELINE_BINS.findIndex((b) => b.max >= days && b.key !== "late"));

export function moneyTimeline(input: AgentInput, run: AgentRun): MoneyTimeline {
  const bins = TIMELINE_BINS.map((b) => ({ key: b.key, label: b.label, asInvoiced: 0, asProposed: 0 }));
  const byId = new Map(run.proposals.map((p) => [p.invoiceId, p]));
  const soon = { days: SOON_DAYS, asInvoiced: 0, asProposed: 0 };
  let total = 0;
  for (const c of input.candidates) {
    const late = c.daysToDue == null || c.daysToDue < 0;
    bins[binOf(late ? null : c.daysToDue)].asInvoiced += c.value;
    if (!late && c.daysToDue! <= SOON_DAYS) soon.asInvoiced += c.value;
    total += c.value;
    const p = byId.get(c.invoiceId);
    let days: number | null = late ? null : c.daysToDue;
    let value = c.value;
    if (p?.kind === "reminder") days = ASSUME.afterReminderDays;
    else if (p?.kind === "early_pay_discount") {
      days = p.withinDays;
      value = c.value * (1 - p.percent / 100);
    }
    bins[binOf(days)].asProposed += value;
    if (days != null && days <= SOON_DAYS) soon.asProposed += value;
  }
  return { bins, soon, total };
}
