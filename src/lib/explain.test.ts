import { afterEach, describe, expect, it, vi } from "vitest";
import demo from "../data/demo-snapshot.json";
import { explain, factsFor, gate } from "./explain";
import { buildProposals } from "./proposals";
import type { Invoice } from "./types";

const d = demo as unknown as { invoices: Invoice[]; rates: Record<string, number>; asOf: string; dailyVols: Record<string, number | null> };
const proposals = buildProposals(d.invoices, d.rates, d.asOf, { dailyVols: d.dailyVols, now: new Date(d.asOf + "T12:00:00Z") });

describe("explanation gate", () => {
  it("passes our own template sentence for every proposal in the demo book", () => {
    expect(proposals.length).toBeGreaterThan(5);
    for (const p of proposals) {
      const f = factsFor(p);
      expect(gate(f.template, f.facts), f.template).toBeNull();
    }
  });

  it("rejects a figure that is not in the facts", () => {
    const f = factsFor(proposals.find((p) => p.kind === "reminder")!);
    expect(gate("Chasing this could recover ₩9.99M sooner.", f.facts)).toMatch(/numbers not in the facts: 9.99/);
  });

  it("rejects forecasts and advice", () => {
    const facts = "Discount costs about ₩86K.";
    expect(gate("The won will strengthen, so act now.", facts)).toMatch(/forecast or advice/);
    expect(gate("Rates are likely to move against you.", facts)).toMatch(/forecast or advice/);
    expect(gate("You should approve this.", facts)).toMatch(/forecast or advice/);
    expect(gate("The ₩86K discount is worth it.", facts)).toMatch(/forecast or advice/);
    expect(gate("The discount costs about ₩86K and shortens how long this money is exposed.", facts)).toBeNull();
  });
});

describe("explain without a key", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("falls back to the template for every proposal and never throws", async () => {
    vi.stubEnv("FXA_ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const facts = proposals.map(factsFor);
    const out = await explain(facts);
    expect(Object.keys(out).sort()).toEqual(facts.map((f) => f.key).sort());
    expect(Object.values(out).every((e) => e.source === "template" && e.reason === "no API key")).toBe(true);
  });
});
