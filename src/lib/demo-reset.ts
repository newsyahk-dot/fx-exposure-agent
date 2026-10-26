// Puts the sandbox back to the start of the demo story: a fresh demo book dated today, the default policy with the
// autopilot off (the seller's notes are kept). Runs from the "Reset demo" button (access code) and nightly before the plans are warmed.

import { loadPolicy } from "./book";
import { PayPalClient } from "./paypal";
import { DEFAULT_POLICY, policyMemo, POLICY_TEMPLATE } from "./policy";
import { resetDemoBook, SEED_RECIPIENT } from "./seed";

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
