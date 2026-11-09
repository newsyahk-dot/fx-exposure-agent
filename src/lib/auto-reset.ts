// The hosted demo book is shared. Once visitors have paid every late invoice from abroad, the next judge sees a book
// with no foreign late money: the first cards are domestic reminders and the exposure story is gone (blind review,
// 2026-11-09). So a page visit asks for a reset when that has happened and the book has been quiet for a while — never
// while someone is in the middle of the demo. The decision is pure (below); /api/auto-reset re-checks it on fresh data.

import { OPEN_STATUSES } from "./exposure";
import type { BookInputs } from "./book";

export const AUTO_RESET_IDLE_MIN = 30; // no payment, reminder or offer on any invoice for this long
export const AUTO_RESET_MIN_AGE_MIN = 60; // and the book is at least this old
export const DEMO_HOME = "USD"; // the demo seller's own currency: invoices in it are not "from abroad"

export function autoResetReason(inputs: Pick<BookInputs, "startedAt" | "asOf" | "invoices">, now: Date): string | null {
  if (!inputs.startedAt) return null; // a real seller's book is never reset
  const t = now.getTime();
  if (t - Date.parse(inputs.startedAt) < AUTO_RESET_MIN_AGE_MIN * 60_000) return null;
  const lateAbroad = inputs.invoices.filter(
    (i) => i.currency !== DEMO_HOME && OPEN_STATUSES.has(i.status) && i.amountDue > 0 && i.dueDate < inputs.asOf,
  );
  if (lateAbroad.length) return null;
  const times = [inputs.startedAt, ...inputs.invoices.flatMap((i) => [i.updatedAt ?? "", ...(i.agentLog ?? []).map((a) => a.at)])]
    .map((x) => Date.parse(x))
    .filter((x) => Number.isFinite(x));
  const last = Math.max(...times);
  if (t - last < AUTO_RESET_IDLE_MIN * 60_000) return null;
  return "no late invoice from abroad is left, and the demo book has been quiet";
}
