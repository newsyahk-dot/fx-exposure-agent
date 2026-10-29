import type { AgentLogEntry } from "./agent-log";
import type { OfferInfo } from "./offer-invoice";

// Shared types. Amounts are in the invoice's own currency unless noted ("value" = home currency).

export type Invoice = {
  id: string;
  number: string;
  status: string; // PayPal invoice status, e.g. SENT, UNPAID, PARTIALLY_PAID, PAID
  currency: string; // ISO 4217
  amountDue: number; // amount still to be collected
  dueDate: string; // YYYY-MM-DD
  invoiceDate: string; // YYYY-MM-DD
  recipient?: string;
  recipientName?: string; // client's business or personal name, if the invoice has one
  total?: number; // invoice total, in the invoice currency
  payments?: { date: string; amount: number }[]; // recorded payments (filled for paid invoices only)
  createdAt?: string; // when the invoice was created in PayPal (ISO, UTC)
  agentLog?: AgentLogEntry[]; // actions the agent already took on this invoice (from the memo)
  offerFor?: { originalId: string; percent: number }; // this is an early-payment offer for another invoice
  offer?: OfferInfo; // the early-payment offer sent for this invoice, if any (src/lib/offer-invoice.ts)
  items?: string[]; // what was billed (line item names), when known
};

// Home-currency units per 1 unit of each currency, e.g. with KRW home: { USD: 1324.63, JPY: 8.43 }.
export type Rates = Record<string, number>;

export type Bucket = "overdue" | "w1" | "w2" | "w3" | "w4" | "later";

export const BUCKETS: Bucket[] = ["overdue", "w1", "w2", "w3", "w4", "later"];
