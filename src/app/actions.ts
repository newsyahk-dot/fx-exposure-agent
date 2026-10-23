"use server";

// Runs an agent action in the PayPal sandbox after the user clicks Approve.
//
// The client only says *which* proposal it approves (kind + invoice id). Everything else — amount,
// discount, new due date, whether the action is still on offer — is re-derived on the server from the
// live PayPal book, so a forged request can only trigger a proposal the page would have shown anyway.

import { refresh } from "next/cache";
import { demoMode, loadLiveInputs } from "@/lib/book";
import { money } from "@/lib/format";
import { PayPalClient, PayPalError } from "@/lib/paypal";
import { buildProposals } from "@/lib/proposals";
import { addDays } from "@/lib/seed-data";

export type ApproveState = { ok: boolean; message: string } | null;

const KINDS = new Set(["reminder", "early_pay_discount"]);
const INVOICE_ID = /^INV2-[A-Z0-9-]{10,40}$/;

export async function approve(_prev: ApproveState, form: FormData): Promise<ApproveState> {
  const kind = String(form.get("kind") ?? "");
  const invoiceId = String(form.get("invoiceId") ?? "");
  if (!KINDS.has(kind) || !INVOICE_ID.test(invoiceId)) return { ok: false, message: "Unknown action." };
  if (demoMode()) return { ok: false, message: "This is a read-only demo snapshot. Actions run on the live sandbox only." };

  const now = new Date();
  const inputs = await loadLiveInputs();
  const p = buildProposals(inputs.invoices, inputs.rates, inputs.asOf, { dailyVols: inputs.dailyVols, now }).find(
    (x) => x.kind === kind && x.invoiceId === invoiceId,
  );
  if (!p) return { ok: false, message: "This action is no longer proposed — the invoice has changed. Reload the page." };
  if (!p.canAct) return { ok: false, message: "A reminder was sent recently. Wait a few days before sending another." };

  const pp = new PayPalClient();
  try {
    if (p.kind === "reminder") {
      const due = inputs.invoices.find((i) => i.id === p.invoiceId)?.dueDate ?? "";
      await pp.sendReminder(p.invoiceId, {
        subject: `Reminder: invoice ${p.invoiceNumber} is past due`,
        note: `Invoice ${p.invoiceNumber} for ${money(p.currency, p.amount)} was due on ${due} (${p.daysOverdue} days ago). You can pay it directly from this email. Thank you!`,
      });
      try {
        await pp.logAgentAction(p.invoiceId, "reminder", now);
      } catch (e) {
        refresh();
        return { ok: true, message: `Reminder sent, but it could not be recorded on the invoice (${errorText(e)}).` };
      }
      refresh();
      return { ok: true, message: `Reminder sent for ${p.invoiceNumber}.` };
    }

    const newDue = addDays(inputs.asOf, p.discountWithinDays);
    await pp.offerEarlyPaymentByUpdate(
      p.invoiceId,
      p.discountPct,
      newDue,
      `Early-payment offer: ${p.discountPct}% off has been applied to this invoice. The new due date is ${newDue}. Thank you for your business!`,
      now,
    );
    refresh();
    return { ok: true, message: `${p.discountPct}% discount applied to ${p.invoiceNumber}; now due ${newDue}. The client has been e-mailed.` };
  } catch (e) {
    return { ok: false, message: `PayPal refused: ${errorText(e)}` };
  }
}

function errorText(e: unknown): string {
  return e instanceof PayPalError ? e.message : e instanceof Error ? e.message : String(e);
}
