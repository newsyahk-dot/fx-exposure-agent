// New-invoice assistant. Before an invoice goes out, show what its terms do to the seller's exposure.
//
// Claude does two things: turns the seller's sentence into invoice fields, and writes a neutral
// comparison of the options. Code does everything else — the client's payment history, every number for
// every option, the historical range — and checks the comparison before it is shown. The app never says
// which option to pick; creating the invoice needs the seller's click.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { AGENT_MODEL, FALLBACK_MODELS, toBusinessDays } from "./agent";
import { checkSellerText } from "./checks";
import { replayBook } from "./evidence";
import { daysBetween } from "./exposure";
import type { EcbQuotes } from "./fx";
import { compact, money } from "./format";
import { appendAgentLog } from "./agent-log";
import { addDays, money as ppMoney } from "./seed-data";
import type { Invoice, Rates } from "./types";

export { canInvoiceIn, PLAN_CURRENCIES, TERMS } from "./invoice-terms";
import { canInvoiceIn, PLAN_CURRENCIES, TERMS } from "./invoice-terms";
export const SPLIT_DEPOSIT_DAYS = 7;
export const SHORT_TERMS_DAYS = 14;
const AMOUNT_MAX: Record<string, number> = { USD: 500_000, EUR: 500_000, GBP: 500_000, JPY: 75_000_000 };

export type InvoiceRequest = { client: string; currency: string; amount: number; termsDays: number; item: string };

// Validates fields from a form or from the model. Returns the request, or the first problem.
export function validateRequest(r: Partial<Record<keyof InvoiceRequest, unknown>>): InvoiceRequest | string {
  const client = String(r.client ?? "").trim().slice(0, 80);
  const currency = String(r.currency ?? "").trim().toUpperCase();
  const amount = Number(r.amount);
  const termsDays = Number(r.termsDays);
  const item = String(r.item ?? "").trim().slice(0, 120) || "Services";
  if (!client) return "Who is the invoice for?";
  if (!canInvoiceIn(currency)) return `Currency must be one of ${PLAN_CURRENCIES.join(", ")}.`;
  if (!(amount > 0) || amount > (AMOUNT_MAX[currency] ?? 0)) return "Amount is missing or out of range.";
  if (!Number.isInteger(termsDays) || termsDays < TERMS.min || termsDays > TERMS.max)
    return `Payment terms must be ${TERMS.min} to ${TERMS.max} days.`;
  return { client, currency, amount: roundAmount(currency, amount), termsDays, item };
}

const roundAmount = (ccy: string, n: number) => (ccy === "JPY" ? Math.round(n) : Math.round(n * 100) / 100);

// --- What this client has done before --------------------------------------------------------------

export type ClientHistory = { client: string; known: boolean; paid: number; avgDaysLate: number | null; open: number; email?: string };

