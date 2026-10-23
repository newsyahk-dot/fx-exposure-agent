"use server";

// Saving the standing policy is the seller's explicit approval for everything inside it. "Run now" runs
// the same autopilot the daily schedule runs.

import { refresh } from "next/cache";
import { runAutopilot, type AutopilotResult } from "@/lib/autopilot";
import { demoMode, loadPolicy } from "@/lib/book";
import { errorText } from "@/lib/execute";
import { PayPalClient } from "@/lib/paypal";
import { cleanNotes, normalizePolicy, policyMemo, POLICY_TEMPLATE } from "@/lib/policy";

export type PolicyState = { ok: boolean; message: string } | null;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function savePolicy(_prev: PolicyState, form: FormData): Promise<PolicyState> {
  if (demoMode()) return { ok: false, message: "This is a read-only demo snapshot." };
  const intent = str(form, "intent");
  if (!["approve", "off", "notes"].includes(intent)) return { ok: false, message: "Unknown request." };
  const pp = new PayPalClient();
  // Only "approve" can set the bounds. Turning off or editing notes keeps the stored bounds as they are.
  const current = await loadPolicy(pp);
  const p =
    intent === "approve"
      ? normalizePolicy({
          enabled: true,
          base: str(form, "base"),
          reminders: form.get("reminders") === "on",
          discounts: form.get("discounts") === "on",
          maxDiscountPct: Number(str(form, "maxDiscountPct")),
          maxActionsPerRun: Number(str(form, "maxActionsPerRun")),
          approvedAt: new Date().toISOString(),
          notes: cleanNotes(str(form, "notes")),
        })
      : intent === "off"
        ? { ...current, enabled: false }
        : { ...current, notes: cleanNotes(str(form, "notes")) };
  try {
    await pp.saveTemplate(POLICY_TEMPLATE, p.base === "KRW" ? "USD" : p.base, policyMemo(p), p.notes);
  } catch (e) {
    return { ok: false, message: `Not saved — PayPal refused: ${errorText(e)}` };
  }
  refresh();
  return {
    ok: true,
    message:
      intent === "approve"
        ? "Policy approved. The autopilot will act inside it on weekday mornings and when you press Run now."
        : intent === "off"
          ? "Autopilot turned off. Proposals wait for your click again."
          : "Notes saved. The agent reads them on its next plan.",
  };
}

export type RunState = AutopilotResult | { ran: false; reason: string; at: string; executed: []; left: [] } | null;

export async function runAutopilotNow(): Promise<RunState> {
  if (demoMode()) return { ran: false, reason: "read-only demo snapshot", at: new Date().toISOString(), executed: [], left: [] };
  try {
    const r = await runAutopilot();
    if (r.executed.some((x) => x.ok)) refresh();
    return r;
  } catch (e) {
    return { ran: false, reason: errorText(e), at: new Date().toISOString(), executed: [], left: [] };
  }
}
