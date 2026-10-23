// Shared types. Amounts are in the invoice's own currency unless the name says KRW.

export type Invoice = {
  id: string;
  number: string;
  status: string; // PayPal invoice status, e.g. SENT, UNPAID, PARTIALLY_PAID, PAID
  currency: string; // ISO 4217
  amountDue: number; // amount still to be collected
  dueDate: string; // YYYY-MM-DD
  invoiceDate: string; // YYYY-MM-DD
  recipient?: string;
};

// KRW per 1 unit of each currency, e.g. { USD: 1324.63, JPY: 8.43 }.
export type Rates = Record<string, number>;

export type Bucket = "overdue" | "w1" | "w2" | "w3" | "w4" | "later";

export const BUCKETS: Bucket[] = ["overdue", "w1", "w2", "w3", "w4", "later"];
