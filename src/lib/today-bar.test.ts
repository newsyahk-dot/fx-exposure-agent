import { describe, expect, it } from "vitest";
import { todayBar } from "./today-bar";

describe("today bar", () => {
  it("splits what is at risk by what happened today, and adds back what was paid", () => {
    const r = todayBar(
      [
        { id: "a", shock: 84 },
        { id: "b", shock: 60 },
        { id: "c", shock: 168 },
        { id: "d", shock: 40 },
      ],
      { a: "sent", b: "proposed", c: "proposed" },
      { shock: 50, count: 1 },
    );
    expect(r.segments.map((s) => [s.key, s.value, s.count])).toEqual([
      ["paid", 50, 1],
      ["sent", 84, 1],
      ["proposed", 228, 2],
      ["none", 40, 1],
    ]);
    expect(r.now).toBe(352);
    expect(r.morning).toBe(402);
  });
  it("is empty and zero without invoices", () => {
    const r = todayBar([], {}, { shock: 0, count: 0 });
    expect(r.now).toBe(0);
    expect(r.morning).toBe(0);
  });
});
