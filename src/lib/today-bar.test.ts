import { describe, expect, it } from "vitest";
import { todayBar } from "./today-bar";

describe("today bar", () => {
  it("splits what is waiting by what happened today, and adds back what was collected", () => {
    const r = todayBar(
      [
        { id: "a", value: 84 },
        { id: "b", value: 60 },
        { id: "c", value: 168 },
        { id: "d", value: 40 },
      ],
      { a: "sent", b: "proposed", c: "proposed" },
      { value: 50, count: 1 },
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
    const r = todayBar([], {}, { value: 0, count: 0 });
    expect(r.now).toBe(0);
    expect(r.morning).toBe(0);
  });
});
