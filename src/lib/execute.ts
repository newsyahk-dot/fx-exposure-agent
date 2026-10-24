// Runs one agent action in PayPal. The single path for both a seller's Approve click and the autopilot:
// the caller has already re-derived the candidate from a fresh book; this re-checks the terms and the
// client-facing text, then calls PayPal and logs the action in the invoice's private memo.

import { DISCOUNT_PCTS, priceDiscount, WINDOW_DAYS, type Candidate } from "./agent";
import { checkClientText } from "./checks";
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
    const why = checkClientText(req.clientNote, `${cand.facts} ${p.facts}`, { maxLen: 300, allowOffer: true, unconditional: true });
    if (why) return { ok: false, message: `Not applied — the client note failed a check: ${why}.` };
    await pp.offerEarlyPaymentByUpdate(cand.invoiceId, percent, p.newDueDate, req.clientNote, o.now, o.auto);
    return { ok: true, message: `${percent}% discount applied to ${cand.invoiceNumber}; now due ${p.newDueDate}. The client has been e-mailed.` };
  } catch (e) {
    return { ok: false, message: `PayPal refused: ${errorText(e)}` };
  }
}
