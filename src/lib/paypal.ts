// Minimal PayPal Invoicing v2 client. Sandbox only.
//
// We call the REST API directly instead of @paypal/agent-toolkit (1.11.0 pins ai@^4 / zod@^3).
// Endpoint shapes follow the toolkit's own calls so the agent tools keep the same names and scope.

import { appendAgentLog, parseAgentLog, type AgentActionKind } from "./agent-log";
import { offerMemoLine, offerNumber, parseOfferMemo } from "./offer-invoice";
import { money } from "./seed-data";
import type { Invoice } from "./types";

const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";

// Refuse anything that is not the sandbox host. This app never touches live money.
export function sandboxBase(raw = process.env.PAYPAL_API_BASE): string {
  const base = (raw || SANDBOX_BASE).replace(/\/+$/, "");
  if (new URL(base).hostname !== "api-m.sandbox.paypal.com") {
    throw new Error(`refusing non-sandbox PayPal base: ${new URL(base).hostname}`);
  }
  return base;
}

// Credentials pasted from the dashboard sometimes arrive wrapped in quotes, angle brackets or
// parentheses (seen 2026-10-23: both values wrapped in "( )" -> 401 invalid_client).
export function cleanCredential(v: string | undefined): string {
  let s = (v ?? "").trim();
  for (;;) {
    const pair = s[0] + s[s.length - 1];
    if (s.length >= 2 && ['""', "''", "<>", "()", "[]", "{}"].includes(pair)) s = s.slice(1, -1).trim();
    else return s;
  }
}

export class PayPalError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    public debugId?: string,
  ) {
    super(`PayPal HTTP ${status}${debugId ? ` (debug_id ${debugId})` : ""}: ${describeBody(body)}`);
  }
}

function describeBody(body: unknown): string {
  if (!body || typeof body !== "object") return String(body ?? "");
  const b = body as { name?: string; message?: string; error?: string; details?: { issue?: string; field?: string; description?: string }[] };
  const head = b.name ?? b.error ?? "";
  const details = (b.details ?? []).map((d) => [d.field, d.issue, d.description].filter(Boolean).join(" ")).join("; ");
  return [head, b.message, details].filter(Boolean).join(" — ");
}

const PAYPAL_TIMEOUT_MS = 20_000;

export class PayPalClient {
  private token?: { value: string; expiresAt: number };
  readonly base: string;

