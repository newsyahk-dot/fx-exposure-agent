// Cached wrapper around explain(): one model call per distinct set of facts, kept for days, so
// reloading the page or a crowd of visitors does not multiply API calls.

import { cacheLife } from "next/cache";
import { explain, type Explanation, type ProposalFacts } from "./explain";

export async function cachedExplanations(facts: ProposalFacts[]): Promise<Record<string, Explanation>> {
  "use cache";
  cacheLife("days");
  return explain(facts);
}
