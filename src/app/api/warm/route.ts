// Computes the agent plan for every home currency ahead of visitors (Vercel Cron, see vercel.json). With ?reset=1
// (nightly) it starts the demo book over, which also turns the book day (src/lib/book.ts bookDay): it plans every
// currency for the new book first and only then lets visitors see that book, so nobody waits about a minute for a plan.
// Costs about $0.01 per currency when the key changed; otherwise every currency is a cache hit.

import { revalidateTag } from "next/cache";
import { planFor } from "@/lib/agent-cache";
import { BOOK_TAG } from "@/lib/book-cache";
import { resetDemo } from "@/lib/demo-reset";
import { demoMode, settledBook } from "@/lib/book";
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
  if (new URL(req.url).searchParams.get("reset") === "1") reset = await resetDemo();
  // After a reset: plan the new book (new generation, new key) while visitors still see the old one with its plans.
  const inputs = reset ? await settledBook(reset.gen) : await loadInputs();
  const runs = await Promise.allSettled(BASES.map((b) => planFor(inputs, b)));
  if (reset) revalidateTag(BOOK_TAG, { expire: 0 }); // now switch everyone to the new book
  return Response.json({
    reset: reset && { gen: reset.gen, created: reset.created, closed: reset.closed, failed: reset.failed.length },
    asOf: inputs.asOf,
    ecb: inputs.ecb.date,
    seconds: Math.round((Date.now() - t0) / 1000),
    warmed: BASES.map((b, i) => ({ base: b, ok: runs[i].status === "fulfilled" && runs[i].value.source === "agent" })),
  });
}

