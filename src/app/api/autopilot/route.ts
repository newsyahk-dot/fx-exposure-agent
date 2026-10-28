// Scheduled autopilot run (Vercel Cron, see vercel.json).

import { revalidateTag } from "next/cache";
import { demoMode } from "@/lib/book";
import { BOOK_TAG } from "@/lib/book-cache";
import { runAutopilot } from "@/lib/autopilot";
import { cronAuthorized } from "@/lib/cron-auth";
import { reconcileOffers } from "@/lib/offer-settle";
import { PayPalClient } from "@/lib/paypal";

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return new Response("Unauthorized", { status: 401 });
  if (demoMode()) return Response.json({ ran: false, reason: "demo mode" });
  try {
    // Offers first: settle originals whose offer was paid, cancel offers past their date.
    const offers = await reconcileOffers(new PayPalClient()).catch(() => ({ settled: [], lapsed: [] }));
    if (offers.settled.length || offers.lapsed.length) revalidateTag(BOOK_TAG, { expire: 0 });
    const r = await runAutopilot();
    if (r.executed.some((x) => x.ok)) revalidateTag(BOOK_TAG, { expire: 0 });
    return Response.json(r);
  } catch (e) {
    return Response.json({ ran: false, reason: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
