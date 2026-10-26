// Puts the sandbox back to the start of the demo story: a fresh demo book dated today, autopilot off (the seller's
// notes are kept). Runs from the "Reset demo" button (access code) and nightly before the plans are warmed.

import { loadPolicy } from "./book";
import { PayPalClient } from "./paypal";
import { policyMemo, POLICY_TEMPLATE } from "./policy";
import { resetDemoBook, SEED_RECIPIENT } from "./seed";

export async function resetDemo(now = new Date()) {
  const pp = new PayPalClient();
  const lines: string[] = [];
  const r = await resetDemoBook(pp, { today: now.toISOString().slice(0, 10), recipient: SEED_RECIPIENT, log: (l) => lines.push(l) });
  const policy = await loadPolicy(pp);
  if (policy.enabled) await pp.saveTemplate(POLICY_TEMPLATE, policy.base === "KRW" ? "USD" : policy.base, policyMemo({ ...policy, enabled: false }), policy.notes);
  const failed = lines.filter((l) => l.startsWith("FAIL"));
  return { ...r, failed };
}
