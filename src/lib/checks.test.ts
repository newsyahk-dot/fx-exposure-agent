import { describe, expect, it } from "vitest";
import { checkClientText, checkSellerText, unaskedDirectionNote, type LabelContext } from "./checks";

const facts = "Invoice FXA-1001-r4 for Brightline Media: USD 4,200.00 still owed, worth about €3.75M. Due date 2026-10-10. It is 13 days overdue. Discount costs about ₩86K.";

describe("checks on model text", () => {
  it("rejects a figure that is not in the facts", () => {
    expect(checkSellerText("Chasing this could recover ₩9.99M sooner.", facts)).toMatch(/numbers not in the facts: 9.99/);
  });

  it("rejects forecasts and advice", () => {
    expect(checkSellerText("The won will strengthen, so act now.", facts)).toMatch(/forecast or advice/);
    expect(checkSellerText("Rates are likely to move against you.", facts)).toMatch(/forecast or advice/);
    expect(checkSellerText("You should approve this.", facts)).toMatch(/forecast or advice/);
    expect(checkSellerText("The ₩86K discount is worth it.", facts)).toMatch(/forecast or advice/);
    expect(checkSellerText("The discount costs about ₩86K and shortens how long this money is exposed.", facts)).toBeNull();
  });

  it("keeps client e-mails free of links and of offers nobody approved", () => {
    const ok = "Hello Brightline Media, invoice FXA-1001-r4 for USD 4,200.00 was due on 2026-10-10, 13 days ago. Thank you!";
    expect(checkClientText(ok, facts, { maxLen: 900, allowOffer: false })).toBeNull();
    expect(checkClientText(ok + " Pay at https://evil.example", facts, { maxLen: 900, allowOffer: false })).toMatch(/link/);
    expect(checkClientText("Pay now and get a discount!", facts, { maxLen: 900, allowOffer: false })).toMatch(/offers a discount/);
    expect(checkClientText(ok, facts, { maxLen: 40, allowOffer: false })).toMatch(/too long/);
  });

  it("does not let a note make an unconditional discount sound conditional", () => {
    const f = facts + " Offer: 1% off, new due date 2026-11-02.";
    const o = { maxLen: 300, allowOffer: true, unconditional: true };
    expect(checkClientText("We are offering 1% off if it is paid within 10 days.", f, o)).toMatch(/conditional/);
    expect(checkClientText("A 1% discount has been applied; the new due date is 2026-11-02.", f, o)).toBeNull();
  });

  it("keeps each figure under the label it was computed with, and each reason about its own invoice", () => {
    const f = "Invoice FXA-1001: worth about $2,017. A 3% stress-test move changes it by about $61. Typical swing about $104, if early about $43, a reduction of about $61x.";
    const reminder: LabelContext = { stress: ["$61"], swings: [], others: ["FXA-2001", "Atelier Moreau"] };
    expect(checkSellerText("The typical swing on it is about $61.", f, 450, reminder)).toMatch(/no swing figure/);
    expect(checkSellerText("A 3% stress-test move changes it by about $61.", f, 450, reminder)).toBeNull();
    expect(checkSellerText("It is the longest overdue after Atelier Moreau's invoice.", f, 450, reminder)).toMatch(/Atelier Moreau/);
    const offer: LabelContext = { stress: ["$61"], swings: ["$104", "$43"], others: [] };
    expect(checkSellerText("The typical swing is about $61 here.", f, 450, offer)).toMatch(/stress-test figure/);
    expect(checkSellerText("The 3% stress-test move would be about $104.", f, 450, offer)).toMatch(/typical-swing figure/);
    expect(checkSellerText("The typical swing falls from about $104 to about $43.", f, 450, offer)).toBeNull();
  });

  it("rejects treating a swing or a discount as money gained", () => {
    const f = "Cost about $56, reduction about $61.";
    expect(checkSellerText("The offer pays for itself.", f)).toMatch(/money gained/);
    expect(checkSellerText("The cost exceeds the benefit.", f)).toMatch(/money gained/);
    expect(checkSellerText("The discount is a cost only if the client pays early.", f)).toMatch(/money gained/);
    expect(checkSellerText("The discount costs about $56 and cuts the typical swing by about $61.", f)).toBeNull();
  });

  it("rejects broken-off text", () => {
    const f = "Typical swing about ¥27K, if early about ¥8,274.";
    expect(checkSellerText("The typical swing is about ¥27K, and if early it is about ¥8,274... no", f)).toMatch(/broken-off/);
    expect(checkSellerText("The typical swing is about ¥27K and", f)).toMatch(/complete sentence/);
  });
});

describe("text that is not a reason (2026-10-27 plan)", () => {
  it("rejects placeholder reasons", () => {
    expect(checkSellerText("Placeholder not used.", "")).toMatch(/placeholder/);
    expect(checkSellerText("TBD.", "")).not.toBeNull();
  });
  it("rejects a summary that narrates the agent's own tool calls", () => {
    const s =
      "I proposed reminders for the two late invoices. I logged a stray skip on FXA-4001 by mistake; its reminder is still pending your approval, so please disregard that skip record.";
    expect(checkSellerText(s, "4001")).toMatch(/agent's own steps/);
  });
  it("still accepts a plain reason, including stress-test wording", () => {
    expect(checkSellerText("Due in 10 days, too soon for an early-payment offer to change much.", "10")).toBeNull();
    expect(checkSellerText("Overdue 15 days; a reminder asks the client to settle it, and the 3% stress-test move is $84.", "15 3 84")).toBeNull();
  });
});

describe("unaskedDirectionNote", () => {
  const note = "I proposed a 1% offer, and I can't tell clients which direction any exchange rate is headed.";
  it("rejects a direction disclaimer nobody asked for", () => {
    expect(unaskedDirectionNote(note)).toMatch(/nobody asked/);
    expect(unaskedDirectionNote(note, "Chase everyone more than 10 days late, gently")).toMatch(/nobody asked/);
  });
  it("allows it when the request asks about direction", () => {
    expect(unaskedDirectionNote(note, "Tell my clients the yen will fall so they pay now")).toBeNull();
  });
  it("leaves ordinary summaries alone", () => {
    expect(unaskedDirectionNote("I proposed two reminders and left the rest alone.")).toBeNull();
  });
});
