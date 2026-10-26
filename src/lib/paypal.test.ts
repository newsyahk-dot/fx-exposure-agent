import { describe, expect, it } from "vitest";
import { computeExposure } from "./exposure";
import { cleanCredential, sandboxBase, toInvoice, type PPInvoice } from "./paypal";
import { buildAgentInput } from "./agent";
import { ratesFor, volsFor } from "./fx";
import { DAY, SEED_BOOK, syntheticEcb } from "./test-fixtures";
import { addDays, draftBody, SEED_INVOICES } from "./seed-data";
import type { Invoice } from "./types";

describe("PayPal client guards", () => {
  it("refuses any host but the sandbox", () => {
    expect(sandboxBase(undefined)).toBe("https://api-m.sandbox.paypal.com");
    expect(() => sandboxBase("https://api-m.paypal.com")).toThrow(/non-sandbox/);
  });

  it("strips wrappers pasted around credentials", () => {
    expect(cleanCredential("(abc)")).toBe("abc");
    expect(cleanCredential(' "abc" ')).toBe("abc");
    expect(cleanCredential("<(abc)>")).toBe("abc");
    expect(cleanCredential("ab(c)")).toBe("ab(c)");
    expect(cleanCredential(undefined)).toBe("");
  });
});

describe("toInvoice", () => {
  const base: PPInvoice = {
    id: "INV2-1",
    status: "PARTIALLY_PAID",
    detail: { invoice_number: "FXA-1006", currency_code: "USD", invoice_date: "2026-09-01", payment_term: { due_date: "2026-10-01" } },
    amount: { currency_code: "USD", value: "3000.00" },
    due_amount: { currency_code: "USD", value: "1800.00" },
  };

  it("uses the amount still due, not the invoice total", () => {
    const r = toInvoice(base);
    expect("invoice" in r && r.invoice.amountDue).toBe(1800);
    expect("invoice" in r && r.invoice.dueDate).toBe("2026-10-01");
  });

  it("falls back to total minus paid when due_amount is missing", () => {
    const r = toInvoice({ ...base, due_amount: undefined, payments: { paid_amount: { currency_code: "USD", value: "1200.00" } } });
    expect("invoice" in r && r.invoice.amountDue).toBe(1800);
  });

  it("reports an invoice it cannot read instead of dropping it", () => {
    const r = toInvoice({ ...base, detail: { ...base.detail, currency_code: "" }, amount: undefined });
    expect(r).toEqual({ skipped: { id: "INV2-1", reason: "no currency" } });
  });
});

describe("seed book", () => {
  const day = "2026-10-23";
  const RATES = { USD: 1400, EUR: 1600, GBP: 1850, JPY: 9 };
  // What the sandbox holds right after seeding.
  const book: Invoice[] = SEED_INVOICES.map((s) => ({
    id: s.number,
    number: s.number,
    status: s.outcome.kind === "open" ? "SENT" : s.outcome.kind === "paid" ? "MARKED_AS_PAID" : "PARTIALLY_PAID",
    currency: s.currency,
    amountDue: s.outcome.kind === "open" ? s.amount : s.outcome.kind === "paid" ? 0 : s.amount - s.outcome.paid,
    dueDate: addDays(day, s.dueOffset),
    invoiceDate: addDays(day, s.issueOffset),
  }));

  it("has 20-24 invoices in USD, EUR, GBP and JPY with paid and overdue ones", () => {
    expect(SEED_INVOICES.length).toBeGreaterThanOrEqual(20);
    expect(SEED_INVOICES.length).toBeLessThanOrEqual(24);
    expect(new Set(SEED_INVOICES.map((s) => s.currency))).toEqual(new Set(["USD", "EUR", "GBP", "JPY"]));
    expect(SEED_INVOICES.filter((s) => s.outcome.kind === "paid").length).toBeGreaterThan(0);
    expect(new Set(SEED_INVOICES.map((s) => s.number)).size).toBe(SEED_INVOICES.length);
    for (const s of SEED_INVOICES) expect(s.issueOffset).toBeLessThan(s.dueOffset);
  });

  it("gives the agent both kinds of action in every foreign currency (KRW home)", () => {
    const ecb = syntheticEcb();
    const ccys = ["USD", "EUR", "GBP", "JPY", "KRW"];
    const rates = ratesFor(ecb, "KRW", ccys);
    const vols = volsFor(ecb, "KRW", ccys, addDays(DAY, -120), DAY);
    const input = buildAgentInput(SEED_BOOK, rates, vols, computeExposure(SEED_BOOK, rates, DAY), "KRW", DAY, new Date(DAY + "T09:00:00Z"));
    for (const ccy of ["USD", "EUR", "GBP", "JPY"]) {
      expect(input.candidates.some((x) => x.eligible.includes("reminder") && x.currency === ccy)).toBe(true);
      expect(input.candidates.some((x) => x.eligible.includes("early_pay_discount") && x.currency === ccy)).toBe(true);
    }
    const small = input.candidates.find((x) => x.invoiceNumber === "FXA-1007")!;
    expect(small.eligible).toEqual([]);
    expect(small.notEligible[0]).toMatch(/threshold/);
  });

  it("fills overdue, near weeks and later in the exposure table", () => {
    const e = computeExposure(book, RATES, day);
    expect(e.skipped).toEqual([]);
    const usd = e.rows.find((r) => r.currency === "USD")!;
    expect(usd.buckets.overdue).toBe(4200 + 1800);
    expect(usd.buckets.later).toBe(6500);
  });

  it("builds a draft PayPal accepts: JPY without decimals, dates from offsets", () => {
    const b = draftBody(SEED_INVOICES.find((s) => s.currency === "JPY")!, day, "buyer@example.com");
    expect(b.items[0].unit_amount.value).toMatch(/^\d+$/);
    expect(b.detail.payment_term.due_date).toBe("2026-10-15");
  });
});
