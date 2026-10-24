// Limits for new invoices, shared by the server planner and the browser form (no server imports here).

// Currencies this app can invoice in: PayPal-supported and covered by the ECB rates. PayPal does not
// invoice in KRW, so a KRW seller sees exposure in KRW but bills in one of these.
export const PLAN_CURRENCIES = ["USD", "EUR", "GBP", "JPY"] as const;
export const canInvoiceIn = (c: string) => (PLAN_CURRENCIES as readonly string[]).includes(c);
export const TERMS = { min: 7, max: 120 } as const;
