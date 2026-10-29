// Everything the screen shows, derived from the raw inputs for one home currency. Pure: the page,
// the approve action and the snapshot script all compute the same numbers the same way.

import { buildAgentInput, type AgentInput } from "./agent";
import type { BookInputs } from "./book";
import { computeExposure, type Exposure } from "./exposure";
import { BASES, isBase, ratesFor, volsFor, type Base } from "./fx";
import { addDays } from "./seed-data";
import { timingEffect, type TimingEffect } from "./timing";
import type { Rates } from "./types";

export const SHOCK_PCT = 3;
export const VOL_LOOKBACK_DAYS = 120;
export const TIMING_DAYS = 90;
export const DEFAULT_BASE: Base = isBase(process.env.FXA_DEFAULT_BASE) ? process.env.FXA_DEFAULT_BASE : "USD";

export const pickBase = (s: string | string[] | undefined): Base => {
  const v = Array.isArray(s) ? s[0] : s;
  const u = v?.toUpperCase();
  return isBase(u) ? u : DEFAULT_BASE;
};

export type BookView = {
  base: Base;
  rates: Rates;
  vols: Record<string, number | null>;
  exposure: Exposure;
  timing: TimingEffect;
  agentInput: AgentInput;
};

export function viewFor(inputs: BookInputs, base: Base, now: Date): BookView {
  const ccys = [...new Set([...BASES, ...inputs.invoices.map((i) => i.currency)])];
  const rates = ratesFor(inputs.ecb, base, ccys);
  const vols = volsFor(inputs.ecb, base, ccys, addDays(inputs.asOf, -VOL_LOOKBACK_DAYS), inputs.asOf);
  const exposure = computeExposure(inputs.invoices, rates, inputs.asOf, { base, shockPct: SHOCK_PCT });
  const timing = timingEffect(inputs.invoices, inputs.ecb, base, inputs.asOf, TIMING_DAYS);
  // The hosted demo book is Maya's; a real seller can set their own name.
  const seller = process.env.FXA_SELLER_NAME || (inputs.startedAt || inputs.source === "demo" ? "Maya" : undefined);
  const built = buildAgentInput(inputs.invoices, rates, vols, exposure, base, inputs.asOf, now, seller);
  const agentInput = inputs.policy?.notes ? { ...built, notes: inputs.policy.notes } : built;
  return { base, rates, vols, exposure, timing, agentInput };
}
