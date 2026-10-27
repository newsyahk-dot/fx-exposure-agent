import { describe, expect, it } from "vitest";
import { parseAmount, parseDate, parseOwnInvoices, sampleCsv } from "./own-invoices";

const known = new Set(["USD", "EUR", "GBP", "JPY", "CAD"]);

describe("reading a pasted invoice list", () => {
  it("finds columns by header name and reads the sample", () => {
    const r = parseOwnInvoices(sampleCsv("2026-10-27"), known);
    expect(r.skipped).toEqual([]);
    expect(r.invoices).toHaveLength(6);
    expect(r.invoices[0]).toMatchObject({ number: "INV-104", currency: "EUR", amountDue: 4200, dueDate: "2026-10-03", recipientName: "Studio Nord (Berlin)" });
    expect(r.columns).toMatchObject({ amount: "Amount due", due: "Due date", currency: "Currency" });
  });

  it("handles a PayPal-style export: quoted cells, US dates, symbols, paid rows", () => {
    const csv = [
      "Invoice Number,Recipient,Status,Invoice Date,Due Date,Currency,Total,Amount Due",
      '"0042","Hollis & Grey, London",Sent,10/01/2026,10/11/2026,GBP,"2,100.00","£2,100.00"',
      '"0043",Kleinfeld GmbH,Paid,10/02/2026,11/30/2026,EUR,"5,000.00",0.00',
      '"0044",Sakura,Unpaid,10/03/2026,12/23/2026,JPY,"760,000","¥760,000"',
    ].join("\n");
    const r = parseOwnInvoices(csv, known);
    expect(r.invoices.map((i) => [i.number, i.recipientName, i.amountDue, i.dueDate])).toEqual([
      ["0042", "Hollis & Grey, London", 2100, "2026-10-11"],
      ["0044", "Sakura", 760000, "2026-12-23"],
    ]);
    expect(r.skipped).toEqual([{ row: 3, reason: 'status "Paid" — nothing left to collect' }]);
    expect(r.columns.amount).toBe("Amount Due"); // "Amount Due" wins over "Total"
  });

  it("never drops a row silently", () => {
    const csv = ["Currency;Amount;Due", "XYZ;10;2026-11-01", "EUR;abc;2026-11-01", "EUR;10;someday", "EUR;10;2026-11-01"].join("\n");
    const r = parseOwnInvoices(csv, known);
    expect(r.invoices).toHaveLength(1);
    expect(r.skipped.map((s) => s.row)).toEqual([2, 3, 4]);
    expect(r.skipped[0].reason).toMatch(/no ECB reference rate for XYZ/);
  });

  it("says which columns are missing", () => {
    const r = parseOwnInvoices("Client,Total\nA,10", known);
    expect(r.invoices).toEqual([]);
    expect(r.skipped[0].reason).toMatch(/no column for currency, due/);
  });

  it("reads amounts and dates in common formats", () => {
    expect(parseAmount("€1.234,56")).toBe(1234.56);
    expect(parseAmount("1,234.56")).toBe(1234.56);
    expect(parseAmount("JPY 310,000")).toBe(310000);
    expect(parseAmount("(250.00)")).toBe(-250);
    expect(parseAmount("n/a")).toBeNull();
    expect(parseDate("2026-11-30")).toBe("2026-11-30");
    expect(parseDate("11/30/2026")).toBe("2026-11-30");
    expect(parseDate("30/11/2026")).toBe("2026-11-30");
    expect(parseDate("30.11.2026")).toBe("2026-11-30");
    expect(parseDate("Nov 30, 2026")).toBe("2026-11-30");
    expect(parseDate("2026-02-30")).toBeNull();
  });
});
