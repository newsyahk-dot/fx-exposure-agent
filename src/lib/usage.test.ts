import { describe, expect, it } from "vitest";
import { addUsage, costUsd, emptyUsage } from "./usage";

describe("usage", () => {
  it("prices uncached input, cache reads (0.1x), cache writes (1.25x) and output", () => {
    const u = emptyUsage();
    addUsage(u, { input_tokens: 1_000_000, output_tokens: 0 });
    addUsage(u, { input_tokens: 0, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000, output_tokens: 1_000_000 });
    expect(u).toEqual({ input: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000, output: 1_000_000, calls: 2 });
    expect(costUsd("claude-haiku-5-5", u)).toBeCloseTo(0.1 + 0.01 + 0.125 + 0.5, 9);
  });
  it("an unknown model has no price, not a zero price", () => {
    expect(costUsd("some-new-model", emptyUsage())).toBeNull();
  });
});
