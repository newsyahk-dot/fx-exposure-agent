// The autopilot: runs, without a click, the agent's proposals that the seller's approved standing policy
// covers. Everything else stays a proposal on screen. Same agent, same checks, same execution path as a
// manual approval; each action is logged in the invoice memo with an "auto" mark.

import type { AgentRun } from "./agent";
import { askFor, planFor } from "./agent-cache";
import { loadLiveInputs, type BookInputs } from "./book";
import { executeAction } from "./execute";
import { PayPalClient } from "./paypal";
import { outsidePolicy, type Policy } from "./policy";
import { notInPlan } from "./plan-state";
import { pickBase, viewFor, type BookView } from "./view";

export type AutopilotResult = {
  ran: boolean;
  reason?: string; // why it did not run
  at: string;
  base?: string;
  executed: { invoiceNumber: string; kind: string; ok: boolean; message: string }[];
  left: { invoiceNumber: string; why: string }[]; // proposals the policy does not cover, or past the per-run cap
  agent?: AgentRun["source"];
};

// The plan is the day's plan the seller sees (src/lib/agent-cache.ts), at no extra model cost. Each action is
// re-checked against the current book in executeAction, so a stale proposal cannot run.
export async function runAutopilot(now = new Date()): Promise<AutopilotResult> {
  const at = now.toISOString();
  const inputs = await loadLiveInputs();
  const policy: Policy | undefined = inputs.policy;
  if (!policy?.enabled) return { ran: false, reason: "autopilot is off", at, executed: [], left: [] };
  if (!policy.approvedAt) return { ran: false, reason: "the policy has not been approved", at, executed: [], left: [] };

  const view = viewFor(inputs, pickBase(policy.base), now);
  const run = await planFor(inputs, view.base);
  return { ran: true, at, base: view.base, agent: run.source, ...(await runWithinPolicy(run, inputs, view, policy, now)) };
}

// Runs the proposals of one agent run that the approved policy covers, up to its per-run cap, through the same
// executeAction path as a manual approval (marked "auto"). Shared by the morning run and the event reaction.
async function runWithinPolicy(run: AgentRun, inputs: BookInputs, view: BookView, policy: Policy, now: Date) {
  const pp = new PayPalClient();
  const executed: AutopilotResult["executed"] = [];
  const left: AutopilotResult["left"] = [];
  for (const p of run.proposals) {
    const sentOn = inputs.invoices.find((i) => i.id === p.invoiceId)?.invoiceDate;
    // Rule-based fallback proposals price every eligible discount the same way; only the agent weighs them.
    const why =
      outsidePolicy(p, policy, sentOn, now.toISOString().slice(0, 10)) ??
      (run.source !== "agent" && p.kind !== "reminder" ? "the agent did not run; discounts need its plan" : null);
    if (why) {
      left.push({ invoiceNumber: p.invoiceNumber, why });
      continue;
    }
    if (executed.length >= policy.maxActionsPerRun) {
      left.push({ invoiceNumber: p.invoiceNumber, why: `over the policy's ${policy.maxActionsPerRun} actions per run` });
      continue;
    }
    const cand = view.agentInput.candidates.find((c) => c.invoiceId === p.invoiceId);
    if (!cand) {
      const inv = inputs.invoices.find((i) => i.id === p.invoiceId);
      left.push({ invoiceNumber: p.invoiceNumber, why: inv && /PAID/.test(inv.status) ? "already paid" : "no longer open" });
      continue;
    }
    const r = await executeAction(
      pp,
      cand,
      p.kind === "reminder"
        ? { kind: "reminder", subject: p.subject, message: p.message }
        : { kind: "early_pay_discount", percent: p.percent, withinDays: p.withinDays, clientNote: p.clientNote },
      { base: view.base, asOf: inputs.asOf, now, auto: true },
    );
    executed.push({ invoiceNumber: p.invoiceNumber, kind: p.kind, ...r });
  }
  return { executed, left };
}

// A request that asks the agent about invoices that arrived after the day's plan was made. The same text (and so the
// same cached answer) is built here and on the Today screen.
export function newInvoicesRequest(numbers: string[]): string {
  const ns = [...numbers].sort();
  return ns.length === 1
    ? `New invoice ${ns[0]} was sent after today's plan. Consider only this invoice and propose what fits, or skip it with a reason.`
    : `New invoices ${ns.join(", ")} were sent after today's plan. Consider only these invoices and propose what fits, or skip each with a reason.`;
}

// Called after PayPal tells us (webhook) that an invoice was sent. The agent looks at whatever open invoices the day's
// plan has not seen; if the seller's approved policy covers what it proposes, that runs now, otherwise it waits on
// the Today screen ("New since today's plan"). Idempotent: the request is cached per set of invoices, and an action
// already taken makes the invoice ineligible for the same action.
export async function reactToNewInvoices(now = new Date()): Promise<AutopilotResult & { invoices: string[] }> {
  const at = now.toISOString();
  const inputs = await loadLiveInputs();
  const policy = inputs.policy;
  const view = viewFor(inputs, pickBase(policy?.base), now);
  const missing = notInPlan(await planFor(inputs, view.base), view.agentInput).map((m) => m.invoiceNumber);
  if (!missing.length) return { ran: false, reason: "nothing new", at, executed: [], left: [], invoices: [] };
  const run = await askFor(inputs, view.base, newInvoicesRequest(missing), true);
  if (!policy?.enabled || !policy.approvedAt)
    return { ran: false, reason: "autopilot is off; proposals wait on the Today screen", at, base: view.base, agent: run.source, executed: [], left: [], invoices: missing };
  return { ran: true, at, base: view.base, agent: run.source, invoices: missing, ...(await runWithinPolicy(run, inputs, view, policy, now)) };
}
