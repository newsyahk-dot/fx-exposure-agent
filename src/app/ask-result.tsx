// The agent's answer to a seller's request: its summary (checked like every other text) and the proposals it made,
// shown as the same cards with the same approve button as the day's plan.

import type { AgentInput, AgentRun } from "@/lib/agent";
import { compact } from "@/lib/format";
import { proposalState } from "@/lib/plan-state";
import type { Invoice } from "@/lib/types";
import { ProposalCard } from "./today";
import styles from "./page.module.css";

export async function AskResult({
  run,
  request,
  heading,
  base,
  input,
  invoices,
  lockReason,
  paidValue,
}: {
  run: Promise<AgentRun>;
  request: string;
  heading?: string; // shown instead of the quoted request (e.g. for a PayPal event)
  base: string;
  input: AgentInput;
  invoices: Invoice[];
  lockReason?: string;
  paidValue: Record<string, number>;
}) {
  const r = await run;
  const c = (n: number) => compact(base, n);
  const calls = r.steps.filter((s) => s.tool !== "summary").length;
  return (
    <div className={styles.askResult}>
      <div className={styles.agentStatus}>
        <p className={styles.askQuote}>{heading ?? <>&ldquo;{request}&rdquo;</>}</p>
        <p>
          <strong>{r.source === "agent" ? "Claude:" : "Rule-based answer:"}</strong> {r.source === "agent" ? r.summary : `The agent did not run (${r.reason}).`}
        </p>
        {r.source === "agent" && (
          <p className={styles.muted}>
            {calls} tool calls · {r.proposals.length} proposal{r.proposals.length === 1 ? "" : "s"}
            {r.rejections > 0 && <> · {r.rejections} draft{r.rejections === 1 ? "" : "s"} rejected by the checks and rewritten</>} · every
            number from code; nothing runs without your click or your approved autopilot policy
          </p>
        )}
      </div>
      {r.source === "agent" && r.proposals.length > 0 && (
        <ul className={styles.cards}>
          {r.proposals.map((p) => (
            <ProposalCard
              key={`${p.kind}-${p.invoiceId}`}
              p={p}
              s={proposalState(p, input, invoices, r.plannedAt)}
              client={invoices.find((i) => i.id === p.invoiceId)?.recipientName}
              paidToday={paidValue[p.invoiceId]}
              base={base}
              c={c}
              lockReason={lockReason}
              agent
            />
          ))}
        </ul>
      )}
    </div>
  );
}
