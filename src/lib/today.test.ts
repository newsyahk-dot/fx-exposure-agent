import { describe, expect, it } from "vitest";
import { paidToday, startOfDayValue } from "./today";
import type { Invoice } from "./types";

const inv = (id: string, currency: string, pays: { date: string; amount: number }[]): Invoice => ({
  id, number: id, status: "MARKED_AS_PAID", currency, amountDue: 0, dueDate: "2026-10-20", invoiceDate: "2026-09-20", payments: pays,
});

describe("today", () => {
  it("counts only payments dated today, valued at today's rate", () => {
    const book = [inv("a", "EUR", [{ date: "2026-10-26", amount: 1000 }, { date: "2026-10-01", amount: 500 }]), inv("b", "USD", [{ date: "2026-10-26", amount: 200 }]), inv("c", "JPY", [])];
    const p = paidToday(book, { EUR: 1.1, JPY: 0.0066 }, "USD", "2026-10-26");
    expect(p.map((x) => [x.invoice.id, x.amount, x.value])).toEqual([["a", 1000, 1100], ["b", 200, 200]]);
    // only foreign payments add back to the foreign exposure
    expect(startOfDayValue(5000, p, "USD")).toBe(6100);
  });
});
