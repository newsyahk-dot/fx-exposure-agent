// The live book (PayPal invoices, payment dates, ECB history, policy), kept for a minute in the shared
// cache. Without it every click re-fetched all of PayPal and two years of ECB rates (~1.2 s on the server,
// more from far away). Every write action expires the tag immediately (updateTag in server actions,
// revalidateTag in the cron route), so the seller always sees their own changes; changes made outside the
// app (a client paying on PayPal's own page) show within about a minute (sooner through the webhook).
// After a minute the next visit gets the cached book at once and refreshes it in the background; the entry only
// expires after a day without visits. (It used to expire after 10 idle minutes, and the first click after a
// break then waited 2-4 s for all of PayPal with nothing moving on screen.)
// Server actions that decide on a write still load the book uncached (loadLiveInputs).

import { cacheLife, cacheTag } from "next/cache";
import { demoInputs, demoMode, loadLiveInputs, type BookInputs } from "./book";

export const BOOK_TAG = "book";

async function cachedLiveInputs(): Promise<BookInputs> {
  "use cache: remote";
  cacheTag(BOOK_TAG);
  cacheLife({ stale: 30, revalidate: 60, expire: 86_400 });
  return loadLiveInputs();
}

export async function loadInputs(): Promise<BookInputs> {
  return demoMode() ? demoInputs() : cachedLiveInputs();
}
