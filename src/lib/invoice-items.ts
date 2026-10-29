// What each open invoice billed for (its line item names). PayPal's invoice list leaves items out, so each open
// invoice is read once; items do not change after an invoice is sent, so the answer is kept for good (a failed read
// is kept for minutes only and tried again).

import { cacheLife } from "next/cache";
import { PayPalClient } from "./paypal";

// Outside Next (scripts such as the eval) there is no cache to set; the read still works.
const life = (forGood: boolean) => {
  try {
    if (forGood) cacheLife("max");
    else cacheLife("minutes");
  } catch {
    // not inside a Next.js cache scope
  }
};

export async function itemNames(id: string): Promise<string[]> {
  "use cache: remote";
  try {
    const d = await new PayPalClient().getInvoice(id);
    life(true);
    return (d.items ?? []).map((i) => (i.name ?? "").trim()).filter(Boolean);
  } catch {
    life(false);
    return [];
  }
}
