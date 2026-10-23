import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkSellerText } from "./checks";
import { compact } from "./format";
import { oneSigma, ratesFor, volsFor } from "./fx";
import {
  clientHistory,
  comparisonTemplate,
  draftsFor,
  historyFact,
  parseByRules,
  parseRequest,
  planOptions,
  sigmaOfParts,
  validateRequest,
  writeComparison,
  type InvoiceRequest,
} from "./invoice-plan";
import { addDays } from "./seed-data";
import { SEED_BOOK, walkEcb } from "./test-fixtures";
import type { Invoice } from "./types";

const asOf = "2026-10-23";
const ecb = walkEcb(asOf, 830);
const ctxFor = (base: string) => ({
  base,
  asOf,
  ecb,
  rates: ratesFor(ecb, base, ["USD", "EUR", "GBP", "JPY", "KRW"]),
  vols: volsFor(ecb, base, ["USD", "EUR", "GBP", "JPY", "KRW"], addDays(asOf, -120), asOf),
});
const req: InvoiceRequest = { client: "Sakura Games", currency: "JPY", amount: 500_000, termsDays: 45, item: "Game UI" };
const noHistory = clientHistory([], "Sakura Games");

describe("validateRequest", () => {
  it("accepts a sane request and rounds JPY", () => {
    expect(validateRequest({ client: " Sakura Games ", currency: "jpy", amount: 500000.4, termsDays: 45 })).toMatchObject({
      client: "Sakura Games",
      currency: "JPY",
      amount: 500000,
      item: "Services",
    });
  });
  it("rejects KRW (PayPal does not invoice in it), missing fields and odd terms", () => {
    expect(validateRequest({ client: "A", currency: "KRW", amount: 1, termsDays: 30 })).toMatch(/Currency/);
    expect(validateRequest({ client: "", currency: "USD", amount: 1, termsDays: 30 })).toMatch(/Who/);
    expect(validateRequest({ client: "A", currency: "USD", amount: 0, termsDays: 30 })).toMatch(/Amount/);
    expect(validateRequest({ client: "A", currency: "USD", amount: 10, termsDays: 3 })).toMatch(/terms/);
  });
});

describe("parseByRules", () => {
  it("reads client, amount, currency and terms", () => {
    expect(parseByRules("Bill Sakura Games ¥500,000 for the game UI, net 45", ["Sakura Games", "Brightline Media"])).toMatchObject({
      client: "Sakura Games",
      currency: "JPY",
      amount: 500000,
      termsDays: 45,
      item: "the game UI",
    });
    expect(parseByRules("Invoice Brightline Media 4.5k usd, 60 days", ["Brightline Media"])).toMatchObject({ amount: 4500, currency: "USD", termsDays: 60 });
  });
  it("falls back to the rules without a key", async () => {
    const saved = process.env.FXA_ANTHROPIC_API_KEY;
    const savedA = process.env.ANTHROPIC_API_KEY;
    delete process.env.FXA_ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const r = await parseRequest("Bill Sakura Games ¥500,000", ["Sakura Games"], "USD", asOf);
      expect(r.by).toBe("rules");
      expect(r.fields.amount).toBe(500000);
    } finally {
      if (saved) process.env.FXA_ANTHROPIC_API_KEY = saved;
      if (savedA) process.env.ANTHROPIC_API_KEY = savedA;
    }
  });
});

describe("clientHistory", () => {
  it("averages days late over fully paid invoices", () => {
    const inv = (due: string, paid: string): Invoice => ({
      id: due, number: due, status: "PAID", currency: "JPY", amountDue: 0, dueDate: due, invoiceDate: addDays(due, -30),
      recipientName: "Sakura Games", payments: [{ date: paid, amount: 1 }],
    });
    const h = clientHistory([inv("2026-08-01", "2026-08-11"), inv("2026-09-01", "2026-08-30")], "sakura games");
    expect(h).toMatchObject({ known: true, paid: 2, avgDaysLate: 5 }); // 10 and 0 (early counts as 0)
    expect(historyFact(h)).toMatch(/5 days after the due date/);
  });
  it("knows the seed clients", () => {
    expect(clientHistory(SEED_BOOK, "Sakura Games").known).toBe(true);
  });
});

