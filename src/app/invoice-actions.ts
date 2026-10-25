"use server";

// New-invoice assistant. `planInvoice` reads the seller's request and returns the options with every
// number computed by code and a comparison written by Claude (checked). `createPlannedInvoice` runs
// after the seller clicks one option: the server re-validates the fields, recomputes that option from a
// fresh book and only then creates and sends the PayPal invoice(s).

import { randomBytes } from "node:crypto";
import { refresh, updateTag } from "next/cache";
import { LOCKED_MESSAGE, writesAllowed } from "@/lib/access";
import { demoMode, loadLiveInputs } from "@/lib/book";
import { BOOK_TAG, loadInputs } from "@/lib/book-cache";
import {
  clientHistory,
  draftsFor,
  historyFact,
  parseRequest,
  planOptions,
  validateRequest,
  writeComparison,
  type InvoiceOption,
  type InvoiceRequest,
  type OptionId,
} from "@/lib/invoice-plan";
import { PayPalClient, PayPalError } from "@/lib/paypal";
import { cachedComparison } from "@/lib/plan-cache";
import { pickBase, viewFor } from "@/lib/view";

export type PlanState = {
  text?: string;
  fields: Partial<InvoiceRequest>;
  error?: string;
  parsedBy?: "claude" | "rules";
  parseNote?: string;
  plan?: {
    request: InvoiceRequest;
    history: string;
    options: InvoiceOption[];
    comparison: string;
    comparisonBy: "claude" | "rules";
    rejected: number;
  };
  readOnly: boolean;
} | null;

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function planInvoice(_prev: PlanState, form: FormData): Promise<PlanState> {
  const base = pickBase(str(form, "base"));
  const useModel = await writesAllowed(); // without the access code: rules only, no model call
  const readOnly = demoMode() || !useModel;
  const inputs = await loadInputs();
  const view = viewFor(inputs, base, new Date());
  const known = [...new Set(inputs.invoices.map((i) => i.recipientName).filter((n): n is string => !!n))];

  // "Read my request" fills the fields from the sentence (typed fields fill only the gaps);
  // "Compare" uses the fields exactly as typed.
  const typed: Partial<InvoiceRequest> = {};
  if (str(form, "client")) typed.client = str(form, "client");
  if (str(form, "currency")) typed.currency = str(form, "currency");
  if (str(form, "amount")) typed.amount = Number(str(form, "amount").replace(/,/g, ""));
  if (str(form, "termsDays")) typed.termsDays = Number(str(form, "termsDays"));
  if (str(form, "item")) typed.item = str(form, "item");

  let fields: Partial<InvoiceRequest> = typed;
  let parsedBy: "claude" | "rules" | undefined;
  let parseNote: string | undefined;
  const text = str(form, "text");
  if (text && str(form, "useText") === "1") {
    const p = await parseRequest(text, known, base, inputs.asOf, useModel);
    parsedBy = p.by;
    parseNote = p.note;
    fields = { ...typed, ...cleanParsed(p.fields) };
  }

  const req = validateRequest(fields);
  if (typeof req === "string") return { text, fields, error: req, parsedBy, parseNote, readOnly };

  const h = clientHistory(inputs.invoices, req.client);
  const options = planOptions(req, h, { base, asOf: inputs.asOf, rates: view.rates, vols: view.vols, ecb: inputs.ecb });
  if (!options.length) return { text, fields: req, error: `No exchange rate for ${req.currency} today.`, parsedBy, parseNote, readOnly };
  const cmp = useModel ? await cachedComparison(req, h, options, base) : await writeComparison(req, h, options, base, false);
  return {
    text,
    fields: req,
    parsedBy,
    parseNote,
    readOnly,
    plan: { request: req, history: historyFact(h), options, comparison: cmp.text, comparisonBy: cmp.by, rejected: cmp.rejected.length },
  };
}

// The model's empty strings and zeros mean "not given".
function cleanParsed(f: Partial<InvoiceRequest>): Partial<InvoiceRequest> {
  const out: Partial<InvoiceRequest> = {};
  if (f.client) out.client = f.client;
  if (f.currency) out.currency = f.currency;
  if (f.amount && f.amount > 0) out.amount = f.amount;
  if (f.termsDays && f.termsDays > 0) out.termsDays = f.termsDays;
  if (f.item) out.item = f.item;
  return out;
}

export type CreateState = { ok: boolean; message: string } | null;
const OPTION_IDS: OptionId[] = ["as_asked", "home_currency", "shorter_terms", "split"];
const SANDBOX_BUYER = process.env.SEED_RECIPIENT_EMAIL ?? "sb-lhwuh53492948@personal.example.com";

export async function createPlannedInvoice(_prev: CreateState, form: FormData): Promise<CreateState> {
  if (demoMode()) return { ok: false, message: "This is a read-only demo snapshot. Invoices are created on the live sandbox only." };
  if (!(await writesAllowed())) return { ok: false, message: LOCKED_MESSAGE };
  const optionId = str(form, "optionId") as OptionId;
  if (!OPTION_IDS.includes(optionId)) return { ok: false, message: "Unknown option." };
  const req = validateRequest({
    client: str(form, "client"),
    currency: str(form, "currency"),
    amount: Number(str(form, "amount")),
    termsDays: Number(str(form, "termsDays")),
    item: str(form, "item"),
  });
  if (typeof req === "string") return { ok: false, message: req };

  const base = pickBase(str(form, "base"));
  const now = new Date();
  const inputs = await loadLiveInputs();
  const view = viewFor(inputs, base, now);
  const h = clientHistory(inputs.invoices, req.client);
  const option = planOptions(req, h, { base, asOf: inputs.asOf, rates: view.rates, vols: view.vols, ecb: inputs.ecb }).find(
    (o) => o.id === optionId,
  );
  if (!option) return { ok: false, message: "That option is not available for this invoice." };

  const pp = new PayPalClient();
  const drafts = draftsFor(req, option, h.email ?? SANDBOX_BUYER, inputs.asOf, randomBytes(2).toString("hex").toUpperCase(), now);
  const done: string[] = [];
  try {
    for (const d of drafts) {
      const created = await pp.createDraftInvoice(d);
      await pp.sendInvoice(created.id, { send_to_recipient: true });
      done.push(d.detail.invoice_number);
    }
  } catch (e) {
    updateTag(BOOK_TAG);
    refresh();
    const why = e instanceof PayPalError ? e.message : e instanceof Error ? e.message : String(e);
    return { ok: false, message: `${done.length ? `Sent ${done.join(", ")}, then ` : ""}PayPal refused: ${why}` };
  }
  updateTag(BOOK_TAG);
  refresh();
  return { ok: true, message: `Sent ${done.join(" and ")} to ${req.client} (${option.title}).` };
}
