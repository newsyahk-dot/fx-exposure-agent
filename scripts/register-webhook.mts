// Registers (or updates) the PayPal sandbox webhook that tells the app when invoices change.
//   npx tsx scripts/register-webhook.mts https://fx-exposure-agent.vercel.app
import { PayPalClient } from "../src/lib/paypal";
import { WEBHOOK_EVENTS, WEBHOOK_PATH } from "../src/lib/webhook";

const origin = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https:\/\//.test(origin)) throw new Error("usage: register-webhook.mts https://your-site");
const url = `${origin}${WEBHOOK_PATH}`;
const pp = new PayPalClient();
const list = await pp.request<{ webhooks?: { id: string; url: string }[] }>("GET", "/v1/notifications/webhooks");
const found = list.webhooks?.find((w) => w.url === url);
const event_types = WEBHOOK_EVENTS.map((name) => ({ name }));
if (found) {
  await pp.request("PATCH", `/v1/notifications/webhooks/${found.id}`, [{ op: "replace", path: "/event_types", value: event_types }]);
  console.log(`updated webhook ${found.id} -> ${url}`);
} else {
  const w = await pp.request<{ id: string }>("POST", "/v1/notifications/webhooks", { url, event_types });
  console.log(`created webhook ${w.id} -> ${url}`);
}
