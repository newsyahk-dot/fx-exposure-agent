import { describe, expect, it } from "vitest";
import { attachOffers, isOfferNumber, offerAmount, offerMemoLine, offerNumber, originalNumber, parseOfferMemo } from "./offer-invoice";
import type { Invoice } from "./types";

const inv = (o: Partial<Invoice>): Invoice => ({
  id: "INV-1",
  number: "FXA-2005-r3",
  status: "SENT",
  currency: "EUR",
  amountDue: 5000,
  dueDate: "2026-12-25",
  invoiceDate: "2026-10-20",
  ...o,
});

describe("offer invoices", () => {
  it("names and memo round-trip", () => {
    expect(offerNumber("FXA-2005-r3")).toBe("FXA-2005-r3-EP");
    expect(isOfferNumber("FXA-2005-r3-EP")).toBe(true);
    expect(isOfferNumber("FXA-2005-r3")).toBe(false);
    expect(originalNumber("FXA-2005-r3-EP")).toBe("FXA-2005-r3");
    expect(parseOfferMemo(`note\n${offerMemoLine("INV-1", 1.5)}`)).toEqual({ originalId: "INV-1", percent: 1.5 });
    expect(parseOfferMemo("nothing here")).toBeNull();
  });

  it("rounds the offer amount like PayPal does", () => {
    expect(offerAmount(5000, 1, "EUR")).toBe(4950);
    expect(offerAmount(3800, 1.5, "GBP")).toBe(3743);
    expect(offerAmount(760000, 1, "JPY")).toBe(752400);
    expect(offerAmount(1234.56, 1, "USD")).toBe(1222.21);
  });

  const offer = (o: Partial<Invoice>) =>
    inv({ id: "OFF-1", number: "FXA-2005-r3-EP", amountDue: 4950, total: 4950, dueDate: "2026-11-01", offerFor: { originalId: "INV-1", percent: 1 }, ...o });

  it("takes offers out of the book and attaches them to their original", () => {
    const out = attachOffers([inv({}), offer({})], "2026-10-28");
    expect(out).toHaveLength(1);
    expect(out[0].offer).toMatchObject({ state: "open", amount: 4950, dueDate: "2026-11-01", percent: 1 });
    expect(out[0].amountDue).toBe(5000); // the original is unchanged until the offer is paid
  });

  it("a paid offer settles the original, counting what was actually received", () => {
    const out = attachOffers([inv({}), offer({ status: "PAID", amountDue: 0, payments: [{ date: "2026-10-30", amount: 4950 }] })], "2026-10-30");
    expect(out[0]).toMatchObject({ status: "PAID", amountDue: 0, payments: [{ date: "2026-10-30", amount: 4950 }] });
    expect(out[0].offer?.state).toBe("paid");
  });

  it("an offer past its date has lapsed and the original applies", () => {
    const out = attachOffers([inv({}), offer({})], "2026-11-02");
    expect(out[0].offer?.state).toBe("expired");
    expect(out[0].amountDue).toBe(5000);
    expect(out[0].status).toBe("SENT");
  });

  it("finds the original by number when the memo is missing", () => {
    const out = attachOffers([inv({}), offer({ offerFor: undefined })], "2026-10-28");
    expect(out).toHaveLength(1);
    expect(out[0].offer?.number).toBe("FXA-2005-r3-EP");
  });
});
