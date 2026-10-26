// PayPal webhooks: when an invoice is paid (or otherwise changes) PayPal posts an event; we verify it with PayPal
// and expire the cached book, so the seller's screen shows the payment within seconds — the "done, and you are
// told" end of the loop, with no one pressing anything.

import type { PayPalClient } from "./paypal";

export const WEBHOOK_PATH = "/api/paypal/webhook";
export const WEBHOOK_EVENTS = [
  "INVOICING.INVOICE.PAID",
  "INVOICING.INVOICE.UPDATED",
  "INVOICING.INVOICE.CANCELLED",
  "INVOICING.INVOICE.REFUNDED",
  "INVOICING.INVOICE.SENT",
  "INVOICING.INVOICE.CREATED",
];

type Hook = { id: string; url: string };
let cachedId: string | undefined;

// The webhook id is needed to verify signatures. PAYPAL_WEBHOOK_ID wins; otherwise it is looked up by URL.
export async function webhookId(pp: PayPalClient, origin: string): Promise<string | undefined> {
  if (process.env.PAYPAL_WEBHOOK_ID) return process.env.PAYPAL_WEBHOOK_ID;
  if (cachedId) return cachedId;
  const r = await pp.request<{ webhooks?: Hook[] }>("GET", "/v1/notifications/webhooks");
  cachedId = r.webhooks?.find((w) => w.url === `${origin}${WEBHOOK_PATH}`)?.id;
  return cachedId;
}

const HEADERS = {
  auth_algo: "paypal-auth-algo",
  cert_url: "paypal-cert-url",
  transmission_id: "paypal-transmission-id",
  transmission_sig: "paypal-transmission-sig",
  transmission_time: "paypal-transmission-time",
} as const;

// Asks PayPal whether this delivery really came from PayPal for our webhook.
export async function verifyWebhook(pp: PayPalClient, headers: Headers, event: unknown, id: string): Promise<boolean> {
  const fields = Object.fromEntries(Object.entries(HEADERS).map(([k, h]) => [k, headers.get(h) ?? ""]));
  if (Object.values(fields).some((v) => !v)) return false;
  const r = await pp.request<{ verification_status?: string }>("POST", "/v1/notifications/verify-webhook-signature", {
    ...fields,
    webhook_id: id,
    webhook_event: event,
  });
  return r.verification_status === "SUCCESS";
}

export const isInvoiceEvent = (type: unknown) => typeof type === "string" && type.startsWith("INVOICING.INVOICE.");
