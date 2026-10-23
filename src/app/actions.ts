"use server";

// Runs an agent proposal in the PayPal sandbox after the seller clicks Approve.
//
// The form carries which proposal (kind + invoice id + home currency), the terms (discount percent and
// window) and the client-facing text — which the seller may have edited. None of it is trusted: the
// server reloads the live book, re-derives eligibility and every number, keeps the terms inside the
// allowed bounds and runs the same text checks the agent had to pass. Only then is PayPal called.

import { refresh } from "next/cache";
import { DISCOUNT_PCTS, priceDiscount, WINDOW_DAYS } from "@/lib/agent";
import { demoMode, loadLiveInputs } from "@/lib/book";
import { checkClientText } from "@/lib/checks";
import { PayPalClient, PayPalError } from "@/lib/paypal";
import { pickBase, viewFor } from "@/lib/view";

export type ApproveState = { ok: boolean; message: string } | null;

const INVOICE_ID = /^INV2-[A-Z0-9-]{10,40}$/;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function approve(_prev: ApproveState, form: FormData): Promise<ApproveState> {
  const kind = str(form, "kind");
  const invoiceId = str(form, "invoiceId");
  if (!["reminder", "early_pay_discount"].includes(kind) || !INVOICE_ID.test(invoiceId)) return { ok: false, message: "Unknown action." };
  if (demoMode()) return { ok: false, message: "This is a read-only demo snapshot. Actions run on the live sandbox only." };

  const now = new Date();
  const inputs = await loadLiveInputs();
  const view = viewFor(inputs, pickBase(str(form, "base")), now);
  const cand = view.agentInput.candidates.find((c) => c.invoiceId === invoiceId);
  if (!cand?.eligible.includes(kind as "reminder" | "early_pay_discount"))
    return { ok: false, message: "This invoice is no longer eligible for that action (it has changed). Reload the page." };

  const pp = new PayPalClient();
  try {
    if (kind === "reminder") {
      const subject = str(form, "subject");
      const message = str(form, "message");
      const why =
        checkClientText(subject, cand.facts, { maxLen: 120, allowOffer: false }) ??
        checkClientText(message, cand.facts, { maxLen: 900, allowOffer: false });
      if (why) return { ok: false, message: `Not sent — the e-mail failed a check: ${why}.` };
      await pp.sendReminder(invoiceId, { subject, note: message });
      try {
        await pp.logAgentAction(invoiceId, "reminder", now);
      } catch (e) {
        refresh();
        return { ok: true, message: `Reminder sent, but it could not be recorded on the invoice (${errorText(e)}).` };
      }
      refresh();
      return { ok: true, message: `Reminder sent for ${cand.invoiceNumber}.` };
    }

    const percent = Number(str(form, "percent"));
    const within = Number(str(form, "withinDays"));
    if (!(DISCOUNT_PCTS as readonly number[]).includes(percent) || !Number.isInteger(within) || within < WINDOW_DAYS.min || within > WINDOW_DAYS.max)
      return { ok: false, message: "Those discount terms are outside the allowed range." };
    const p = priceDiscount(cand, view.base, inputs.asOf, percent, within);
    const note = str(form, "clientNote");
    const why = checkClientText(note, `${cand.facts} ${p.facts}`, { maxLen: 300, allowOffer: true, unconditional: true });
    if (why) return { ok: false, message: `Not applied — the client note failed a check: ${why}.` };
    await pp.offerEarlyPaymentByUpdate(invoiceId, percent, p.newDueDate, note, now);
    refresh();
    return { ok: true, message: `${percent}% discount applied to ${cand.invoiceNumber}; now due ${p.newDueDate}. The client has been e-mailed.` };
  } catch (e) {
    return { ok: false, message: `PayPal refused: ${errorText(e)}` };
  }
}

function errorText(e: unknown): string {
  return e instanceof PayPalError ? e.message : e instanceof Error ? e.message : String(e);
}
