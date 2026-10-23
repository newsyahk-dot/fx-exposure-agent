// What the agent has done to an invoice, kept in the invoice's own private memo.
//
// PayPal does not let us read back when a reminder was sent, and a serverless host has no disk, so the
// agent writes one line per action into `detail.memo` (merchant-only; the buyer never sees it):
//   fxa-agent: reminder 2026-10-23T06:44:02.325Z
//   fxa-agent: early_pay_discount 2026-10-23T07:01:10.000Z
//   fxa-agent: reminder 2026-10-24T00:17:03.000Z auto
// Lines that are not ours are kept as they are.

// "created" marks an invoice the new-invoice assistant created after the seller approved.
// "archived" is written by the demo reset on retired seed invoices; the app leaves those out entirely.
export type AgentActionKind = "reminder" | "early_pay_discount" | "created" | "archived";
export type AgentLogEntry = { kind: AgentActionKind; at: string; auto?: true };

const PREFIX = "fxa-agent:";
const LINE = /^fxa-agent:\s+(reminder|early_pay_discount|created|archived)\s+(\S+)(\s+auto)?\s*$/;

export function parseAgentLog(memo: string | undefined): AgentLogEntry[] {
  if (!memo) return [];
  const out: AgentLogEntry[] = [];
  for (const line of memo.split(/\r?\n/)) {
    const m = LINE.exec(line.trim());
    if (m && !Number.isNaN(Date.parse(m[2]))) out.push({ kind: m[1] as AgentActionKind, at: m[2], ...(m[3] ? { auto: true as const } : {}) });
  }
  return out;
}

// `auto` marks an action the autopilot ran under the seller's standing policy (no click for this one).
export function appendAgentLog(memo: string | undefined, kind: AgentActionKind, at: Date, auto = false): string {
  const line = `${PREFIX} ${kind} ${at.toISOString()}${auto ? " auto" : ""}`;
  return memo && memo.trim() ? `${memo.trimEnd()}\n${line}` : line;
}

export function lastOf(log: AgentLogEntry[] | undefined, kind: AgentActionKind): string | null {
  const at = (log ?? []).filter((e) => e.kind === kind).map((e) => e.at).sort();
  return at.length ? at[at.length - 1] : null;
}
