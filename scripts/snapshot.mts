// Saves the live sandbox book as the demo snapshot the site falls back to (src/data/demo-snapshot.json).
// Read-only against PayPal. Re-run after re-seeding or before recording the demo video.
//
//   npx tsx scripts/snapshot.mts

import { writeFileSync } from "node:fs";
import { loadLiveInputs } from "../src/lib/book";
import { explain, factsFor } from "../src/lib/explain";
import { buildProposals } from "../src/lib/proposals";

const live = await loadLiveInputs();
const { source: _source, ...snapshot } = live;
void _source;
// The repo is public: keep buyer emails out of the snapshot.
snapshot.invoices = snapshot.invoices.map(({ recipient: _r, ...inv }) => (void _r, inv));
// Save the explanations too, so the demo never calls the model.
const proposals = buildProposals(live.invoices, live.rates, live.asOf, { dailyVols: live.dailyVols });
const explanations = await explain(proposals.map(factsFor));
const bySource = Object.values(explanations).reduce<Record<string, number>>((m, e) => ((m[e.source] = (m[e.source] ?? 0) + 1), m), {});
(snapshot as typeof snapshot & { explanations: typeof explanations }).explanations = explanations;
console.log("explanations:", bySource, Object.values(explanations).filter((e) => e.reason).map((e) => e.reason));
const path = new URL("../src/data/demo-snapshot.json", import.meta.url);
writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
console.log(
  `wrote demo snapshot: as of ${live.asOf}, ECB ${live.rateDate}, ${live.invoices.length} invoices, ${live.skipped.length} skipped`,
);
