// Starts the shared demo book over when visitors have used up its story (src/lib/auto-reset.ts): no late invoice from
// abroad left and nobody has touched the book for a while. A page visit calls this; it re-checks the condition on
// fresh PayPal data, answers at once and does the reset in the background, the same way the nightly job does: reset,
// plan every currency for the new book, then switch everyone to it. Anyone may call it, but it only acts when the
// condition holds, and the book's age limit keeps it to one reset an hour at most.

import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { planFor } from "@/lib/agent-cache";
import { autoResetReason } from "@/lib/auto-reset";
import { demoMode, loadLiveInputs, settledBook } from "@/lib/book";
import { BOOK_TAG } from "@/lib/book-cache";
import { resetDemo } from "@/lib/demo-reset";
import { BASES } from "@/lib/fx";

export const maxDuration = 300;

let running = false; // one reset per instance at a time

export async function GET() {
  if (demoMode()) return Response.json({ reset: false, reason: "demo mode" });
  if (running) return Response.json({ reset: false, reason: "already resetting" });
  const inputs = await loadLiveInputs();
  const reason = autoResetReason(inputs, new Date());
  if (!reason) return Response.json({ reset: false });
  running = true;
  after(async () => {
    try {
      const r = await resetDemo();
      const fresh = await settledBook(r.gen);
      await Promise.allSettled(BASES.map((b) => planFor(fresh, b)));
      revalidateTag(BOOK_TAG, { expire: 0 });
      console.log(`[auto-reset] gen ${r.gen}: ${r.created} invoices, ${r.failed.length} failed`);
    } catch (e) {
      console.error("[auto-reset] failed", e);
    } finally {
      running = false;
    }
  });
  return Response.json({ reset: true, reason }, { status: 202 });
}
