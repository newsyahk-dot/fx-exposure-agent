// The autopilot: runs, without a click, the agent's proposals that the seller's approved standing policy
// covers. Everything else stays a proposal on screen. Same agent, same checks, same execution path as a
// manual approval; each action is logged in the invoice memo with an "auto" mark.

import { runAgent, type AgentRun } from "./agent";
import { cachedAgentRun } from "./agent-cache";
import { loadLiveInputs } from "./book";
import { executeAction } from "./execute";
import { PayPalClient } from "./paypal";
import { outsidePolicy, type Policy } from "./policy";
import { pickBase, viewFor } from "./view";

export type AutopilotResult = {
  ran: boolean;
  reason?: string; // why it did not run
  at: string;
  base?: string;
  executed: { invoiceNumber: string; kind: string; ok: boolean; message: string }[];
  left: { invoiceNumber: string; why: string }[]; // proposals the policy does not cover, or past the per-run cap
  agent?: AgentRun["source"];
};

// The plan comes from the same shared cache as the page: the same book, home currency and notes give the
// same plan the seller saw, at no extra model cost. Eligibility is re-checked per action in executeAction.
export async function runAutopilot(now = new Date(), planner: typeof runAgent = cachedAgentRun): Promise<AutopilotResult> {
  const at = now.toISOString();
  const inputs = await loadLiveInputs();
  const policy: Policy | undefined = inputs.policy;
  if (!policy?.enabled) return { ran: false, reason: "autopilot is off", at, executed: [], left: [] };
  if (!policy.approvedAt) return { ran: false, reason: "the policy has not been approved", at, executed: [], left: [] };

  const view = viewFor(inputs, pickBase(policy.base), now);
  const run = await planner(view.agentInput);
  const pp = new PayPalClient();
  const executed: AutopilotResult["executed"] = [];
  const left: AutopilotResult["left"] = [];
  for (const p of run.proposals) {
    // Rule-based fallback proposals price every eligible discount the same way; only the agent weighs them.
    const why = outsidePolicy(p, policy) ?? (run.source !== "agent" && p.kind !== "reminder" ? "the agent did not run; discounts need its plan" : null);
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
      left.push({ invoiceNumber: p.invoiceNumber, why: "no longer open" });
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
  return { ran: true, at, base: view.base, executed, left, agent: run.source };
}
