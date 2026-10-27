import { describe, expect, it } from "vitest";
import { BOOK_DAY_HOLD_HOURS, bookDay } from "./book";

describe("book day", () => {
  const now = new Date("2026-10-27T00:20:00Z");
  it("is today for a book without a demo start (a real seller)", () => {
    expect(bookDay(undefined, now)).toBe("2026-10-27");
  });
  it("stays on the day the demo was started until the nightly reset turns it", () => {
    expect(bookDay("2026-10-26T00:45:00Z", now)).toBe("2026-10-26");
  });
  it("is today right after a reset", () => {
    expect(bookDay("2026-10-27T00:10:00Z", new Date("2026-10-27T00:12:00Z"))).toBe("2026-10-27");
  });
  it("moves on by itself if the reset has not run for too long", () => {
    const started = new Date(now.getTime() - (BOOK_DAY_HOLD_HOURS + 1) * 3_600_000).toISOString();
    expect(bookDay(started, now)).toBe("2026-10-27");
  });
  it("ignores a start time in the future", () => {
    expect(bookDay("2026-10-28T00:00:00Z", now)).toBe("2026-10-27");
  });
});