describe("planOptions", () => {
  it("one part matches the single-invoice swing", () => {
    expect(sigmaOfParts([1000], [20], 0.006)).toBeCloseTo(oneSigma(1000, 0.006, 20), 9);
  });
  it("offers four options; the home-currency one has no swing; shorter and split are narrower", () => {
    const o = planOptions(req, noHistory, ctxFor("USD"));
    expect(o.map((x) => x.id)).toEqual(["as_asked", "home_currency", "shorter_terms", "split"]);
    const by = Object.fromEntries(o.map((x) => [x.id, x]));
    expect(by.home_currency.swing).toBe(0);
    expect(by.home_currency.parts[0].currency).toBe("USD");
    expect(by.shorter_terms.swing!).toBeLessThan(by.as_asked.swing!);
    expect(by.split.swing!).toBeLessThan(by.as_asked.swing!);
    expect(by.split.parts.reduce((s, p) => s + p.amount, 0)).toBe(500000);
    expect(by.as_asked.range!.n).toBeGreaterThan(400);
  });
  it("late payers wait longer", () => {
    const late = { ...noHistory, known: true, paid: 3, avgDaysLate: 20 };
    expect(planOptions(req, late, ctxFor("USD"))[0].swing!).toBeGreaterThan(planOptions(req, noHistory, ctxFor("USD"))[0].swing!);
  });
  it("in the home currency there is nothing to compare; KRW sellers get no KRW invoice", () => {
    expect(planOptions({ ...req, currency: "USD", amount: 4000 }, noHistory, ctxFor("USD")).map((x) => x.id)).toEqual(["as_asked"]);
    expect(planOptions(req, noHistory, ctxFor("KRW")).map((x) => x.id)).not.toContain("home_currency");
  });
  it("the template comparison passes the seller checks", () => {
    for (const base of ["USD", "EUR", "GBP", "KRW"]) {
      const o = planOptions(req, noHistory, ctxFor(base));
      const facts = [historyFact(noHistory), ...o.map((x) => x.facts)].join(" ");
      const swings = o.flatMap((x) => (x.swing ? [compact(base, x.swing)] : []));
      expect(checkSellerText(comparisonTemplate(o, base), facts, 600, { stress: [], swings, others: [] })).toBeNull();
    }
  });
});

describe("writeComparison without a key", () => {
  let saved: (string | undefined)[] = [];
  beforeEach(() => {
    saved = [process.env.FXA_ANTHROPIC_API_KEY, process.env.ANTHROPIC_API_KEY];
    delete process.env.FXA_ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (saved[0]) process.env.FXA_ANTHROPIC_API_KEY = saved[0];
    if (saved[1]) process.env.ANTHROPIC_API_KEY = saved[1];
  });
  it("uses the template", async () => {
    const o = planOptions(req, noHistory, ctxFor("USD"));
    expect((await writeComparison(req, noHistory, o, "USD")).by).toBe("rules");
  });
});

describe("draftsFor", () => {
  it("builds one PayPal draft per part with unique numbers and a created log", () => {
    const split = planOptions(req, noHistory, ctxFor("USD")).find((x) => x.id === "split")!;
    const d = draftsFor(req, split, "buyer@example.com", asOf, "AB12", new Date("2026-10-23T01:00:00Z"));
    expect(d).toHaveLength(2);
    expect(new Set(d.map((x) => x.detail.invoice_number)).size).toBe(2);
    expect(d[0].items[0].unit_amount).toEqual({ currency_code: "JPY", value: "250000" });
    expect(d[0].detail.memo).toMatch(/^fxa-agent: created 2026-10-23T01:00:00.000Z$/m);
    expect(d[1].detail.payment_term.due_date).toBe(addDays(asOf, 45));
  });
});
