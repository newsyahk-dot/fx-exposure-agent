import { afterEach, describe, expect, it, vi } from "vitest";
import {
  annualCostPct,
  buildAgentInput,
  discountNoteTemplate,
  labelContext,
  OFFER_MAX_ANNUAL_PCT,
  OFFER_MIN_DAYS_SOONER,
  priceDiscount,
  rationaleTemplate,
  reminderTemplate,
  rulesRun,
  runAgent,
  type AgentInput,
} from "./agent";
import { appendAgentLog, lastOf, parseAgentLog } from "./agent-log";
import { checkClientText, checkSellerText } from "./checks";
import { computeExposure } from "./exposure";
import { BASES, ratesFor, volsFor } from "./fx";
import { addDays, parseSeedNumber, seedNumber } from "./seed-data";
import { DAY, SEED_BOOK, syntheticEcb } from "./test-fixtures";
import type { Invoice } from "./types";

const NOW = new Date(DAY + "T09:00:00Z");
const ecb = syntheticEcb();

function inputFor(base: string, book: Invoice[] = SEED_BOOK): AgentInput {
  const ccys = ["USD", "EUR", "JPY", "GBP", "KRW"];
  const rates = ratesFor(ecb, base, ccys);
  const vols = volsFor(ecb, base, ccys, addDays(DAY, -120), DAY);
  return buildAgentInput(book, rates, vols, computeExposure(book, rates, DAY, { base }), base, DAY, NOW);
}

describe("agent log in the invoice memo", () => {
  it("round-trips and keeps the merchant's own memo lines", () => {
    const m1 = appendAgentLog("Client prefers wire", "reminder", new Date("2026-10-20T01:00:00Z"));
    const m2 = appendAgentLog(m1, "archived", new Date("2026-10-23T02:00:00Z"));
    expect(m2.split("\n")[0]).toBe("Client prefers wire");
    const log = parseAgentLog(m2);
    expect(log.map((e) => e.kind)).toEqual(["reminder", "archived"]);
    expect(lastOf(log, "reminder")).toBe("2026-10-20T01:00:00.000Z");
  });

  it("ignores lines that only look similar", () => {
    expect(parseAgentLog("fxa-agent: reminder not-a-date\nfxa-agent: refund 2026-10-23T00:00:00Z")).toEqual([]);
    expect(parseAgentLog(undefined)).toEqual([]);
  });
});

describe("what code lets the agent do", () => {
  it("holds a reminder for 3 days after the last one", () => {
    const late = SEED_BOOK.find((i) => i.number === "FXA-1001")!;
    const recent = { ...late, agentLog: [{ kind: "reminder" as const, at: "2026-10-22T09:00:00Z" }] };
    const c = inputFor("KRW", [recent]).candidates[0];
    expect(c.eligible).toEqual([]);
    expect(c.notEligible[0]).toMatch(/reminder was sent on 2026-10-22/);
    const old = { ...late, agentLog: [{ kind: "reminder" as const, at: "2026-10-19T09:00:00Z" }] };
    expect(inputFor("KRW", [old]).candidates[0].eligible).toEqual(["reminder"]);
  });

  it("never offers a second discount, nor one on an invoice due soon", () => {
    const far = SEED_BOOK.find((i) => i.number === "FXA-1004")!;
    const taken = { ...far, agentLog: [{ kind: "early_pay_discount" as const, at: "2026-10-20T00:00:00Z" }] };
    expect(inputFor("KRW", [taken]).candidates[0].notEligible[0]).toMatch(/already sent/);
    const soon = SEED_BOOK.find((i) => i.number === "FXA-2003")!;
    expect(inputFor("KRW", [soon]).candidates[0].notEligible[0]).toMatch(/too soon/);
  });

  it("leaves invoices in the home currency out: they carry no FX risk", () => {
    const usdHome = inputFor("USD");
    expect(usdHome.candidates.some((c) => c.currency === "USD")).toBe(false);
    expect(usdHome.candidates.some((c) => c.currency === "EUR")).toBe(true);
  });

  it("prices discounts in code: the swing shrinks with a shorter window, cost grows with the percent", () => {
    const c = inputFor("USD").candidates.find((x) => x.invoiceNumber === "FXA-2005")!;
    const a = priceDiscount(c, "USD", DAY, 1, 7);
    const b = priceDiscount(c, "USD", DAY, 2, 5);
    expect(a.swingIfEarly!).toBeLessThan(a.swingNow!);
    expect(b.cost).toBeCloseTo(a.cost * 2);
    expect(b.swingIfEarly!).toBeLessThan(a.swingIfEarly!);
    expect(a.newDueDate).toBe("2026-10-30");
  });
});

