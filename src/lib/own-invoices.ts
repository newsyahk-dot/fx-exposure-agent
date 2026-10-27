// "Try it with your own invoices": reads a pasted invoice list (CSV or tab-separated, e.g. an export from PayPal or
// any invoicing tool) into the app's Invoice shape. Columns are found by their header names. Rows that cannot be read
// are returned with a reason, never dropped silently. Nothing here is stored; the caller analyses and discards it.

import type { Invoice } from "./types";

export const OWN_MAX_ROWS = 500;
export const OWN_MAX_CHARS = 200_000;

export type OwnParse = { invoices: Invoice[]; skipped: { row: number; reason: string }[]; columns: Record<string, string> };

type Field = "client" | "currency" | "amount" | "due" | "number" | "status" | "issued";

// Header patterns, most specific first; the first column matching each field wins.
const HEADERS: [Field, RegExp][] = [
  ["amount", /amount\s*due|balance|outstanding|due\s*amount|open\s*amount|unpaid/i],
  ["due", /due\s*date|^due$|payment\s*due|due\s*on/i],
  ["issued", /invoice\s*date|issue\s*date|issued|date\s*sent|created/i],
  ["number", /invoice\s*(?:no|number|#|id)|^number$|^no\.?$|^#$|reference/i],
  ["currency", /currency|^ccy$|^cur$/i],
  ["status", /status|state/i],
  ["client", /client|customer|recipient|bill(?:ed)?\s*to|company|payer|^name$/i],
  ["amount", /amount|total|value|sum/i],
];

const CLOSED = /\b(paid|cancel+ed|void|refunded|draft|deleted|written\s*off)\b/i;

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function pickSeparator(header: string): string {
  const counts = ["\t", ";", ","].map((s) => [s, header.split(s).length - 1] as const);
  return counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ",";
}

// "1,234.56", "€1.234,56", "JPY 310,000", "(250.00)" → number; null when it is not a number.
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,\-()]/g, "");
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()-]/g, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastComma > lastDot && s.length - lastComma - 1 === 2) s = s.replace(/\./g, "").replace(",", "."); // 1.234,56
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

// ISO dates first; then "MM/DD/YYYY" (PayPal's US export) or "DD.MM.YYYY"; then month names ("Nov 30, 2026").
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return +m[1] > 12 ? iso(+m[3], +m[2], +m[1]) : iso(+m[3], +m[1], +m[2]);
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) return iso(+m[3], +m[2], +m[1]);
  if (/[a-z]{3}/i.test(s)) {
    const t = Date.parse(`${s} 12:00 UTC`);
    if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCMonth() !== mo - 1) return null;
  return back.toISOString().slice(0, 10);
}

export function parseOwnInvoices(text: string, known: Set<string>): OwnParse {
  const lines = text
    .slice(0, OWN_MAX_CHARS)
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) return { invoices: [], skipped: [{ row: 1, reason: "needs a header row and at least one invoice" }], columns: {} };
  const sep = pickSeparator(lines[0]);
  const header = splitLine(lines[0], sep);
  const col: Partial<Record<Field, number>> = {};
  for (const [field, re] of HEADERS) {
    if (col[field] !== undefined) continue;
    const i = header.findIndex((h, k) => re.test(h) && !Object.values(col).includes(k));
    if (i >= 0) col[field] = i;
  }
  const columns = Object.fromEntries(Object.entries(col).map(([f, i]) => [f, header[i as number]]));
  const missing = (["currency", "amount", "due"] as Field[]).filter((f) => col[f] === undefined);
  if (missing.length)
    return { invoices: [], skipped: [{ row: 1, reason: `no column for ${missing.join(", ")} (headers: ${header.join(", ")})` }], columns };

  const invoices: Invoice[] = [];
  const skipped: OwnParse["skipped"] = [];
  const cell = (cells: string[], f: Field) => (col[f] === undefined ? "" : (cells[col[f]!] ?? ""));
  for (let r = 1; r < lines.length; r++) {
    const row = r + 1;
    if (invoices.length >= OWN_MAX_ROWS) {
      skipped.push({ row, reason: `more than ${OWN_MAX_ROWS} invoices; the rest were not read` });
      break;
    }
    const cells = splitLine(lines[r], sep);
    const status = cell(cells, "status");
    if (status && CLOSED.test(status)) {
      skipped.push({ row, reason: `status "${status}" — nothing left to collect` });
      continue;
    }
    const currency = cell(cells, "currency").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
    const amount = parseAmount(cell(cells, "amount"));
    const due = parseDate(cell(cells, "due"));
    if (!/^[A-Z]{3}$/.test(currency)) skipped.push({ row, reason: `currency "${cell(cells, "currency")}" is not a 3-letter code` });
    else if (!known.has(currency)) skipped.push({ row, reason: `no ECB reference rate for ${currency}` });
    else if (amount == null || amount <= 0) skipped.push({ row, reason: `amount "${cell(cells, "amount")}" is not an amount still owed` });
    else if (!due) skipped.push({ row, reason: `due date "${cell(cells, "due")}" is not a date` });
    else {
      const number = cell(cells, "number") || `Row ${row}`;
      const issued = parseDate(cell(cells, "issued")) ?? due;
      invoices.push({
        id: `own-${row}`,
        number,
        status: "UNPAID",
        currency,
        amountDue: Math.round(amount * 100) / 100,
        dueDate: due,
        invoiceDate: issued,
        recipientName: cell(cells, "client") || undefined,
      });
    }
  }
  return { invoices, skipped, columns };
}

// A small sample a visitor can load to see the format; dates are relative to today so it never goes stale.
export function sampleCsv(today: string): string {
  const d = (n: number) => {
    const t = new Date(`${today}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  return [
    "Invoice number,Client,Currency,Amount due,Due date",
    `INV-104,Studio Nord (Berlin),EUR,4200,${d(-24)}`,
    `INV-107,Hayashi Design,JPY,380000,${d(-6)}`,
    `INV-109,Thames Editorial,GBP,1650,${d(16)}`,
    `INV-110,Studio Nord (Berlin),EUR,6800,${d(54)}`,
    `INV-111,Maple Apps,CAD,3100,${d(32)}`,
    `INV-112,Acme Inc.,USD,2500,${d(19)}`,
  ].join("\n");
}
