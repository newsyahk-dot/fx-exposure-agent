// One agent run per distinct book state and home currency, kept for days: reloads and a crowd of
// visitors do not multiply model calls. The input is plain data, so it is the cache key.

import { cacheLife } from "next/cache";
import { runAgent, type AgentInput, type AgentRun } from "./agent";

export async function cachedAgentRun(input: AgentInput): Promise<AgentRun> {
  "use cache";
  cacheLife("days");
  return runAgent(input);
}
