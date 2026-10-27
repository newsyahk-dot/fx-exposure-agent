import { describe, expect, it } from "vitest";
import { spreadLabels } from "../app/wait-chart";

describe("chart line-end labels", () => {
  it("spreads labels that would overprint, keeping their order", () => {
    const r = spreadLabels([{ c: "JPY", y: 100 }, { c: "GBP", y: 103 }, { c: "EUR", y: 160 }], 14, 20, 220);
    expect(r.GBP - r.JPY).toBeGreaterThanOrEqual(14);
    expect(r.JPY).toBeLessThan(r.GBP);
    expect(r.EUR).toBe(160);
  });
  it("stays inside the plot when labels crowd the bottom", () => {
    const r = spreadLabels([{ c: "A", y: 218 }, { c: "B", y: 219 }], 14, 20, 220);
    expect(r.B).toBeLessThanOrEqual(220);
    expect(r.B - r.A).toBeGreaterThanOrEqual(14);
  });
});
