// The first screen: what is at risk now, what the agent proposes today, and the result of each action in
// place — approve, sent in PayPal, paid by the client, number down. The loop the demo video opens with.

import Link from "next/link";
import type { AgentInput, AgentProposal, AgentRun } from "@/lib/agent";
import { timelines, replayBook } from "@/lib/evidence";
import type { EcbQuotes } from "@/lib/fx";
import { compact, money } from "@/lib/format";
import { clientViewUrl } from "@/lib/paypal";
import { proposalState, type ProposalState } from "@/lib/plan-state";
import type { Invoice } from "@/lib/types";
import { todayBar, type BarKey } from "@/lib/today-bar";
import { SHOCK_PCT } from "@/lib/view";
import { ApproveForm } from "./approve-button";
import { SimulatePayment } from "./client-pay";
import { ResetDemoButton } from "./reset-demo";
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
  waiting,
  paidToday,
  sharedDemo,
}: {
  run: Promise<AgentRun>;
  base: string;
  input: AgentInput;
  invoices: Invoice[];
  ecb: EcbQuotes;
  lockReason?: string;
  evidenceHref: string;
  paidValue: Record<string, number>; // invoice id -> value paid today, home currency
  waiting: { id: string; value: number }[]; // open foreign invoices, value in the home currency
  paidToday: { value: number; count: number }; // foreign payments today, home currency
  sharedDemo?: { startedAt?: string }; // the hosted demo book, shared by every visitor
}) {
  const r = await run;
  const c = (n: number) => compact(base, n);
  const cards = r.proposals.map((p) => ({ p, s: proposalState(p, input, invoices, r.plannedAt) }));
  // A fixed order (reminders first, then by value): a card stays where it is while it goes open → sent → paid.
  cards.sort((a, b) => (a.p.kind === b.p.kind ? b.p.value - a.p.value : a.p.kind === "reminder" ? -1 : 1));
  const states: Record<string, "sent" | "proposed"> = {};
  for (const { p, s } of cards) {
    if (s.state === "done") states[p.invoiceId] = "sent";
    else if (s.state === "open" && !states[p.invoiceId]) states[p.invoiceId] = "proposed";
  }
  const bar = todayBar(waiting, states, paidToday);
  const openCount = cards.filter((x) => x.s.state === "open").length;
  const ranCount = cards.length - openCount;
  // On screen: a count made by code (always matches the cards). Claude's own summary is under the details.
  const nRem = r.proposals.filter((p) => p.kind === "reminder").length;
  const nOff = r.proposals.length - nRem;
  const lead = [nRem && `${nRem} payment reminder${nRem === 1 ? "" : "s"}`, nOff && `${nOff} early-payment offer${nOff === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" and ");
  const calls = r.steps.filter((s) => s.tool !== "summary").length;
  const paypalReads = r.steps.filter((s) => s.tool.startsWith("paypal.") && s.ok).length;

  // What the proposals would have done to the range of the whole book, over two years of ECB rates.
  const { asInvoiced, withProposals } = timelines(input, r);
  const a = replayBook(ecb, base, asInvoiced, input.asOf);
  const b = replayBook(ecb, base, withProposals, input.asOf);
  const ratio = a.n > 0 && b.n > 0 && a.p95 - a.p5 > 0 ? (b.p95 - b.p5) / (a.p95 - a.p5) : null;

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
        {ratio != null && ratio < 0.95 && (
          <p className={styles.muted}>
            In a replay of the last two years, getting paid as proposed would have kept the range your total moved{" "}
            {widthPhrase(ratio)}.{" "}
            <Link href={evidenceHref} className={styles.link}>
              See the evidence and its assumptions →
            </Link>
          </p>
        )}
      </div>

      {sharedDemo && cards.length > 0 && openCount === 0 && (
        <div className={styles.freshStart}>
          <p>
            <strong>Every proposal for today has been run.</strong> This demo book is shared by everyone who opens the site, so
            someone may have got here first. Start the story over to try the loop yourself:
          </p>
          <ResetDemoButton disabledReason={lockReason} />
        </div>
      )}
      {sharedDemo && ranCount > 0 && openCount > 0 && (
        <p className={styles.muted}>
          {ranCount} of today&apos;s {cards.length} proposals already ran — this demo book is shared by every visitor
          {sharedDemo.startedAt && <> (started {sharedDemo.startedAt.slice(11, 16)} UTC)</>}. The rest are yours to try.
        </p>
      )}
      {cards.length === 0 ? (
        <p className={styles.muted}>Nothing to do today: no overdue invoices to chase and no large distant ones worth an offer.</p>
      ) : (
        <ul className={styles.cards}>
          {cards.map(({ p, s }, i) => {
            const inv = invoices.find((x) => x.id === p.invoiceId);
            return (
              <ProposalCard
                key={`${p.kind}-${p.invoiceId}`}
                p={p}
                s={s}
                client={inv?.recipientName}
                due={inv?.dueDate}
                paidToday={paidValue[p.invoiceId]}
                base={base}
                c={c}
                lockReason={lockReason}
                agent={r.source === "agent"}
                rejected={rejectedFor(r, p.invoiceNumber)}
                featured={i === 0}
              />
            );
          })}
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
              {paypalReads > 0 && (
                <>
                  {" "}
                  It read {paypalReads} invoice{paypalReads === 1 ? "" : "s"} directly in PayPal through PayPal&apos;s own MCP server (read-only tools:
                  get_invoice, search_invoicing); every change to an invoice still goes through the checked approve path.
                </>
              )}
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

export function ProposalCard({
  p,
  s,
  client,
  due,
  paidToday,
  base,
  c,
  lockReason,
  agent,
  rejected = [],
  featured = false,
}: {
  p: AgentProposal;
  s: ProposalState;
  client?: string;
  due?: string; // the invoice's current due date (before an offer moves it)
  paidToday?: number;
  base: string;
  c: (n: number) => string;
  lockReason?: string;
  agent: boolean;
  rejected?: string[]; // why the checks rejected earlier drafts for this invoice (from the run's steps)
  featured?: boolean; // the first card shows the agent's reason and draft without a click
}) {
  const atRisk = (p.value * SHOCK_PCT) / 100;
  const weeksSooner = p.kind === "early_pay_discount" ? Math.round((p.daysToDue - p.withinDays) / 7) : 0;
  return (
    <li className={styles.card} data-state={s.state}>
      <p className={styles.cardKind}>
        {p.kind === "reminder"
          ? "Chase a late payment"
          : weeksSooner >= 1
            ? `Ask to be paid ${weeksSooner} week${weeksSooner === 1 ? "" : "s"} sooner, for ${p.percent}% off`
            : `Offer ${p.percent}% off for an earlier due date`}
      </p>
      <p className={styles.cardTitle}>
        {p.invoiceNumber}
        {client && <> · {client}</>} · {money(p.currency, p.amount)} <span className={styles.muted}>≈ {c(p.value)}</span>
      </p>
      {p.kind === "reminder" ? (
        <p className={styles.cardPitch}>
          Overdue {p.daysOverdue} days · <strong>{c(p.value)} waiting</strong>
        </p>
      ) : (
        <>
          <p className={styles.cardPitch}>
            <strong>{c(p.cost)}</strong> off · due <strong>{shortDate(p.newDueDate)}</strong>
            {due && due !== p.newDueDate && <> instead of {shortDate(due)}</>}
            {p.swingNow != null && p.swingIfEarly != null && (
              <>
                {" "}
                · <span title="Typical swing until paid: one standard deviation of the value — a size of uncertainty, not a forecast">
                  typical swing ±{c(p.swingNow)} → ±{c(p.swingIfEarly)}
                </span>
              </>
            )}
          </p>
          {s.state === "open" && (
            <p className={styles.muted}>The {p.percent}% comes off when you approve — a PayPal invoice cannot make a discount conditional.</p>
          )}
        </>
      )}
      <p className={styles.checkBadge} data-rewritten={rejected.length > 0 || undefined}>
        {agent ? (
          <>
            ✓ Written by Claude, checked by code
            {rejected.length > 0 && (
              <>
                {" "}
                · {rejected.length} draft{rejected.length === 1 ? "" : "s"} rejected ({[...new Set(rejected)].join("; ")}) and rewritten
              </>
            )}
          </>
        ) : (
          "Standard wording"
        )}
      </p>
      <details className={styles.draft}>
        <summary>Numbers and the agent&apos;s reason</summary>
        <dl className={styles.compare}>
          {p.kind === "early_pay_discount" && (
            <>
              <div>
                <dt>Cost to you</dt>
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
          <div>
            <dt title="A stress test: what a 3% move either way would change. Up or down — not a forecast.">If rates move {SHOCK_PCT}%</dt>
            <dd>±{c(atRisk)}</dd>
          </div>
        </dl>
        <p>{p.rationale}</p>
      </details>

      {s.state === "open" && <ApproveForm p={p} base={base} disabledReason={lockReason} openDraft={featured} />}
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
        <div className={styles.cardDone}>
          <p className={styles.ok}>
            ✓ Paid{paidToday ? <> today — {c(paidToday)} collected, no longer waiting on the client.</> : "."}
          </p>
          <p className={styles.muted}>
            If you keep it in {p.currency} in PayPal, it still moves with the exchange rate until you convert.
          </p>
        </div>
      )}
      {(s.state === "closed" || s.state === "changed") && (
        <p className={styles.muted}>This invoice changed since the plan was made; this proposal no longer applies.</p>
      )}
    </li>
  );
}

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// "about half as wide" — a plain-words size for a replayed range, not a precise claim.
export function widthPhrase(ratio: number): string {
  if (ratio < 0.35) return "about a third as wide";
  if (ratio < 0.6) return "about half as wide";
  if (ratio < 0.8) return "about two-thirds as wide";
  return "a little narrower";
}

// Why the checks rejected drafts for this invoice during the run, in plain words.
function rejectedFor(r: AgentRun, invoiceNumber: string): string[] {
  return r.steps
    .filter((s) => !s.ok && s.invoice === invoiceNumber && s.tool.startsWith("propose"))
    .map((s) =>
      /forecast|advice/.test(s.detail)
        ? "forecast or advice wording"
        : /numbers? not in the facts/.test(s.detail)
          ? "a number not in the facts"
          : /link/.test(s.detail)
            ? "a link"
            : /label|swing|stress/.test(s.detail)
              ? "a figure under the wrong label"
              : "failed a check",
    );
}

const BAR_LABEL: Record<BarKey, string> = {
  paid: "Collected today",
  sent: "Reminder or offer sent — waiting for the client",
  proposed: "Proposed — waiting for your click",
  none: "No action today",
};

// Today's total at risk as one bar: what was paid off today, what the agent has moving, what waits for a click.
function TodayBar({ bar, c }: { bar: ReturnType<typeof todayBar>; c: (n: number) => string }) {
  const total = bar.morning;
  if (!(total > 0)) return null;
  const shown = bar.segments.filter((s) => s.value > 0);
  const plural = (n: number) => `${n} invoice${n === 1 ? "" : "s"}`;
  return (
    <figure className={styles.todayBar} aria-label="Where today's money stands">
      <figcaption>
        <strong>Where today&apos;s {c(total)} stands</strong>
        {bar.morning > bar.now && (
          <span className={styles.ok}>
            {" "}
            — {c(bar.morning - bar.now)} collected, {c(bar.now)} still waiting
          </span>
        )}
      </figcaption>
      <div className={styles.barTrack}>
        {shown.map((s) => (
          <span
            key={s.key}
            data-key={s.key}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${BAR_LABEL[s.key]}: ${c(s.value)}`}
          />
        ))}
      </div>
      <ul className={styles.barLegend}>
        {bar.segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <li key={s.key} data-key={s.key}>
              <i aria-hidden="true" />
              {BAR_LABEL[s.key]} <strong>{c(s.value)}</strong>
              {s.count > 0 && <span className={styles.muted}> · {plural(s.count)}</span>}
            </li>
          ))}
      </ul>
    </figure>
  );
}
