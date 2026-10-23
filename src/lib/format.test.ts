import { describe, expect, it } from "vitest";
import demo from "../data/demo-snapshot.json";
import { labelContext, priceDiscount } from "./agent";
import { demoInputs } from "./book";
import { checkClientText, checkSellerText } from "./checks";
import { BASES } from "./fx";
import { compact, money, roundAsShown } from "./format";
import { viewFor } from "./view";

describe("format", () => {
  it("compacts amounts in any home currency", () => {
    expect(compact("KRW", 1_569_607)).toBe("₩1.57M");
    expect(compact("USD", 52_320)).toBe("$52K");
    expect(compact("EUR", 9_800)).toBe("€9,800");
    expect(compact("GBP", -2_000_000)).toBe("-£2.00M");
  });

  it("rounds a number the way compact() shows it, so shown differences add up", () => {
    expect(roundAsShown(103.6)).toBe(104);
    expect(roundAsShown(42.5)).toBe(43);
    expect(compact("USD", roundAsShown(103.6) - roundAsShown(42.5))).toBe("$61");
    expect(roundAsShown(1_569_607)).toBe(1_570_000);
    expect(compact("KRW", roundAsShown(1_569_607))).toBe(compact("KRW", 1_569_607));
  });

  it("uses no decimals for yen", () => {
    expect(money("JPY", 310000)).toBe("JPY 310,000");
    expect(money("USD", 4200)).toBe("USD 4,200.00");
  });
});

describe("demo snapshot", () => {
  it("holds everything the page needs, for every home currency", () => {
    const d = demoInputs();
    expect(d.source).toBe("demo");
    expect(d.invoices.length).toBe((demo as { invoices: unknown[] }).invoices.length);
    expect(JSON.stringify(demo)).not.toMatch(/@personal\.example\.com/); // buyer e-mails stay out
    for (const base of BASES) {
      const v = viewFor(d, base, new Date(d.asOf + "T12:00:00Z"));
      expect(v.exposure.rows.length).toBeGreaterThan(0);
      expect(v.agentInput.candidates.some((c) => c.eligible.length)).toBe(true);
    }
  });

  it("every text the agent wrote in the snapshot still passes today's checks", () => {
    const d = demoInputs();
    for (const base of BASES) {
      const run = d.agentRuns?.[base];
      expect(run, base).toBeDefined();
      const input = viewFor(d, base, new Date(d.asOf + "T12:00:00Z")).agentInput;
      for (const p of run!.proposals) {
        const cand = input.candidates.find((c) => c.invoiceId === p.invoiceId)!;
        if (p.kind === "reminder") {
          expect(checkClientText(p.subject, cand.facts, { maxLen: 120, allowOffer: false }), `${base} ${p.invoiceNumber}`).toBeNull();
          expect(checkClientText(p.message, cand.facts, { maxLen: 900, allowOffer: false }), `${base} ${p.invoiceNumber}`).toBeNull();
          expect(checkSellerText(p.rationale, cand.facts, 450, labelContext(cand, input)), `${base} ${p.invoiceNumber}`).toBeNull();
        } else {
          // The agent may have compared several terms; the rationale can quote any of them.
          const tried = [1, 1.5, 2].flatMap((pct) => [5, 6, 7, 8, 9, 10].map((w) => priceDiscount(cand, base, d.asOf, pct, w)));
          const facts = `${cand.facts} ${tried.map((x) => x.facts).join(" ")}`;
          expect(checkClientText(p.clientNote, facts, { maxLen: 300, allowOffer: true, unconditional: true }), `${base} ${p.invoiceNumber}`).toBeNull();
          expect(checkSellerText(p.rationale, facts, 450, labelContext(cand, input, tried)), `${base} ${p.invoiceNumber}: ${p.rationale}`).toBeNull();
        }
      }
    }
  });
});
