// One agent plan per day, home currency, ECB fixing and seller notes — kept in the host's shared cache
// ("use cache: remote"; plain "use cache" is per instance, and on Vercel each visit landed on a new one).
//
// The key is deliberately small. Keying on the whole book meant every approval or payment changed the key,
// and the next screen waited 20–30 s for a new plan in the middle of the demo loop. Now the plan stays for the
// day and src/lib/plan-state.ts reconciles each proposal with the current invoices. "Re-plan" (a server action)
// expires PLAN_TAG when the seller wants new invoices considered; the warm cron computes plans ahead of visitors.

import { cacheLife, cacheTag } from "next/cache";
import { runAgent, type AgentRun } from "./agent";
import { loadLiveInputs, type BookInputs } from "./book";
import { pickBase, viewFor } from "./view";

export const PLAN_TAG = "plan";
// One tag per home currency, so "Re-plan" on one currency does not make every other currency's next visit wait.
export const planTag = (base: string) => `plan:${base}`;

// asOf, ecbDate, notes and startedAt (which demo generation) are only the cache key: the function reads the book
// itself. A demo reset starts a new generation, so it gets new plans without expiring anyone's current ones.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function dailyPlan(base: string, _asOf: string, _ecbDate: string, _notes: string, _startedAt: string): Promise<AgentRun> {
  "use cache: remote";
  cacheTag(PLAN_TAG, planTag(base));
  cacheLife("days");
  const inputs = await loadLiveInputs();
  const run = await runAgent(viewFor(inputs, pickBase(base), new Date()).agentInput);
  return { ...run, plannedAt: new Date().toISOString() };
}

// A one-off request from the seller ("Ask the agent"): the same agent and checks, focused on what was asked. Cached
// by the request and the same day/fixing/notes key, so asking again or reloading does not call the model twice.
async function requestPlan(
  base: string,
  _asOf: string,
  _ecbDate: string,
  _notes: string,
  _startedAt: string,
  request: string,
  readPayPal: boolean,
): Promise<AgentRun> {
  "use cache: remote";
  cacheTag(PLAN_TAG);
  cacheLife("hours");
  const inputs = await loadLiveInputs();
  const input = viewFor(inputs, pickBase(base), new Date()).agentInput;
  const run = await runAgent({ ...input, request, readPayPal });
  return { ...run, plannedAt: new Date().toISOString() };
}

// readPayPal: background runs (PayPal events) read invoices through PayPal's MCP server; a seller waiting on screen
// gets the faster run without it.
export function askFor(inputs: BookInputs, base: string, request: string, readPayPal = false): Promise<AgentRun> {
  return requestPlan(base, inputs.asOf, inputs.ecb.date, inputs.policy?.notes ?? "", inputs.startedAt ?? "", request, readPayPal);
}

export function planFor(inputs: BookInputs, base: string): Promise<AgentRun> {
  return dailyPlan(base, inputs.asOf, inputs.ecb.date, inputs.policy?.notes ?? "", inputs.startedAt ?? "");
}

// After a page is served: make sure every other home currency's plan is in the shared cache too, so switching
// currency never waits for the agent. A cached plan is a cheap lookup; a missing one is computed once per instance
// (later visits on the same instance skip the ones already running).
const warming = new Set<string>();
export async function warmOtherPlans(inputs: BookInputs, base: string, bases: readonly string[]): Promise<void> {
  const todo = bases.filter((b) => b !== base);
  await Promise.allSettled(
    todo.map(async (b) => {
      const key = [b, inputs.asOf, inputs.ecb.date, inputs.policy?.notes ?? "", inputs.startedAt ?? ""].join("|");
      if (warming.has(key)) return;
      warming.add(key);
      try {
        await planFor(inputs, b);
      } finally {
        warming.delete(key);
      }
    }),
  );
}
