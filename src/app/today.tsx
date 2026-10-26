// The first screen: what is at risk now, what the agent proposes today, and the result of each action in
// place — approve, sent in PayPal, paid by the client, number down. The loop the demo video opens with.

import Link from "next/link";
import type { AgentInput, AgentProposal, AgentRun } from "@/lib/agent";
import { timelines, replayBook } from "@/lib/evidence";
import type { EcbQuotes } from "@/lib/fx";
import { compact, money } from "@/lib/format";
import { clientViewUrl } from "@/lib/paypal";
import { notInPlan, proposalState, type ProposalState } from "@/lib/plan-state";
import type { Invoice } from "@/lib/types";
import { todayBar, type BarKey } from "@/lib/today-bar";
import { SHOCK_PCT } from "@/lib/view";
import { ApproveForm } from "./approve-button";
import { SimulatePayment } from "./client-pay";
import { ReplanButton } from "./replan-button";
import styles from "./page.module.css";

export async function TodayPlan({
  run,
  base,
  input,
  invoices,
  ecb,
  lockReason,
  evidenceHref,
  paidValue,
  atRisk,
  paidToday,
}: {
  run: Promise<AgentRun>;
  base: string;
  input: AgentInput;
  invoices: Invoice[];
  ecb: EcbQuotes;
  lockReason?: string;
  evidenceHref: string;
  paidValue: Record<string, number>; // invoice id -> value paid today, home currency
  atRisk: { id: string; shock: number }[]; // open foreign invoices, ±3% figure in the home currency
  paidToday: { shock: number; count: number }; // foreign payments today, ±3% figure
}) {
  const r = await run;
  const c = (n: number) => compact(base, n);
  const cards = r.proposals.map((p) => ({ p, s: proposalState(p, input, invoices, r.plannedAt) }));
  // A fixed order (reminders first, then by value): a card stays where it is while it goes open → sent → paid.
  cards.sort((a, b) => (a.p.kind === b.p.kind ? b.p.value - a.p.value : a.p.kind === "reminder" ? -1 : 1));
  const missing = notInPlan(r, input);
  const states: Record<string, "sent" | "proposed"> = {};
  for (const { p, s } of cards) {
    if (s.state === "done") states[p.invoiceId] = "sent";
    else if (s.state === "open" && !states[p.invoiceId]) states[p.invoiceId] = "proposed";
  }
  const bar = todayBar(atRisk, states, paidToday);
  // On screen: a count made by code (always matches the cards). Claude's own summary is under the details.
  const nRem = r.proposals.filter((p) => p.kind === "reminder").length;
  const nOff = r.proposals.length - nRem;
  const lead = [nRem && `${nRem} payment reminder${nRem === 1 ? "" : "s"}`, nOff && `${nOff} early-payment offer${nOff === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" and ");
  const calls = r.steps.filter((s) => s.tool !== "summary").length;

  // What the proposals would have done to the range of the whole book, over two years of ECB rates.
  const { asInvoiced, withProposals } = timelines(input, r);
  const a = replayBook(ecb, base, asInvoiced, input.asOf);
  const b = replayBook(ecb, base, withProposals, input.asOf);
  const narrower = a.n > 0 && b.n > 0 && a.p95 - a.p5 > 0 ? Math.round((1 - (b.p95 - b.p5) / (a.p95 - a.p5)) * 100) : null;

  return (
    <>
      <TodayBar bar={bar} c={c} />
      <div className={styles.agentStatus}>
        <p>
          <strong>{r.source === "agent" ? "Claude's plan for today" : "Today's plan (rule-based)"}</strong>
          {r.plannedAt && <span className={styles.muted}> · made {r.plannedAt.slice(11, 16)} UTC</span>}
        </p>
        <p>
          {lead ? <>Proposes {lead}</> : "No actions proposed"}
          {r.notProposed.length > 0 && <>; leaves {r.notProposed.length} alone</>}.
        </p>
        {narrower != null && narrower > 0 && (
          <p className={styles.muted}>
            If clients pay as proposed, the range your total moved over the last two years narrows by {narrower}%.{" "}
            <Link href={evidenceHref} className={styles.link}>
              See the evidence →
            </Link>
          </p>
        )}
        {missing.length > 0 && (
          <div className={styles.replanRow}>
            <span>
              {missing.length} open {missing.length === 1 ? "invoice is" : "invoices are"} not in this plan ({missing.map((m) => m.invoiceNumber).join(", ")}).
            </span>
            <ReplanButton disabledReason={lockReason} />
          </div>
        )}
      </div>

      {cards.length === 0 ? (
        <p className={styles.muted}>Nothing to do today: no overdue invoices to chase and no large distant ones worth an offer.</p>
      ) : (
        <ul className={styles.cards}>
          {cards.map(({ p, s }) => (
            <ProposalCard key={`${p.kind}-${p.invoiceId}`} p={p} s={s} client={invoices.find((i) => i.id === p.invoiceId)?.recipientName} paidToday={paidValue[p.invoiceId]} base={base} c={c} lockReason={lockReason} agent={r.source === "agent"} />
          ))}
        </ul>
      )}

      <details className={styles.leftAlone}>
        <summary>How the agent planned this</summary>
        {r.summary && <p>{r.summary}</p>}
        <p>
          {r.source === "agent" ? (
            <>
              Claude ({r.model}) read the invoices through {calls} tool calls and chose what to propose. Code decided which
              invoices were eligible and computed every number; every text it wrote was checked before it reached this
              screen
              {r.rejections > 0 ? ` (${r.rejections} draft${r.rejections === 1 ? "" : "s"} were rejected and rewritten)` : ""}.
            </>
          ) : (
            <>The agent did not run ({r.reason}); these are rule-based proposals with fixed wording.</>
          )}
        </p>
        {r.notProposed.length > 0 && (
          <>
            <p>Left alone:</p>
            <ul>
              {r.notProposed.map((n) => (
                <li key={n.invoiceNumber}>
                  <strong>{n.invoiceNumber}</strong> — {n.why} <span className={styles.muted}>({n.by === "agent" ? "agent's call" : "not eligible"})</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {r.steps.length > 0 && (
          <ol className={styles.steps}>
            {r.steps.map((st, i) => (
              <li key={i} data-ok={st.ok}>
                <code>{st.tool}</code>
                {st.invoice && <> · {st.invoice}</>} — {st.ok ? st.detail : `rejected: ${st.detail}`}
              </li>
            ))}
          </ol>
        )}
      </details>
    </>
  );
}

function ProposalCard({
  p,
  s,
  client,
  paidToday,
  base,
  c,
  lockReason,
  agent,
}: {
  p: AgentProposal;
  s: ProposalState;
  client?: string;
  paidToday?: number;
  base: string;
  c: (n: number) => string;
  lockReason?: string;
  agent: boolean;
}) {
  const atRisk = (p.value * SHOCK_PCT) / 100;
  return (
    <li className={styles.card} data-state={s.state}>
      <p className={styles.cardKind}>
        {p.kind === "reminder" ? "Chase a late payment" : `Offer ${p.percent}% off to be paid within ${p.withinDays} days`}
      </p>
      <p className={styles.cardTitle}>
        {p.invoiceNumber}
        {client && <> · {client}</>} · {money(p.currency, p.amount)} <span className={styles.muted}>≈ {c(p.value)}</span>
      </p>
      <dl className={styles.compare}>
        <div>
          <dt>At risk at ±{SHOCK_PCT}%</dt>
          <dd>±{c(atRisk)}</dd>
        </div>
        {p.kind === "reminder" ? (
          <div>
            <dt>Overdue</dt>
            <dd>{p.daysOverdue} days</dd>
          </div>
        ) : (
          <>
            <div>
              <dt>Cost to you if taken</dt>
              <dd>{c(p.cost)}</dd>
            </div>
            <div>
              <dt title="One standard deviation of the value until it is paid — a size of uncertainty, not a forecast">
                Typical swing until paid
              </dt>
              <dd>
                {p.swingNow == null || p.swingIfEarly == null ? "n/a" : `±${c(p.swingNow)} → ±${c(p.swingIfEarly)}`}
              </dd>
            </div>
          </>
        )}
      </dl>
      <details className={styles.draft}>
        <summary>Why the agent proposes this</summary>
        <p>{p.rationale}</p>
        <p className={styles.whySource}>{agent ? "Written by Claude, checked by code" : "Standard wording"}</p>
      </details>

      {s.state === "open" && <ApproveForm p={p} base={base} disabledReason={lockReason} />}
      {s.state === "done" && (
        <div className={styles.cardDone}>
          <p className={styles.ok}>
            ✓ {p.kind === "reminder" ? "Reminder sent" : "Offer sent"} in PayPal at {s.at.slice(11, 16)} UTC
            {s.auto && " by the autopilot"}
          </p>
          <div className={styles.inlineForm}>
            <span className={styles.muted}>Now play the client:</span>
            <a href={clientViewUrl(p.invoiceId)} target="_blank" rel="noopener noreferrer" className={styles.link}>
              Open as client ↗
            </a>
            <SimulatePayment invoiceId={p.invoiceId} disabledReason={lockReason} />
          </div>
        </div>
      )}
      {s.state === "paid" && (
        <p className={`${styles.cardDone} ${styles.ok}`}>
          ✓ Paid
          {paidToday ? <> today — {c((paidToday * SHOCK_PCT) / 100)} no longer at risk at ±{SHOCK_PCT}%.</> : "."}
        </p>
      )}
      {(s.state === "closed" || s.state === "changed") && (
        <p className={styles.muted}>This invoice changed since the plan was made; this proposal no longer applies.</p>
      )}
    </li>
  );
}

const BAR_LABEL: Record<BarKey, string> = {
  paid: "Paid today — off the book",
  sent: "Sent in PayPal — waiting for the client",
  proposed: "Proposed — waiting for your click",
  none: "No move today",
};

// Today's total at risk as one bar: what was paid off today, what the agent has moving, what waits for a click.
function TodayBar({ bar, c }: { bar: ReturnType<typeof todayBar>; c: (n: number) => string }) {
  const total = bar.morning;
  if (!(total > 0)) return null;
  const shown = bar.segments.filter((s) => s.value > 0);
  const plural = (n: number) => `${n} invoice${n === 1 ? "" : "s"}`;
  return (
    <figure className={styles.todayBar} aria-label="Where today's risk stands">
      <figcaption>
        <strong>Where today&apos;s ±{c(total)} stands</strong>
        {bar.morning > bar.now && (
          <span className={styles.ok}>
            {" "}
            — ±{c(bar.now)} left after today&apos;s payments
          </span>
        )}
      </figcaption>
      <div className={styles.barTrack}>
        {shown.map((s) => (
          <span
            key={s.key}
            data-key={s.key}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${BAR_LABEL[s.key]}: ±${c(s.value)}`}
          />
        ))}
      </div>
      <ul className={styles.barLegend}>
        {bar.segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <li key={s.key} data-key={s.key}>
              <i aria-hidden="true" />
              {BAR_LABEL[s.key]} <strong>±{c(s.value)}</strong>
              {s.count > 0 && <span className={styles.muted}> · {plural(s.count)}</span>}
            </li>
          ))}
      </ul>
    </figure>
  );
}
