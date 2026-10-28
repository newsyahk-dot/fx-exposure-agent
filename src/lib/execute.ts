// Runs one agent action in PayPal. The single path for both a seller's Approve click and the autopilot:
// the caller has already re-derived the candidate from a fresh book; this re-checks the terms and the
// client-facing text, then calls PayPal and logs the action in the invoice's private memo.

import { DISCOUNT_PCTS, priceDiscount, WINDOW_DAYS, type Candidate } from "./agent";
import { checkClientText } from "./checks";
import { money } from "./format";
import { offerAmount } from "./offer-invoice";
import { PayPalClient, PayPalError } from "./paypal";

export type ActionRequest =
  | { kind: "reminder"; subject: string; message: string }
  | { kind: "early_pay_discount"; percent: number; withinDays: number; clientNote: string };

export type ActionResult = { ok: boolean; message: string };

export const errorText = (e: unknown) => (e instanceof PayPalError ? e.message : e instanceof Error ? e.message : String(e));

export async function executeAction(
  pp: PayPalClient,
  cand: Candidate,
  req: ActionRequest,
  o: { base: string; asOf: string; now: Date; auto?: boolean },
): Promise<ActionResult> {
  if (!cand.eligible.includes(req.kind))
    return { ok: false, message: "This invoice is no longer eligible for that action (it has changed). Reload the page." };
  try {
    if (req.kind === "reminder") {
      const why =
        checkClientText(req.subject, cand.facts, { maxLen: 120, allowOffer: false }) ??
        checkClientText(req.message, cand.facts, { maxLen: 900, allowOffer: false });
      if (why) return { ok: false, message: `Not sent — the e-mail failed a check: ${why}.` };
      await pp.sendReminder(cand.invoiceId, { subject: req.subject, note: req.message });
      try {
        await pp.logAgentAction(cand.invoiceId, "reminder", o.now, o.auto);
      } catch (e) {
        return { ok: true, message: `Reminder sent for ${cand.invoiceNumber}, but it could not be recorded on the invoice (${errorText(e)}).` };
      }
      return { ok: true, message: `Reminder sent for ${cand.invoiceNumber}.` };
    }

    const { percent, withinDays } = req;
    if (!(DISCOUNT_PCTS as readonly number[]).includes(percent) || !Number.isInteger(withinDays) || withinDays < WINDOW_DAYS.min || withinDays > WINDOW_DAYS.max)
      return { ok: false, message: "Those discount terms are outside the allowed range." };
    const p = priceDiscount(cand, o.base, o.asOf, percent, withinDays);
    const why = checkClientText(req.clientNote, `${cand.facts} ${p.facts}`, { maxLen: 300, allowOffer: true });
    if (why) return { ok: false, message: `Not sent — the client note failed a check: ${why}.` };
    // A separate offer invoice; the seller's invoice stays as it is (src/lib/offer-invoice.ts).
    const amount = offerAmount(cand.amount, percent, cand.currency);
    const offer = await pp.sendEarlyPaymentOffer(cand.invoiceId, {
      percent,
      amount,
      dueDate: p.newDueDate,
      note: offerNote(req.clientNote, cand, amount, p.newDueDate),
      at: o.now,
      auto: o.auto,
    });
    return {
      ok: true,
      message: `Offer sent to the client: ${money(cand.currency, amount)} if paid by ${p.newDueDate} (invoice ${offer.detail?.invoice_number ?? "sent"}). ${cand.invoiceNumber} stays as it is.`,
    };
  } catch (e) {
    return { ok: false, message: `PayPal refused: ${errorText(e)}` };
  }
}

// The client-facing note on the offer invoice: the agent's checked sentence, then the terms in code's own words.
export function offerNote(clientNote: string, cand: Candidate, amount: number, dueDate: string): string {
  return [
    clientNote.trim(),
    `Optional early-payment offer for invoice ${cand.invoiceNumber} (${money(cand.currency, cand.amount)}, due ${cand.dueDate}). ` +
      `Pay this invoice (${money(cand.currency, amount)}) by ${dueDate} and invoice ${cand.invoiceNumber} is settled in full. ` +
      `After ${dueDate} this offer lapses; please pay invoice ${cand.invoiceNumber} as usual.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
