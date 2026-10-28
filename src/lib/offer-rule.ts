// The app's rule for early-payment offers (code enforces it in src/lib/agent.ts; the seller decides): an offer must
// bring the money in at least OFFER_MIN_DAYS_SOONER days sooner, and its cost as a yearly rate — the standard
// trade-credit formula, percent / (100 − percent) × 365 / days sooner — must be at most OFFER_MAX_ANNUAL_PCT. A discount
// is a price for getting paid sooner, not an exchange-rate hedge: it is a certain cost, while a rate move can go either
// way. No imports: safe to use in client components.

export const OFFER_MIN_DAYS_SOONER = 21;
export const OFFER_MAX_ANNUAL_PCT = 12;

// The discount percents the agent may propose, and a seller may pick when editing an offer.
export const DISCOUNT_PCTS = [1, 1.5, 2] as const;

// The percents within the rule for an offer that brings the money in `daysSooner` days sooner.
export function percentsWithinRule(daysSooner: number): number[] {
  return daysSooner >= OFFER_MIN_DAYS_SOONER ? DISCOUNT_PCTS.filter((p) => annualCostPct(p, daysSooner) <= OFFER_MAX_ANNUAL_PCT) : [];
}

// The note on the offer invoice in code's own words — used when the seller changes the percent, so the agent's
// sentence (which named the old percent) is not sent with new terms.
export function offerNoteTemplate(newDueDate: string, percent: number) {
  return `Early-payment offer: pay by ${newDueDate} and take ${percent}% off. Thank you for your business!`;
}

// The discount's cost as a yearly rate, rounded to 0.1%.
export function annualCostPct(percent: number, daysSooner: number): number {
  return daysSooner > 0 ? Math.round((percent / (100 - percent)) * (365 / daysSooner) * 1000) / 10 : Infinity;
}
