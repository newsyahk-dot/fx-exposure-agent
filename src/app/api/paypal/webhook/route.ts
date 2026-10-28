// Receives PayPal webhook events (registered with scripts/register-webhook.mts). A verified invoice event
// expires the cached book; the open Today screen picks it up on its next refresh (src/app/live-refresh.tsx).
// When an invoice is sent (from this app or from PayPal itself), the agent looks at it in the background and, if the
// seller's approved policy covers what it proposes, acts on it (src/lib/autopilot.ts reactToNewInvoices).

import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { reactToNewInvoices } from "@/lib/autopilot";
import { parseSeedNumber } from "@/lib/seed-data";
import { demoMode } from "@/lib/book";
import { BOOK_TAG } from "@/lib/book-cache";
import { isOfferNumber } from "@/lib/offer-invoice";
import { settleOriginal } from "@/lib/offer-settle";
import { PayPalClient } from "@/lib/paypal";
import { isInvoiceEvent, verifyWebhook, webhookId } from "@/lib/webhook";

export const maxDuration = 120;

type InvoiceEvent = {
  event_type?: string;
  id?: string;
  resource?: { id?: string; invoice?: { id?: string; detail?: { invoice_number?: string } }; detail?: { invoice_number?: string } };
};

export async function POST(req: Request) {
  if (demoMode()) return new Response("demo mode", { status: 200 });
  let event: InvoiceEvent;
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
  // A newly sent invoice: let the agent look at it. Demo invoices re-created by a reset are skipped (the reset plans
  // every currency itself), so a reset does not start 22 agent runs.
  const number = event.resource?.invoice?.detail?.invoice_number ?? event.resource?.detail?.invoice_number;
  // The client paid an early-payment offer: record its original as settled, so PayPal does not ask for it again.
  const invoiceId = event.resource?.invoice?.id ?? event.resource?.id;
  if (event.event_type === "INVOICING.INVOICE.PAID" && isOfferNumber(number) && invoiceId)
    after(async () => {
      try {
        const settled = await settleOriginal(pp, await pp.getInvoice(invoiceId));
        if (settled) revalidateTag(BOOK_TAG, { expire: 0 });
        console.log(`[offer] ${number} paid${settled ? `; ${settled} settled` : ""}`);
      } catch (e) {
        console.error(`[offer] ${number}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  if (event.event_type === "INVOICING.INVOICE.SENT" && number && !parseSeedNumber(number) && !isOfferNumber(number))
    after(async () => {
      try {
        const r = await reactToNewInvoices();
        console.log(`[agent-event] ${number}: ${r.ran ? `${r.executed.length} run, ${r.left.length} waiting` : r.reason}`);
      } catch (e) {
        console.error(`[agent-event] ${number}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  console.log(`[paypal-webhook] ${event.event_type} ${event.id}`);
  return Response.json({ ok: true });
}
