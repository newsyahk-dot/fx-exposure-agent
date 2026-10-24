// One agent run per distinct book state and home currency, kept for days: reloads and a crowd of
// visitors do not multiply model calls. The input is plain data, so it is the cache key.
//
// "use cache: remote" stores the run in the host's shared cache (Vercel provides it). Plain "use cache"
// is in-memory per server instance, and on Vercel every visit landed on a fresh instance: measured
// 2026-10-24, the plan took ~22 s and called the model on every page view.

import { cacheLife } from "next/cache";
import { runAgent, type AgentInput, type AgentRun } from "./agent";

export async function cachedAgentRun(input: AgentInput): Promise<AgentRun> {
  "use cache: remote";
  cacheLife("days");
  return runAgent(input);
}