  constructor(
    private clientId = cleanCredential(process.env.PAYPAL_CLIENT_ID),
    private clientSecret = cleanCredential(process.env.PAYPAL_CLIENT_SECRET),
    base?: string,
  ) {
    this.base = sandboxBase(base);
    if (!this.clientId || !this.clientSecret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not set");
  }

  async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60_000) return this.token.value;
    const res = await fetch(`${this.base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(PAYPAL_TIMEOUT_MS),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new PayPalError(res.status, body);
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return this.token.value;
  }

  async request<T = unknown>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // A hung call used to hold the page (and the approve button's "Running…") until the host gave up.
      signal: AbortSignal.timeout(PAYPAL_TIMEOUT_MS),
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const parsed = text ? safeJson(text) : null;
    if (!res.ok) throw new PayPalError(res.status, parsed, res.headers.get("paypal-debug-id") ?? undefined);
    return parsed as T;
  }

  // --- Invoicing v2 -------------------------------------------------------------------------

  createDraftInvoice(invoice: unknown) {
    return this.request<PPInvoice>("POST", "/v2/invoicing/invoices", invoice, { Prefer: "return=representation" });
  }

  sendInvoice(id: string, opts: { send_to_recipient?: boolean; subject?: string; note?: string } = {}) {
    return this.request("POST", `/v2/invoicing/invoices/${id}/send`, { send_to_recipient: true, ...opts });
  }

  getInvoice(id: string) {
    return this.request<PPInvoice>("GET", `/v2/invoicing/invoices/${id}`);
  }

  async listInvoices(pageSize = 100): Promise<PPInvoice[]> {
    const out: PPInvoice[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await this.request<{ items?: PPInvoice[]; total_pages?: number }>(
        "GET",
        `/v2/invoicing/invoices?page=${page}&page_size=${pageSize}&total_required=true`,
      );
      out.push(...(r.items ?? []));
      if (!r.total_pages || page >= r.total_pages) break;
    }
    return out;
  }

  // Records a payment made outside PayPal. Status becomes MARKED_AS_PAID (or PARTIALLY_PAID).
  recordPayment(id: string, p: { method: string; payment_date: string; amount: { currency_code: string; value: string }; note?: string }) {
    return this.request("POST", `/v2/invoicing/invoices/${id}/payments`, p);
  }

  sendReminder(id: string, opts: { subject?: string; note?: string; send_to_invoicer?: boolean } = {}) {
    return this.request("POST", `/v2/invoicing/invoices/${id}/remind`, opts);
  }

  // Early-payment discount: buyer pays less if they pay before `endDate` (YYYY-MM-DD).
  createEarlyPaymentDiscount(id: string, percent: number, endDate: string) {
    return this.request("POST", `/v2/invoicing/invoices/${id}/conditional-rules`, {
      rules: [
        {
          conditional_rule_type: "EARLY_PAYMENT_DISCOUNT",
          conditional_rule_value_type: "PERCENT",
          conditional_rule_value: String(percent),
          rule_expiry_terms: { rule_expiry_condition: "SPECIFIC_DATE", condition_rule_end_date: endDate },
        },
      ],
    });
  }

  // The conditional offer (src/lib/offer-invoice.ts): a second invoice to the same client for the discounted amount,
  // due on the earlier date. The original stays as it is; its memo records that the offer was sent.
  async sendEarlyPaymentOffer(id: string, o: { percent: number; amount: number; dueDate: string; note: string; at: Date; auto?: boolean }) {
    const cur = await this.getInvoice(id);
    const ccy = cur.detail.currency_code;
    const number = cur.detail.invoice_number ?? id;
    const created = await this.createDraftInvoice({
      detail: {
        currency_code: ccy,
        invoice_number: offerNumber(number),
        // No invoice_date: PayPal dates it by its own "today" (a UTC date ahead of the merchant's day makes it SCHEDULED).
        payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: o.dueDate },
        note: o.note,
        memo: offerMemoLine(id, o.percent),
      },
      primary_recipients: cur.primary_recipients,
      items: [{ name: `Early payment of invoice ${number} (${o.percent}% off)`, quantity: "1", unit_amount: money(ccy, o.amount) }],
    });
    await this.sendInvoice(created.id, { send_to_recipient: true });
    await this.logAgentAction(id, "early_pay_discount", o.at, o.auto);
    return created;
  }

  // Records an agent action in the invoice's private memo without e-mailing anyone.
  async logAgentAction(id: string, kind: AgentActionKind, at: Date, auto = false) {
    const cur = await this.getInvoice(id);
    return this.putInvoice(id, cur, false, { detail: { ...cur.detail, memo: appendAgentLog(cur.detail.memo, kind, at, auto) } });
  }

  // --- Invoice templates: where the seller's standing policy is kept (src/lib/policy.ts) -------------

  async findTemplate(name: string): Promise<PPTemplate | null> {
    const r = await this.request<{ templates?: PPTemplate[] }>("GET", "/v2/invoicing/templates?fields=all&page_size=50");
    return r.templates?.find((t) => t.name === name) ?? null;
  }

  // Creates the template, or replaces its memo and note. Memo is capped by PayPal at 500 characters.
  async saveTemplate(name: string, currency: string, memo: string, note: string): Promise<PPTemplate> {
    const cur = await this.findTemplate(name);
    if (!cur)
      return this.request<PPTemplate>(
        "POST",
        "/v2/invoicing/templates",
        { name, default_template: false, template_info: { detail: { currency_code: currency, memo, note } } },
        { Prefer: "return=representation" },
      );
    const { links: _l, ...rest } = cur as PPTemplate & { links?: unknown };
    void _l;
    return this.request<PPTemplate>(
      "PUT",
      `/v2/invoicing/templates/${cur.id}`,
      { ...rest, default_template: false, template_info: { ...rest.template_info, detail: { ...rest.template_info?.detail, memo, note } } },
      { Prefer: "return=representation" },
    );
  }

  // Full-replace update (PUT). `links` is read-only and must not be sent back.
  private putInvoice(id: string, cur: PPInvoice, notifyRecipient: boolean, patch: Record<string, unknown>) {
    const { links: _links, ...rest } = cur as PPInvoice & { links?: unknown };
    void _links;
    return this.request<PPInvoice>(
      "PUT",
      `/v2/invoicing/invoices/${id}?send_to_recipient=${notifyRecipient}&send_to_invoicer=false`,
      { ...rest, ...patch },
      { Prefer: "return=representation" },
    );
  }

  cancelInvoice(id: string) {
    return this.request("POST", `/v2/invoicing/invoices/${id}/cancel`, { send_to_recipient: false, send_to_invoicer: false });
  }

  deleteDraft(id: string) {
    return this.request("DELETE", `/v2/invoicing/invoices/${id}`);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// The page a client sees for an invoice (and pays from), in the sandbox.
export function clientViewUrl(invoiceId: string): string {
  return `https://www.sandbox.paypal.com/invoice/p/#${invoiceId.replace(/^INV2-/, "").replace(/-/g, "")}`;
}

// --- Mapping PayPal -> engine ----------------------------------------------------------------

export type PPMoney = { currency_code: string; value: string };
export type PPTemplate = { id: string; name: string; template_info?: { detail?: { currency_code?: string; memo?: string; note?: string } & Record<string, unknown> } & Record<string, unknown> };
export type PPInvoice = {
  id: string;
  status: string;
  detail: {
    invoice_number?: string;
    reference?: string;
    memo?: string; // private to the merchant
    note?: string; // shown to the buyer
    currency_code: string;
    invoice_date?: string;
    payment_term?: { term_type?: string; due_date?: string };
    metadata?: { create_time?: string };
  };
  primary_recipients?: { billing_info?: { email_address?: string; business_name?: string; name?: { given_name?: string; surname?: string; full_name?: string } } }[];
  amount?: PPMoney;
  due_amount?: PPMoney;
  payments?: { paid_amount?: PPMoney; transactions?: { payment_date?: string; amount?: PPMoney }[] };
  items?: { name?: string }[]; // only in a single-invoice GET, not in the list
};

// Turns a PayPal invoice into the engine's shape. Returns null with a reason when it can't.
export function toInvoice(pp: PPInvoice): { invoice: Invoice } | { skipped: { id: string; reason: string } } {
  const ccy = pp.detail?.currency_code ?? pp.amount?.currency_code;
  const due = pp.detail?.payment_term?.due_date ?? pp.detail?.invoice_date;
  if (!ccy) return { skipped: { id: pp.id, reason: "no currency" } };
  if (!due) return { skipped: { id: pp.id, reason: "no due date" } };
  // due_amount is what is still owed; fall back to total minus paid.
  const total = Number(pp.amount?.value ?? NaN);
  const paid = Number(pp.payments?.paid_amount?.value ?? 0);
  const dueAmount = pp.due_amount ? Number(pp.due_amount.value) : total - paid;
  if (!Number.isFinite(dueAmount)) return { skipped: { id: pp.id, reason: "no amount" } };
  const r = pp.primary_recipients?.[0]?.billing_info;
  return {
    invoice: {
      id: pp.id,
      number: pp.detail.invoice_number ?? pp.id,
      status: pp.status,
      currency: ccy,
      amountDue: dueAmount,
      dueDate: due,
      invoiceDate: pp.detail.invoice_date ?? due,
      recipient: r?.email_address,
      recipientName: recipientName(r),
      total: Number.isFinite(total) ? total : undefined,
      payments: pp.payments?.transactions
        ?.filter((t) => t.payment_date && t.amount)
        .map((t) => ({ date: t.payment_date!, amount: Number(t.amount!.value) })),
      createdAt: pp.detail.metadata?.create_time,
      agentLog: parseAgentLog(pp.detail.memo),
      ...(pp.items?.length ? { items: pp.items.map((i) => (i.name ?? "").trim()).filter(Boolean) } : {}),
      ...(parseOfferMemo(pp.detail.memo) ? { offerFor: parseOfferMemo(pp.detail.memo)! } : {}),
    },
  };
}

function recipientName(b: { business_name?: string; name?: { given_name?: string; surname?: string; full_name?: string } } | undefined) {
  const person = b?.name?.full_name || [b?.name?.given_name, b?.name?.surname].filter(Boolean).join(" ");
  return (b?.business_name || person || "").trim() || undefined;
}
