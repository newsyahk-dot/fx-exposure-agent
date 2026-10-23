// Saves the live sandbox book as the demo snapshot the site falls back to (src/data/demo-snapshot.json),
// with one agent run per home currency, so the demo never calls PayPal or the model.
// Read-only against PayPal. Re-run after re-seeding or before recording the demo video.
//
//   npx tsx scripts/snapshot.mts              # all home currencies
//   npx tsx scripts/snapshot.mts --only JPY   # re-run one currency, keep the other saved runs

import { readFileSync, writeFileSync } from "node:fs";
import { runAgent, type AgentRun } from "../src/lib/agent";
import { loadLiveInputs } from "../src/lib/book";
import { BASES } from "../src/lib/fx";
import { viewFor } from "../src/lib/view";

const live = await loadLiveInputs();
const { source: _source, ...snapshot } = live;
void _source;
// The repo is public: keep buyer e-mail addresses out of the snapshot.
snapshot.invoices = snapshot.invoices.map(({ recipient: _r, ...inv }) => (void _r, inv));

const path = new URL("../src/data/demo-snapshot.json", import.meta.url);
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1]?.toUpperCase() : null;
const previous = only ? ((JSON.parse(readFileSync(path, "utf8")).agentRuns ?? {}) as Record<string, AgentRun>) : {};
const agentRuns: Record<string, AgentRun> = { ...previous };
for (const base of BASES.filter((b) => !only || b === only)) {
  const run = await runAgent(viewFor(live, base, new Date()).agentInput);
  agentRuns[base] = run;
  console.log(
    `${base}: ${run.source}${run.reason ? ` (${run.reason})` : ""} · ${run.proposals.length} proposals · ${run.steps.length} steps · ${run.rejections} rejected · tokens ${JSON.stringify(run.usage ?? {})}`,
  );
}
writeFileSync(path, JSON.stringify({ ...snapshot, agentRuns }, null, 2) + "\n");
console.log(`wrote demo snapshot: as of ${live.asOf}, ECB ${live.ecb.date}, ${live.invoices.length} invoices, ${live.archived} archived`);