describe("fixed wording passes the same checks as the agent, in every home currency", () => {
  for (const base of BASES) {
    it(base, () => {
      const input = inputFor(base);
      expect(input.candidates.some((c) => c.eligible.length)).toBe(true);
      for (const c of input.candidates) {
        if (c.eligible.includes("reminder")) {
          const t = reminderTemplate(c);
          expect(checkClientText(t.subject, c.facts, { maxLen: 120, allowOffer: false }), t.subject).toBeNull();
          expect(checkClientText(t.message, c.facts, { maxLen: 900, allowOffer: false }), t.message).toBeNull();
          expect(checkSellerText(rationaleTemplate(c, base), c.facts, 450, labelContext(c, input)), rationaleTemplate(c, base)).toBeNull();
        }
        if (c.eligible.includes("early_pay_discount")) {
          const p = priceDiscount(c, base, DAY, 1.5, 7);
          const facts = `${c.facts} ${p.facts}`;
          expect(checkClientText(discountNoteTemplate(p), facts, { maxLen: 300, allowOffer: true, unconditional: true })).toBeNull();
          expect(checkSellerText(rationaleTemplate(c, base, p), facts, 450, labelContext(c, input, [p])), rationaleTemplate(c, base, p)).toBeNull();
        }
      }
    });
  }
});

describe("rules fallback", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("proposes every eligible action with fixed wording, reminders first", () => {
    const r = rulesRun(inputFor("KRW"), "test");
    expect(r.source).toBe("rules");
    expect(r.proposals.filter((p) => p.kind === "reminder")).toHaveLength(5);
    expect(r.proposals[0].kind).toBe("reminder");
    // Every candidate is either proposed or listed with a reason; offers only within the app's rule.
    const input = inputFor("KRW");
    const seen = new Set([...r.proposals.map((p) => p.invoiceNumber), ...r.notProposed.map((n) => n.invoiceNumber)]);
    expect(input.candidates.every((c) => seen.has(c.invoiceNumber))).toBe(true);
    const offers = r.proposals.filter((p) => p.kind === "early_pay_discount");
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      const cand = input.candidates.find((c) => c.invoiceId === o.invoiceId)!;
      expect(priceDiscount(cand, input.base, input.asOf, o.percent, o.withinDays).withinRule).toBe(true);
    }
  });

  it("prices an offer's cost as a yearly rate and keeps only terms within the rule", () => {
    expect(annualCostPct(1, 49)).toBe(7.5); // 1/99 × 365/49
    expect(annualCostPct(2, 30)).toBe(24.8);
    expect(annualCostPct(1, 0)).toBe(Infinity);
    const input = inputFor("USD");
    const far = input.candidates.find((c) => c.eligible.includes("early_pay_discount"))!;
    const p = priceDiscount(far, input.base, input.asOf, 1, 7);
    expect(p.daysSooner).toBe((far.daysToDue ?? 0) - 7);
    expect(p.withinRule).toBe(p.daysSooner >= OFFER_MIN_DAYS_SOONER && p.annualPct <= OFFER_MAX_ANNUAL_PCT);
    expect(p.facts).toContain(`about ${p.annualPct}%`);
  });

  it("is what runs without an API key — never an exception", async () => {
    vi.stubEnv("FXA_ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const r = await runAgent(inputFor("USD"));
    expect(r.source).toBe("rules");
    expect(r.reason).toBe("no API key");
  });
});

describe("seed generations", () => {
  it("numbers each reset as a new generation PayPal will accept", () => {
    expect(seedNumber("FXA-1001", 1)).toBe("FXA-1001");
    expect(seedNumber("FXA-1001", 3)).toBe("FXA-1001-r3");
    expect(parseSeedNumber("FXA-1001-r3")).toEqual({ base: "FXA-1001", gen: 3 });
    expect(parseSeedNumber("CHK-ABC-R")).toBeNull();
  });
});
