"use server";

// Runs an agent proposal in the PayPal sandbox after the seller clicks Approve.
//
// The form carries which proposal (kind + invoice id + home currency), the terms (discount percent and
// window) and the client-facing text — which the seller may have edited. None of it is trusted: the
// server reloads the live book, re-derives eligibility and every number, keeps the terms inside the
// allowed bounds and runs the same text checks the agent had to pass. Only then is PayPal called.

import { refresh, updateTag } from "next/cache";
import { BOOK_TAG } from "@/lib/book-cache";
import { PLAN_TAG } from "@/lib/agent-cache";
import { resetDemo } from "@/lib/demo-reset";
import { LOCKED_MESSAGE, writesAllowed } from "@/lib/access";
import { demoMode, loadLiveInputs } from "@/lib/book";
import { errorText, executeAction, type ActionRequest } from "@/lib/execute";
import { PayPalClient } from "@/lib/paypal";
import { pickBase, viewFor } from "@/lib/view";

export type ApproveState = { ok: boolean; message: string } | null;

const INVOICE_ID = /^INV2-[A-Z0-9-]{10,40}$/;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function approve(_prev: ApproveState, form: FormData): Promise<ApproveState> {
  const kind = str(form, "kind");
  const invoiceId = str(form, "invoiceId");
  if (!["reminder", "early_pay_discount"].includes(kind) || !INVOICE_ID.test(invoiceId)) return { ok: false, message: "Unknown action." };
  if (demoMode()) return { ok: false, message: "This is a read-only demo snapshot. Actions run on the live sandbox only." };
  if (!(await writesAllowed())) return { ok: false, message: LOCKED_MESSAGE };

  const now = new Date();
  const inputs = await loadLiveInputs();
  const view = viewFor(inputs, pickBase(str(form, "base")), now);
  const cand = view.agentInput.candidates.find((c) => c.invoiceId === invoiceId);
  if (!cand) return { ok: false, message: "This invoice is no longer open. Reload the page." };

  const req: ActionRequest =
    kind === "reminder"
      ? { kind, subject: str(form, "subject"), message: str(form, "message") }
      : { kind: "early_pay_discount", percent: Number(str(form, "percent")), withinDays: Number(str(form, "withinDays")), clientNote: str(form, "clientNote") };
  const r = await executeAction(new PayPalClient(), cand, req, { base: view.base, asOf: inputs.asOf, now });
  if (r.ok) {
    updateTag(BOOK_TAG);
    refresh();
  }
  return r;
}

// Sandbox demo control: records the client paying the whole open amount today, through PayPal. Lets a
// judge close the loop (reminder -> payment -> exposure gone) without a client account. It is labelled as
// a simulation on screen and in the payment note; a real client payment shows up the same way.
export async function simulateClientPayment(_prev: ApproveState, form: FormData): Promise<ApproveState> {
  const invoiceId = str(form, "invoiceId");
  if (!INVOICE_ID.test(invoiceId)) return { ok: false, message: "Unknown invoice." };
  if (demoMode()) return { ok: false, message: "This is a read-only demo snapshot." };
  if (!(await writesAllowed())) return { ok: false, message: LOCKED_MESSAGE };
  const pp = new PayPalClient();
  try {
    const inv = await pp.getInvoice(invoiceId);
    if (!["SENT", "UNPAID", "PARTIALLY_PAID", "SCHEDULED"].includes(inv.status) || !inv.due_amount || !(Number(inv.due_amount.value) > 0))
      return { ok: false, message: "This invoice has nothing left to pay." };
    await pp.recordPayment(invoiceId, {
      method: "PAYPAL",
      payment_date: new Date().toISOString().slice(0, 10),
      amount: inv.due_amount,
      note: "Simulated client payment (sandbox demo)",
    });
    updateTag(BOOK_TAG);
    refresh();
    return { ok: true, message: `Paid: ${inv.due_amount.currency_code} ${inv.due_amount.value} for ${inv.detail.invoice_number}.` };
  } catch (e) {
    return { ok: false, message: `PayPal refused: ${errorText(e)}` };
  }
}

// Drops the day's plan so the next view asks the agent again with the current invoices (~20–30 s, one model run
// per home currency viewed). Needs the access code like every other action that spends model calls.
export async function replan(): Promise<ApproveState> {
  if (demoMode()) return { ok: false, message: "This is a read-only demo snapshot." };
  if (!(await writesAllowed())) return { ok: false, message: LOCKED_MESSAGE };
  updateTag(PLAN_TAG);
  refresh();
  return { ok: true, message: "Re-planning." };
}

// Starts the demo story over (~20-40 s): closes the open demo invoices, seeds a fresh book dated today, turns the
// autopilot off, and drops the cached book and plans.
export async function resetDemoAction(): Promise<ApproveState> {
  if (demoMode()) return { ok: false, message: "This is a read-only demo snapshot." };
  if (!(await writesAllowed())) return { ok: false, message: LOCKED_MESSAGE };
  try {
    const r = await resetDemo();
    updateTag(BOOK_TAG);
    updateTag(PLAN_TAG);
    refresh();
    return r.failed.length
      ? { ok: false, message: `Reset partly failed (${r.failed.length} steps): ${r.failed[0]}` }
      : { ok: true, message: `Demo book reset: ${r.created} fresh invoices. The agent is re-planning (about 30 s).` };
  } catch (e) {
    return { ok: false, message: `Reset failed: ${errorText(e)}` };
  }
}
