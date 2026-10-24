// The seller's standing policy for the autopilot, and their standing notes for the agent.
//
// Approving the policy is the seller's explicit click for everything inside it: the autopilot only runs
// actions the agent proposed, that pass every check, and that fit these bounds. Anything outside them stays
// a proposal waiting for a click. The policy lives in a PayPal invoice template (memo = JSON, note = the
// seller's notes), so it survives redeploys and is visible in the seller's own PayPal account.

import { DISCOUNT_PCTS, type AgentProposal } from "./agent";
import { isBase } from "./fx";

export const POLICY_TEMPLATE = "FX Exposure Agent — autopilot policy";
export const NOTES_MAX = 600;
export const ACTIONS_PER_RUN = { min: 1, max: 5 } as const;

export type Policy = {
  enabled: boolean;
  base: string; // the home currency the agent plans in
  reminders: boolean; // send reminders on overdue invoices
  discounts: boolean; // apply early-payment discounts
  maxDiscountPct: number; // one of DISCOUNT_PCTS
  maxActionsPerRun: number;
  approvedAt: string | null; // when the seller last approved this policy
  notes: string; // standing notes for the agent (preferences, tone); also used by the manual plan
};

export const DEFAULT_POLICY: Policy = {
  enabled: false,
  base: "USD",
  reminders: true,
  discounts: false,
  maxDiscountPct: 1,
  maxActionsPerRun: 3,
  approvedAt: null,
  notes: "",
};

const clampInt = (n: unknown, lo: number, hi: number, dflt: number) => {
  const x = Math.round(Number(n));
  return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : dflt;
};

// Anything malformed falls back to the default, and the default is off.
export function normalizePolicy(raw: Partial<Policy> | null | undefined): Policy {
  const r = raw ?? {};
  return {
    enabled: r.enabled === true,
    base: isBase(r.base) ? r.base : DEFAULT_POLICY.base,
    reminders: r.reminders !== false,
    discounts: r.discounts === true,
    maxDiscountPct: (DISCOUNT_PCTS as readonly number[]).includes(Number(r.maxDiscountPct)) ? Number(r.maxDiscountPct) : DEFAULT_POLICY.maxDiscountPct,
    maxActionsPerRun: clampInt(r.maxActionsPerRun, ACTIONS_PER_RUN.min, ACTIONS_PER_RUN.max, DEFAULT_POLICY.maxActionsPerRun),
    approvedAt: typeof r.approvedAt === "string" && !Number.isNaN(Date.parse(r.approvedAt)) ? r.approvedAt : null,
    notes: typeof r.notes === "string" ? cleanNotes(r.notes) : "",
  };
}

export const cleanNotes = (s: string) => s.replace(/<\/?seller_notes>/gi, "").trim().slice(0, NOTES_MAX);

// Template memo holds everything but the notes (PayPal caps the memo at 500 characters).
export function policyMemo(p: Policy): string {
  const { notes: _n, ...rest } = p;
  void _n;
  return JSON.stringify({ v: 1, ...rest });
}

export function parsePolicy(memo: string | undefined, note: string | undefined): Policy {
  try {
    return normalizePolicy({ ...(JSON.parse(memo ?? "") as Partial<Policy>), notes: note ?? "" });
  } catch {
    return normalizePolicy({ notes: note ?? "" });
  }
}

// Does the policy cover this proposal? null = yes, otherwise why not.
export function outsidePolicy(p: AgentProposal, policy: Policy): string | null {
  if (!policy.enabled) return "autopilot is off";
  if (p.kind === "reminder") return policy.reminders ? null : "the policy does not cover reminders";
  if (!policy.discounts) return "the policy does not cover discounts";
  if (p.percent > policy.maxDiscountPct) return `${p.percent}% is above the policy's ${policy.maxDiscountPct}% limit`;
  return null;
}
