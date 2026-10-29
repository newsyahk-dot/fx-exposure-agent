// What each open invoice billed for (its line item names). PayPal's invoice list leaves items out, so each open
// invoice is read once; items do not change after an invoice is sent, so the answer is kept for good (a failed read
// is kept for minutes only and tried again).

import { cacheLife } from "next/cache";
import { PayPalClient } from "./paypal";

export async function itemNames(id: string): Promise<string[]> {
  "use cache: remote";
  try {
    const d = await new PayPalClient().getInvoice(id);
    cacheLife("max");
    return (d.items ?? []).map((i) => (i.name ?? "").trim()).filter(Boolean);
  } catch {
    cacheLife("minutes");
    return [];
  }
}