export const sameClient = (a: string | undefined, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();

export function clientHistory(invoices: Invoice[], client: string): ClientHistory {
  const theirs = invoices.filter((i) => sameClient(i.recipientName, client));
  const lates: number[] = [];
  let paid = 0;
  for (const i of theirs) {
    const last = (i.payments ?? []).map((p) => p.date).sort().at(-1);
    if (!last || i.amountDue > 0) continue;
    paid++;
    const d = daysBetween(i.dueDate, last);
    if (!Number.isNaN(d)) lates.push(Math.max(0, d));
  }
  return {
    client: theirs[0]?.recipientName ?? client,
    known: theirs.length > 0,
    paid,
    avgDaysLate: lates.length ? Math.round(lates.reduce((s, x) => s + x, 0) / lates.length) : null,
    open: theirs.filter((i) => i.amountDue > 0).length,
    email: theirs.find((i) => i.recipient)?.recipient,
  };
}

export function historyFact(h: ClientHistory): string {
  if (!h.known) return `No past invoices to ${h.client}; waits below assume payment on the due date.`;
  if (h.avgDaysLate == null) return `${h.client} has ${h.open} open invoices and no fully paid ones yet; waits below assume payment on the due date.`;
  return `${h.client} paid ${h.paid} past invoice${h.paid === 1 ? "" : "s"} on average ${h.avgDaysLate} days after the due date; waits below add those ${h.avgDaysLate} days.`;
}

// --- The options -------------------------------------------------------------------------------------

export type Part = { currency: string; amount: number; dueInDays: number; dueDate: string; label: string };
export type OptionId = "as_asked" | "home_currency" | "shorter_terms" | "split";
export type InvoiceOption = {
  id: OptionId;
  title: string;
  parts: Part[];
  value: number; // in the home currency, at today's rate
  swing: number | null; // one standard deviation of the value until paid, home money; 0 = no FX risk for the seller
  range: { p5: number; p95: number; n: number } | null; // the same waits over two years of ECB rates
  facts: string;
};

export type PlanContext = { base: string; asOf: string; rates: Rates; vols: Record<string, number | null>; ecb: EcbQuotes };

// One standard deviation of a sum of payments in one currency, each paid after its own wait, under a
// random walk: Var = σ² Σᵢ Σⱼ vᵢ vⱼ min(tᵢ, tⱼ) with t in business days.
export function sigmaOfParts(values: number[], waitsBusinessDays: number[], vol: number): number {
  let v = 0;
  for (let i = 0; i < values.length; i++)
    for (let j = 0; j < values.length; j++) v += values[i] * values[j] * Math.min(waitsBusinessDays[i], waitsBusinessDays[j]);
  return vol * Math.sqrt(Math.max(0, v));
}

export function planOptions(req: InvoiceRequest, h: ClientHistory, ctx: PlanContext): InvoiceOption[] {
  const { base, asOf } = ctx;
  const c = (n: number) => compact(base, n);
  const late = h.avgDaysLate ?? 0;
  const rate = req.currency === base ? 1 : ctx.rates[req.currency];
  if (!(rate > 0)) return [];
  const vol = req.currency === base ? 0 : ctx.vols[req.currency];

  const part = (currency: string, amount: number, dueInDays: number, label: string): Part => ({
    currency,
    amount: roundAmount(currency, amount),
    dueInDays,
    dueDate: addDays(asOf, dueInDays),
    label,
  });
  const build = (id: OptionId, title: string, parts: Part[], lead: string): InvoiceOption => {
    const foreign = parts[0].currency !== base;
    const values = parts.map((p) => p.amount * (p.currency === base ? 1 : rate));
    const waits = parts.map((p) => p.dueInDays + late);
    const value = values.reduce((s, x) => s + x, 0);
    const swing = !foreign ? 0 : vol == null ? null : sigmaOfParts(values, waits.map(toBusinessDays), vol);
    const r = foreign
      ? replayBook(ctx.ecb, base, parts.map((p, i) => ({ currency: p.currency, value: values[i], waitDays: waits[i] })), asOf)
      : null;
    const range = r && r.n > 0 ? { p5: r.p5, p95: r.p95, n: r.n } : null;
    const facts = [
      `${title}: ${lead}`,
      parts.map((p) => `${p.label} ${money(p.currency, p.amount)} due ${p.dueDate} (${p.dueInDays} days).`).join(" "),
      `Worth about ${c(value)} at today's rate.`,
      !foreign
        ? req.currency === base
          ? `Billed in your home currency ${base}, so there is no exchange-rate risk for you.`
          : `No exchange-rate risk for you; the client carries the change between ${req.currency} and ${base} instead.`
        : swing == null
          ? "Not enough rate history to size the swing."
          : `A typical swing either way (one standard deviation) until paid is about ${c(swing)}.`,
      range ? `Over two years of ECB rates, the same waits moved the total between ${signed(c, range.p5)} and ${signed(c, range.p95)} nine times out of ten.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return { id, title, parts, value, swing, range, facts };
  };

  const out: InvoiceOption[] = [
    build("as_asked", "As asked", [part(req.currency, req.amount, req.termsDays, "One invoice of")], `in ${req.currency}, ${req.termsDays}-day terms.`),
  ];
  if (req.currency === base) return out;
  if (canInvoiceIn(base))
    out.push(
    build(
      "home_currency",
      `Bill in ${base}`,
      [part(base, req.amount * rate, req.termsDays, "One invoice of")],
      `the same amount converted at today's ECB rate, ${req.termsDays}-day terms.`,
    ),
  );
  if (req.termsDays > SHORT_TERMS_DAYS)
    out.push(
      build(
        "shorter_terms",
        `${SHORT_TERMS_DAYS}-day terms`,
        [part(req.currency, req.amount, SHORT_TERMS_DAYS, "One invoice of")],
        `in ${req.currency}, due sooner.`,
      ),
    );
  if (req.termsDays > SPLIT_DEPOSIT_DAYS) {
    const half = roundAmount(req.currency, req.amount / 2);
    out.push(
      build(
        "split",
        "Half up front",
        [
          part(req.currency, half, SPLIT_DEPOSIT_DAYS, "A deposit invoice of"),
          part(req.currency, req.amount - half, req.termsDays, "A balance invoice of"),
        ],
        `two invoices in ${req.currency}.`,
      ),
    );
  }
  return out;
}

const signed = (c: (n: number) => string, n: number) => `${n >= 0 ? "+" : "−"}${c(Math.abs(n))}`;

// --- Claude: parse the request, and write the comparison --------------------------------------------

const client = () => {
  const apiKey = process.env.FXA_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey, baseURL: "https://api.anthropic.com", timeout: 45_000, maxRetries: 1 }) : null;
};
const modelParams = () => ({
  model: AGENT_MODEL,
  ...(FALLBACK_MODELS.has(AGENT_MODEL) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
});

const Fields = z.object({
  client: z.string().describe("Client business or person name, as written; empty if not given"),
  currency: z.string().describe(`ISO code, one of ${PLAN_CURRENCIES.join(", ")}; empty if not given`),
  amount: z.number().describe("Invoice amount in that currency; 0 if not given"),
  termsDays: z.number().describe("Days until due; 30 if not given"),
  item: z.string().describe("Short description of the work"),
});

export type ParseResult = { fields: Partial<InvoiceRequest>; by: "claude" | "rules"; note?: string };

export async function parseRequest(text: string, knownClients: string[], base: string, asOf: string): Promise<ParseResult> {
  const t = text.trim().slice(0, 500);
  const api = client();
  if (api && t) {
    try {
      const m = await api.messages.parse({
        ...modelParams(),
        max_tokens: 2000,
        output_config: { effort: "low", format: zodOutputFormat(Fields) },
        system:
          "Extract invoice fields from the seller's request. Only use what the request says; never invent an amount or a client. " +
          `Map currency words and symbols to ISO codes ($ is USD unless the request says otherwise, ¥ or yen is JPY, € is EUR, £ is GBP, ₩ or won is KRW). Home currency is ${base}. ` +
          "Expand amounts like 5k or 1.2m. 'net 45' or '45 days' means termsDays 45; a date or 'end of next month' means the number of calendar days from today to that date. " +
          `Today is ${asOf} (${new Date(asOf + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })}). ` +
          `If the client matches one of these known clients, use that exact name: ${knownClients.join("; ") || "none"}.`,
        messages: [{ role: "user", content: t }],
      });
      if (m.parsed_output) return { fields: m.parsed_output, by: "claude" };
    } catch {
      // fall through to the rules
    }
  }
  return { fields: parseByRules(t, knownClients), by: "rules", note: api ? "the model did not answer" : "no API key" };
}

const SYMBOL: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₩": "KRW" };
const WORD: Record<string, string> = { dollar: "USD", euro: "EUR", pound: "GBP", yen: "JPY", won: "KRW" };

export function parseByRules(t: string, knownClients: string[]): Partial<InvoiceRequest> {
  const out: Partial<InvoiceRequest> = { termsDays: 30 };
  const lower = t.toLowerCase();
  out.client = knownClients.find((c) => lower.includes(c.toLowerCase()));
  const amt = /([$€£¥₩])?\s*(\d[\d,]*(?:\.\d+)?)\s*([km])?\b\s*(usd|eur|gbp|jpy|krw|dollars?|euros?|pounds?|yen|won)?/i.exec(t);
  if (amt) {
    const mult = amt[3]?.toLowerCase() === "k" ? 1e3 : amt[3]?.toLowerCase() === "m" ? 1e6 : 1;
    out.amount = Number(amt[2].replace(/,/g, "")) * mult;
    const word = amt[4]?.toLowerCase().replace(/s$/, "");
    out.currency = amt[1] ? SYMBOL[amt[1]] : word ? (WORD[word] ?? word.toUpperCase()) : undefined;
  }
  const terms = /(?:net\s*(\d{1,3}))|(\d{1,3})\s*days?/i.exec(t);
  if (terms) out.termsDays = Number(terms[1] ?? terms[2]);
  const item = /\bfor\s+([^,.;]{3,60})/i.exec(t);
  if (item && !knownClients.some((c) => item[1].toLowerCase().includes(c.toLowerCase()))) out.item = item[1].trim();
  return out;
}

export type Comparison = { text: string; by: "claude" | "rules"; rejected: string[] };

export function comparisonTemplate(options: InvoiceOption[], base: string): string {
  const c = (n: number) => compact(base, n);
  return options
    .map((o) =>
      o.swing === 0 ? `${o.title}: no exchange-rate risk for you.` : o.swing == null ? `${o.title}: swing not sized.` : `${o.title}: typical swing about ${c(o.swing)}.`,
    )
    .join(" ");
}

export function availabilityFact(req: InvoiceRequest, base: string, options: InvoiceOption[]): string {
  return [
    `The options are exactly these ${options.length}: ${options.map((o) => o.title).join("; ")}.`,
    req.currency !== base && !canInvoiceIn(base) ? `PayPal does not invoice in ${base}, so billing in ${base} is not an option.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function writeComparison(req: InvoiceRequest, h: ClientHistory, options: InvoiceOption[], base: string): Promise<Comparison> {
  if (options.length < 2) return { text: options[0]?.facts.replace(/^As asked: /, "") ?? "", by: "rules", rejected: [] };
  const facts = [historyFact(h), availabilityFact(req, base, options), ...options.map((o) => o.facts)].join("\n");
  const allowed = `${facts} ${options.length}`;
  const swings = options.flatMap((o) => (o.swing ? [compact(base, o.swing)] : []));
  const ctx = { stress: [], swings, others: [] };
  const rejected: string[] = [];
  const api = client();
  if (api) {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: `Invoice for ${req.client}. Facts:\n${facts}` }];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const m = await api.messages.parse({
          ...modelParams(),
          max_tokens: 3000,
          output_config: { effort: "medium", format: zodOutputFormat(z.object({ comparison: z.string() })) },
          system:
            `You help a freelancer compare ways to bill one client. Home currency: ${base}. In at most 4 short sentences (under 600 characters), ` +
            "say what each option changes: how long money waits, how large the typical swing is, and who carries the exchange rate. " +
            "Use only numbers that appear in the facts, copied exactly, and keep each figure with its own label (typical swing vs the two-year range). " +
            "Never say which option is better, never recommend, never predict where rates go. A swing is a size of uncertainty, not a loss or a gain. " +
            "Describe only the options listed in the facts; do not mention any other way to bill. " +
            "Billing in the home currency moves the exchange-rate change to the client; state that as a fact, without guessing how the client reacts.",
          messages,
        });
        const text = m.parsed_output?.comparison?.trim() ?? "";
        const why = checkSellerText(text, allowed, 600, ctx);
        if (!why) return { text, by: "claude", rejected };
        rejected.push(why);
        messages.push({ role: "assistant", content: JSON.stringify({ comparison: text }) });
        messages.push({ role: "user", content: `REJECTED by the checks: ${why}. Rewrite it.` });
      } catch {
        break;
      }
    }
  }
  return { text: comparisonTemplate(options, base), by: "rules", rejected };
}

// --- PayPal draft bodies -----------------------------------------------------------------------------

export function invoiceNumber(asOf: string, nonce: string, i: number, n: number) {
  return `FXA-N${asOf.replace(/-/g, "").slice(2)}-${nonce}${n > 1 ? `-${i + 1}` : ""}`;
}

export function draftsFor(req: InvoiceRequest, option: InvoiceOption, recipientEmail: string, asOf: string, nonce: string, now: Date) {
  return option.parts.map((p, i) => ({
    detail: {
      currency_code: p.currency,
      invoice_number: invoiceNumber(asOf, nonce, i, option.parts.length),
      invoice_date: asOf,
      payment_term: { term_type: "DUE_ON_DATE_SPECIFIED", due_date: p.dueDate },
      note:
        option.parts.length > 1
          ? `Part ${i + 1} of ${option.parts.length} for ${req.item}. Payment due by ${p.dueDate}.`
          : `Payment due by ${p.dueDate}.`,
      memo: appendAgentLog(`New-invoice assistant, option: ${option.title}.`, "created", now),
    },
    primary_recipients: [{ billing_info: { email_address: recipientEmail, business_name: req.client } }],
    items: [{ name: option.parts.length > 1 ? `${req.item} (${i === 0 ? "deposit" : "balance"})` : req.item, quantity: "1", unit_amount: ppMoney(p.currency, p.amount) }],
  }));
}
