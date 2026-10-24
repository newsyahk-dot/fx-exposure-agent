// Token usage and its estimated cost, per agent run. Prices are list prices per million tokens (Claude API,
// prompts up to 100K tokens); cache reads cost 0.1x input, 5-minute cache writes 1.25x.
// Update PRICES when the model changes — an unknown model is reported as cost null, never 0.

export type Usage = { input: number; cacheRead: number; cacheWrite: number; output: number; calls: number };
export const emptyUsage = (): Usage => ({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0, calls: 0 });

export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

type ApiUsage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

export function addUsage(u: Usage, m: ApiUsage): void {
  u.input += m.input_tokens;
  u.cacheRead += m.cache_read_input_tokens ?? 0;
  u.cacheWrite += m.cache_creation_input_tokens ?? 0;
  u.output += m.output_tokens;
  u.calls += 1;
}

export function costUsd(model: string, u: Usage): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (u.input * p.input + u.cacheRead * p.input * 0.1 + u.cacheWrite * p.input * 1.25 + u.output * p.output) / 1e6;
}
