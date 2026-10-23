import { describe, expect, it } from "vitest";
import { appendAgentLog, lastOf, parseAgentLog } from "./agent-log";
import { buildProposals } from "./proposals";
import { parseSeedNumber, seedNumber } from "./seed-data";
import type { Invoice } from "./types";

const AS_OF = "2026-10-23";
const RATES = { USD: 1300, EUR: 1500 };
const inv = (p: Partial<Invoice>): Invoice => ({
  id: p.id ?? "I-1",
  number: p.number ?? "0001",
  status: "SENT",
  currency: p.currency ?? "USD",
  amountDue: p.amountDue ?? 2000,
  dueDate: p.dueDate ?? "2026-10-13",
  invoiceDate: "2026-09-01",
  agentLog: p.agentLog,
});

describe("agent log in the invoice memo", () => {
  it("round-trips and keeps the merchant's own memo lines", () => {
    const m1 = appendAgentLog("Client prefers wire", "reminder", new Date("2026-10-20T01:00:00Z"));
    const m2 = appendAgentLog(m1, "reminder", new Date("2026-10-23T02:00:00Z"));
    expect(m2.split("\n")[0]).toBe("Client prefers wire");
    const log = parseAgentLog(m2);
    expect(log).toHaveLength(2);
    expect(lastOf(log, "reminder")).toBe("2026-10-23T02:00:00.000Z");
    expect(lastOf(log, "early_pay_discount")).toBeNull();
  });

  it("ignores lines that only look similar", () => {
    expect(parseAgentLog("fxa-agent: reminder not-a-date\nfxa-agent: refund 2026-10-23T00:00:00Z")).toEqual([]);
    expect(parseAgentLog(undefined)).toEqual([]);
  });
});

describe("proposals respect what the agent already did", () => {
  const now = new Date("2026-10-23T09:00:00Z");

  it("holds a reminder for 3 days after the last one, then offers it again", () => {
    const recent = inv({ agentLog: [{ kind: "reminder", at: "2026-10-22T09:00:00Z" }] });
    const old = inv({ id: "I-2", agentLog: [{ kind: "reminder", at: "2026-10-19T09:00:00Z" }] });
    const p = buildProposals([recent, old], RATES, AS_OF, { now });
    const r = (id: string) => p.find((x) => x.invoiceId === id)!;
    const held = r("I-1");
    if (held.kind !== "reminder") throw new Error("expected a reminder");
    expect(held.canAct).toBe(false);
    expect(held.lastReminderAt).toBe("2026-10-22T09:00:00Z");
    expect(r("I-2").canAct).toBe(true);
  });

  it("never offers a second discount on the same invoice", () => {
    const far = { currency: "EUR", amountDue: 3000, dueDate: "2026-11-30" };
    const fresh = inv({ ...far, id: "F-1" });
    const taken = inv({ ...far, id: "F-2", agentLog: [{ kind: "early_pay_discount", at: "2026-10-20T00:00:00Z" }] });
    const ids = buildProposals([fresh, taken], RATES, AS_OF, { now }).map((x) => x.invoiceId);
    expect(ids).toEqual(["F-1"]);
  });
});

describe("seed generations", () => {
  it("numbers each reset as a new generation PayPal will accept", () => {
    expect(seedNumber("FXA-1001", 1)).toBe("FXA-1001");
    expect(seedNumber("FXA-1001", 3)).toBe("FXA-1001-r3");
    expect(parseSeedNumber("FXA-1001-r3")).toEqual({ base: "FXA-1001", gen: 3 });
    expect(parseSeedNumber("FXA-1001")).toEqual({ base: "FXA-1001", gen: 1 });
    expect(parseSeedNumber("CHK-ABC-R")).toBeNull();
  });
});
