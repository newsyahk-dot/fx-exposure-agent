"use server";

// "Try it with your own invoices": the pasted list is analysed and discarded — nothing is stored or logged.
// The rule-based plan is free and open to everyone; Claude's plan needs the access code (it calls the model).

import { writesAllowed } from "@/lib/access";
import { runAgent } from "@/lib/agent";
import { quotesFor } from "@/lib/ecb-cache";
import { moneyTimeline } from "@/lib/money-timeline";
import { analyzeOwn, type OwnAnalysis } from "@/lib/own-analysis";
import { OWN_MAX_CHARS } from "@/lib/own-invoices";
import { pickBase } from "@/lib/view";

export type OwnState = { ok: true; analysis: OwnAnalysis; note?: string } | { ok: false; message: string } | null;

export async function analyzeOwnAction(_: OwnState, form: FormData): Promise<OwnState> {
  const text = String(form.get("text") ?? "");
  if (!text.trim()) return { ok: false, message: "Paste your invoice list first, or load the sample." };
  if (text.length > OWN_MAX_CHARS) return { ok: false, message: `That is more than ${OWN_MAX_CHARS.toLocaleString("en-US")} characters; paste fewer invoices.` };
  const base = pickBase(String(form.get("base") ?? ""));
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { analysis, agentInput } = analyzeOwn(text, base, await quotesFor(today), today);
    let note: string | undefined;
    if (form.get("agent") === "1" && agentInput.candidates.length) {
      if (!(await writesAllowed())) note = "Claude's plan needs the access code; this is the rule-based plan.";
      else {
        const run = await runAgent({ ...agentInput, readPayPal: false });
        analysis.run = run;
        analysis.timeline = moneyTimeline(agentInput, run);
        if (run.source !== "agent") note = `Claude did not run (${run.reason}); this is the rule-based plan.`;
      }
    }
    return { ok: true, analysis, note };
  } catch (e) {
    return { ok: false, message: `Could not analyse the list: ${e instanceof Error ? e.message : String(e)}` };
  }
}
