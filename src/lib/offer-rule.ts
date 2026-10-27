// The app's rule for early-payment offers (code enforces it in src/lib/agent.ts; the seller decides): an offer must
// bring the money in at least OFFER_MIN_DAYS_SOONER days sooner, and its cost as a yearly rate — the standard
// trade-credit formula, percent / (100 − percent) × 365 / days sooner — must be at most OFFER_MAX_ANNUAL_PCT. A discount
// is a price for getting paid sooner, not an exchange-rate hedge: it is a certain cost, while a rate move can go either
// way. No imports: safe to use in client components.

export const OFFER_MIN_DAYS_SOONER = 21;
export const OFFER_MAX_ANNUAL_PCT = 12;

// The discount's cost as a yearly rate, rounded to 0.1%.
export function annualCostPct(percent: number, daysSooner: number): number {
  return daysSooner > 0 ? Math.round((percent / (100 - percent)) * (365 / daysSooner) * 1000) / 10 : Infinity;
}
