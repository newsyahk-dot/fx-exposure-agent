import { describe, expect, it } from "vitest";
import { autoResetReason } from "./auto-reset";
import type { Invoice } from "./types";

const now = new Date("2026-11-09T12:00:00Z");
const inv = (o: Partial<Invoice>): Invoice => ({
  id: o.number ?? "x", number: "x", status: "SENT", currency: "EUR", amountDue: 100, dueDate: "2026-12-01", invoiceDate: "2026-10-01",
  updatedAt: "2026-11-09T08:00:00Z", ...o,
});
const book = (invoices: Invoice[], startedAt = "2026-11-09T00:07:00Z") => ({ startedAt, asOf: "2026-11-09", invoices });

describe("automatic demo reset", () => {
  it("resets a quiet book with no late money from abroad left", () => {
    const b = book([inv({ number: "a", currency: "EUR", status: "PAID", amountDue: 0 }), inv({ number: "b", currency: "USD", dueDate: "2026-11-01" })]);
    expect(autoResetReason(b, now)).toMatch(/no late invoice from abroad/);
  });
  it("keeps the book while a foreign invoice is still late", () => {
    expect(autoResetReason(book([inv({ dueDate: "2026-11-01" })]), now)).toBeNull();
  });
  it("never resets in the middle of someone's demo", () => {
    const b = book([inv({ status: "PAID", amountDue: 0, updatedAt: "2026-11-09T11:50:00Z" })]);
    expect(autoResetReason(b, now)).toBeNull();
    const logged = book([inv({ updatedAt: "2026-11-09T08:00:00Z", agentLog: [{ kind: "reminder", at: "2026-11-09T11:45:00Z" }] })]);
    expect(autoResetReason(logged, now)).toBeNull();
  });
  it("never resets a book younger than an hour, or a real seller's book", () => {
    expect(autoResetReason(book([inv({})], "2026-11-09T11:30:00Z"), now)).toBeNull();
    expect(autoResetReason({ startedAt: undefined, asOf: "2026-11-09", invoices: [inv({})] }, now)).toBeNull();
  });
});
