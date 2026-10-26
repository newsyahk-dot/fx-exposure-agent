// The day's plan stays fixed; the invoices move. This reconciles each proposal with what has happened to its
// invoice since the plan was made, so an approval or a payment shows at once — without recomputing the plan
// (which takes the model 20–30 s) — and the screen never offers an action that is no longer allowed.

import type { AgentInput, AgentProposal, AgentRun, Candidate } from "./agent";
import { OPEN_STATUSES } from "./exposure";
import type { Invoice } from "./types";

export type ProposalState =
  | { state: "open" } // still eligible: can be approved
  | { state: "done"; at: string; auto: boolean } // carried out since the plan
  | { state: "paid" } // nothing left to collect
  | { state: "closed" } // cancelled or otherwise gone
  | { state: "changed" }; // the invoice changed and the action no longer applies

export function proposalState(p: AgentProposal, input: AgentInput, invoices: Invoice[], plannedAt?: string): ProposalState {
  const inv = invoices.find((i) => i.id === p.invoiceId);
  if (!inv) return { state: "closed" };
  const acted = (inv.agentLog ?? [])
    .filter((e) => e.kind === p.kind && (!plannedAt || e.at >= plannedAt))
    .sort((a, b) => a.at.localeCompare(b.at))
    .at(-1);
  if (!OPEN_STATUSES.has(inv.status) || !(inv.amountDue > 0)) return /PAID/.test(inv.status) ? { state: "paid" } : { state: "closed" };
  if (acted) return { state: "done", at: acted.at, auto: !!acted.auto };
  const cand = input.candidates.find((c) => c.invoiceId === p.invoiceId);
  return cand?.eligible.includes(p.kind) ? { state: "open" } : { state: "changed" };
}

// Open invoices that are eligible for an action but that the plan never looked at (created or changed later).
export function notInPlan(run: AgentRun, input: AgentInput): Candidate[] {
  const seen = new Set([...run.proposals.map((p) => p.invoiceNumber), ...run.notProposed.map((n) => n.invoiceNumber)]);
  return input.candidates.filter((c) => c.eligible.length > 0 && !seen.has(c.invoiceNumber));
}
