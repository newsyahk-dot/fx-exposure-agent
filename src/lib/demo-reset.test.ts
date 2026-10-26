import { describe, expect, it } from "vitest";
import { RESET_COOLDOWN_MIN, resetWait } from "./demo-reset";

describe("demo reset cooldown", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  it("waits after a recent reset", () => {
    expect(resetWait("2026-10-26T11:58:30Z", now)).toBe(4);
    expect(resetWait("2026-10-26T11:59:59Z", now)).toBe(RESET_COOLDOWN_MIN);
  });
  it("does not wait after the cooldown or without a known start", () => {
    expect(resetWait("2026-10-26T11:55:00Z", now)).toBe(0);
    expect(resetWait(undefined, now)).toBe(0);
  });
});
