import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));

const { within } = await import("./agent-cache");

describe("a page never waits long for the plan", () => {
  it("returns a plan that is ready in time", async () => {
    expect(await within(Promise.resolve("plan"), 50)).toBe("plan");
  });
  it("gives up after the wait and lets the slow plan finish on its own", async () => {
    let done = false;
    const slow = new Promise<string>((r) => setTimeout(() => ((done = true), r("late")), 80));
    expect(await within(slow, 10)).toBeNull();
    expect(await slow).toBe("late");
    expect(done).toBe(true);
  });
  it("treats a failed plan like a missing one instead of throwing", async () => {
    expect(await within(Promise.reject(new Error("model down")), 50)).toBeNull();
  });
});
