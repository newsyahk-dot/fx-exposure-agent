// Demo book for the PayPal sandbox seller account: 18 invoices in USD, EUR and JPY.
//
// Dates are offsets in days from the seeding day, so the shape of the book (what is overdue, what falls
// in which week) is the same whenever it is re-seeded. `scripts/seed-sandbox.ts` turns this into
// real sandbox invoices.

export type SeedOutcome =
  | { kind: "open" } // sent, nothing paid
  | { kind: "paid"; paidOffset: number } // recorded as paid on that day
  | { kind: "partial"; paid: number; paidOffset: number }; // part recorded as paid

export type SeedInvoice = {
  number: string;
  currency: "USD" | "EUR" | "JPY";
  amount: number;
  item: string;
  client: string; // fictional business name shown on the invoice
  issueOffset: number; // invoice date = seed day + issueOffset (negative = in the past)
  dueOffset: number; // due date = seed day + dueOffset
  outcome: SeedOutcome;
  why: string; // what this invoice is in the demo for
};

export const SEED_PREFIX = "FXA-";

export const SEED_INVOICES: SeedInvoice[] = [
  // USD — US clients
  { number: "FXA-1001", currency: "USD", amount: 4200, item: "Website redesign — milestone 2", client: "Brightline Media", issueOffset: -43, dueOffset: -13, outcome: { kind: "open" }, why: "large overdue -> reminder" },
  { number: "FXA-1002", currency: "USD", amount: 1850, item: "Monthly retainer (Oct)", client: "Brightline Media", issueOffset: -28, dueOffset: 2, outcome: { kind: "open" }, why: "due this week" },
  { number: "FXA-1003", currency: "USD", amount: 2600, item: "Landing page A/B variants", client: "Harbor & Pine", issueOffset: -8, dueOffset: 22, outcome: { kind: "open" }, why: "week 4 -> early-pay candidate" },
  { number: "FXA-1004", currency: "USD", amount: 6500, item: "E-commerce build — phase 1", client: "Northwind Outfitters", issueOffset: -3, dueOffset: 42, outcome: { kind: "open" }, why: "largest, far out -> early-pay candidate" },
  { number: "FXA-1005", currency: "USD", amount: 900, item: "Logo refresh", client: "Harbor & Pine", issueOffset: -64, dueOffset: -34, outcome: { kind: "paid", paidOffset: -36 }, why: "paid on time" },
  { number: "FXA-1006", currency: "USD", amount: 3000, item: "Mobile app UI kit", client: "Copperleaf Apps", issueOffset: -52, dueOffset: -22, outcome: { kind: "partial", paid: 1200, paidOffset: -25 }, why: "partly paid, rest overdue" },
  { number: "FXA-1007", currency: "USD", amount: 350, item: "Icon set", client: "Copperleaf Apps", issueOffset: -22, dueOffset: 8, outcome: { kind: "open" }, why: "small -> below the action threshold" },
  // EUR — EU clients
  { number: "FXA-2001", currency: "EUR", amount: 1800, item: "Brand guidelines", client: "Atelier Moreau", issueOffset: -48, dueOffset: -18, outcome: { kind: "open" }, why: "overdue -> reminder" },
  { number: "FXA-2002", currency: "EUR", amount: 2400, item: "Shopify theme customization", client: "Kleinfeld GmbH", issueOffset: -13, dueOffset: 17, outcome: { kind: "open" }, why: "week 3 -> early-pay candidate" },
  { number: "FXA-2003", currency: "EUR", amount: 950, item: "Product photo retouching", client: "Atelier Moreau", issueOffset: -5, dueOffset: 10, outcome: { kind: "open" }, why: "due in week 2" },
  { number: "FXA-2004", currency: "EUR", amount: 3200, item: "Packaging design", client: "Studio Verde", issueOffset: -69, dueOffset: -39, outcome: { kind: "paid", paidOffset: -41 }, why: "paid on time" },
  { number: "FXA-2005", currency: "EUR", amount: 5000, item: "Annual design support", client: "Kleinfeld GmbH", issueOffset: -1, dueOffset: 59, outcome: { kind: "open" }, why: "large, far out -> early-pay candidate" },
  { number: "FXA-2006", currency: "EUR", amount: 1200, item: "Newsletter templates", client: "Studio Verde", issueOffset: -33, dueOffset: -3, outcome: { kind: "paid", paidOffset: -1 }, why: "paid a little late" },
  // JPY — Japanese clients
  { number: "FXA-3001", currency: "JPY", amount: 310000, item: "Illustration set (12)", client: "Sakura Games", issueOffset: -38, dueOffset: -8, outcome: { kind: "open" }, why: "overdue -> reminder" },
  { number: "FXA-3002", currency: "JPY", amount: 480000, item: "Character design", client: "Mori Design Office", issueOffset: -11, dueOffset: 19, outcome: { kind: "open" }, why: "week 3 -> early-pay candidate" },
  { number: "FXA-3003", currency: "JPY", amount: 150000, item: "Banner ads (5)", client: "Sakura Games", issueOffset: -7, dueOffset: 7, outcome: { kind: "open" }, why: "due in week 2" },
  { number: "FXA-3004", currency: "JPY", amount: 220000, item: "Storyboard", client: "Mori Design Office", issueOffset: -54, dueOffset: -24, outcome: { kind: "paid", paidOffset: -26 }, why: "paid on time" },
  { number: "FXA-3005", currency: "JPY", amount: 760000, item: "Game UI assets", client: "Sakura Games", issueOffset: -2, dueOffset: 58, outcome: { kind: "open" }, why: "large, far out -> early-pay candidate" },
];

// PayPal never frees an invoice number, even after cancelling, so each demo reset seeds a new
// generation: FXA-1001 (gen 1), FXA-1001-r2 (gen 2), ...
export function seedNumber(base: string, gen: number): string {
  return gen <= 1 ? base : `${base}-r${gen}`;
}

export function parseSeedNumber(n: string | undefined): { base: string; gen: number } | null {
  const m = /^(FXA-\d{4})(?:-r(\d+))?$/.exec(n ?? "");
  return m ? { base: m[1], gen: m[2] ? Number(m[2]) : 1 } : null;
}

export function addDays(day: string, n: number): string {
  const t = Date.parse(day + "T00:00:00Z") + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

// JPY has no minor unit on PayPal; the others use two decimals.
export function money(currency: string, value: number): { currency_code: string; value: string } {
  return { currency_code: currency, value: currency === "JPY" ? String(Math.round(value)) : value.toFixed(2) };
}

// PayPal Invoicing v2 draft body for one seed invoice.
export function draftBody(s: SeedInvoice, seedDay: string, recipientEmail: string, gen = 1) {
  return {
    detail: {
      currency_code: s.currency,
      invoice_number: seedNumber(s.number, gen),
      invoice_date: addDays(seedDay, s.issueOffset),
      payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: addDays(seedDay, s.dueOffset) },
      note: "Demo invoice (PayPal sandbox) — FX Exposure Agent",
    },
    primary_recipients: [{ billing_info: { email_address: recipientEmail, business_name: s.client } }],
    items: [{ name: s.item, quantity: "1", unit_amount: money(s.currency, s.amount) }],
    configuration: { allow_partial_payment: s.outcome.kind === "partial" },
  };
}
