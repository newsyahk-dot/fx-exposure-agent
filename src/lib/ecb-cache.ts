// ECB quotes for a day, kept for hours in the shared cache: used to value a seller's own pasted invoices
// ("Try it with your own invoices"), which are measured as of today, not on the demo book's day.

import { cacheLife } from "next/cache";
import { HISTORY_DAYS } from "./book";
import { fetchEcbQuotes, type EcbQuotes } from "./fx";
import { addDays } from "./seed-data";

export async function quotesFor(day: string): Promise<EcbQuotes> {
  "use cache: remote";
  cacheLife("hours");
  return fetchEcbQuotes(addDays(day, -HISTORY_DAYS - 7), day);
}
