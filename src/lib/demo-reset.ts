// Puts the sandbox back to the start of the demo story: a fresh demo book dated today, the default policy with the
// autopilot off (the seller's notes are kept). Runs from the "Reset demo" button (access code) and nightly before the plans are warmed.

import { bookStartedAt, loadPolicy } from "./book";
import { PayPalClient } from "./paypal";
import { DEFAULT_POLICY, policyMemo, POLICY_TEMPLATE } from "./policy";
import { resetDemoBook, SEED_RECIPIENT } from "./seed";

// The hosted demo book is shared by every visitor (judges included). A reset replaces it for everyone, so the
// button waits this long after the last one; the nightly reset is not limited.
export const RESET_COOLDOWN_MIN = 5;

export function resetWait(startedAt: string | undefined, now = new Date()): number {
  if (!startedAt) return 0;
  const left = RESET_COOLDOWN_MIN * 60_000 - (now.getTime() - Date.parse(startedAt));
  return left > 0 ? Math.ceil(left / 60_000) : 0;
}

export async function lastResetAt(): Promise<string | undefined> {
  return bookStartedAt(await new PayPalClient().listInvoices());
}

export async function resetDemo(now = new Date()) {
  const pp = new PayPalClient();
  const lines: string[] = [];
  const r = await resetDemoBook(pp, { today: now.toISOString().slice(0, 10), recipient: SEED_RECIPIENT, log: (l) => lines.push(l) });
  const policy = await loadPolicy(pp);
  // Back to the default policy (off, default bounds); the seller's notes are kept.
  const fresh = { ...DEFAULT_POLICY, notes: policy.notes };
  if (policyMemo(fresh) !== policyMemo(policy)) await pp.saveTemplate(POLICY_TEMPLATE, "USD", policyMemo(fresh), fresh.notes);
  const failed = lines.filter((l) => l.startsWith("FAIL"));
  return { ...r, failed };
}
