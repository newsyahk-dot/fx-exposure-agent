// Receives PayPal webhook events (registered with scripts/register-webhook.mts). A verified invoice event
// expires the cached book; the open Today screen picks it up on its next refresh (src/app/live-refresh.tsx).

import { revalidateTag } from "next/cache";
import { demoMode } from "@/lib/book";
import { BOOK_TAG } from "@/lib/book-cache";
import { PayPalClient } from "@/lib/paypal";
import { isInvoiceEvent, verifyWebhook, webhookId } from "@/lib/webhook";

export async function POST(req: Request) {
  if (demoMode()) return new Response("demo mode", { status: 200 });
  let event: { event_type?: string; id?: string };
  try {
    event = JSON.parse(await req.text());
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const pp = new PayPalClient();
  const id = await webhookId(pp, new URL(req.url).origin);
  if (!id) return new Response("webhook not registered", { status: 503 });
  if (!(await verifyWebhook(pp, req.headers, event, id))) return new Response("unverified", { status: 401 });
  if (isInvoiceEvent(event.event_type)) revalidateTag(BOOK_TAG, { expire: 0 });
  console.log(`[paypal-webhook] ${event.event_type} ${event.id}`);
  return Response.json({ ok: true });
}
