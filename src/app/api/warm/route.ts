// Computes the agent plan for every home currency ahead of visitors (Vercel Cron, see vercel.json). The plan's
// cache key changes when the date changes (00:00 UTC) and when the ECB publishes the day's rates (~15:00 UTC);
// without this the first visitor after each change waits ~20-30 s. Costs about $0.004 per currency per run, and
// only when the key actually changed — otherwise every currency is a cache hit.

import { cachedAgentRun } from "@/lib/agent-cache";
import { demoMode } from "@/lib/book";
import { loadInputs } from "@/lib/book-cache";
import { cronAuthorized } from "@/lib/cron-auth";
import { BASES } from "@/lib/fx";
import { viewFor } from "@/lib/view";

export const maxDuration = 120;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  if (demoMode()) return Response.json({ warmed: [], reason: "demo mode" });
  const t0 = Date.now();
  const inputs = await loadInputs();
  const now = new Date();
  const runs = await Promise.allSettled(BASES.map((b) => cachedAgentRun(viewFor(inputs, b, now).agentInput)));
  return Response.json({
    asOf: inputs.asOf,
    ecb: inputs.ecb.date,
    seconds: Math.round((Date.now() - t0) / 1000),
    warmed: BASES.map((b, i) => ({ base: b, ok: runs[i].status === "fulfilled" && runs[i].value.source === "agent" })),
  });
}
