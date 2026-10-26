// Computes the agent plan for every home currency ahead of visitors (Vercel Cron, see vercel.json). The plan's
// cache key changes when the date changes (00:00 UTC) and when the ECB publishes the day's rates (~15:00 UTC);
// without this the first visitor after each change waits ~20-30 s. Costs about $0.004 per currency per run, and
// only when the key actually changed — otherwise every currency is a cache hit.

import { revalidateTag } from "next/cache";
import { PLAN_TAG, planFor } from "@/lib/agent-cache";
import { BOOK_TAG } from "@/lib/book-cache";
import { resetDemo } from "@/lib/demo-reset";
import { demoMode } from "@/lib/book";
import { loadInputs } from "@/lib/book-cache";
import { cronAuthorized } from "@/lib/cron-auth";
import { BASES } from "@/lib/fx";

export const maxDuration = 300;

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  if (demoMode()) return Response.json({ warmed: [], reason: "demo mode" });
  const t0 = Date.now();
  // ?reset=1 (the nightly run): put the demo book back to the start of the story first.
  let reset: Awaited<ReturnType<typeof resetDemo>> | null = null;
  if (new URL(req.url).searchParams.get("reset") === "1") {
    reset = await resetDemo();
    revalidateTag(BOOK_TAG, { expire: 0 });
    revalidateTag(PLAN_TAG, { expire: 0 });
  }
  const inputs = await loadInputs();
  const runs = await Promise.allSettled(BASES.map((b) => planFor(inputs, b)));
  return Response.json({
    reset: reset && { gen: reset.gen, created: reset.created, closed: reset.closed, failed: reset.failed.length },
    asOf: inputs.asOf,
    ecb: inputs.ecb.date,
    seconds: Math.round((Date.now() - t0) / 1000),
    warmed: BASES.map((b, i) => ({ base: b, ok: runs[i].status === "fulfilled" && runs[i].value.source === "agent" })),
  });
}
