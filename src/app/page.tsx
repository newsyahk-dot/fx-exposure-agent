import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { rulesRun, type AgentProposal, type AgentRun } from "@/lib/agent";
import { cachedAgentRun } from "@/lib/agent-cache";
import { loadInputs, RATE_SOURCE, type BookInputs } from "@/lib/book";
import { OPEN_STATUSES } from "@/lib/exposure";
import { BASES } from "@/lib/fx";
import { cell, compact, full, money } from "@/lib/format";
import { BUCKETS, type Bucket } from "@/lib/types";
import { pickBase, SHOCK_PCT, TIMING_DAYS, VOL_LOOKBACK_DAYS, viewFor, type BookView } from "@/lib/view";
import { clientViewUrl } from "@/lib/paypal";
import { ASSUME, bandsByWait, LOOKBACK_DAYS, replayBook, timelines } from "@/lib/evidence";
import type { EcbQuotes } from "@/lib/fx";
import type { AgentInput } from "@/lib/agent";
import { ApproveForm } from "./approve-button";
import { WaitChart } from "./wait-chart";
import { InvoiceAssistant } from "./invoice-assistant";
import { SimulatePayment } from "./client-pay";
import styles from "./page.module.css";

const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Overdue",
  w1: "Due in 0–6 days",
  w2: "7–13 days",
  w3: "14–20 days",
  w4: "21–27 days",
  later: "28+ days",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>FX Exposure Agent</h1>
        <p className={styles.lede}>
          How much of the money your clients still owe you is riding on exchange rates — and an AI agent that proposes
          PayPal actions to shorten it, for you to approve.
        </p>
      </header>
      <Suspense fallback={<p className={styles.muted}>Loading your PayPal invoices…</p>}>
        <Book searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Book({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const base = pickBase((await searchParams).base);
  let inputs: BookInputs;
  try {
    inputs = await loadInputs();
  } catch (e) {
    return (
      <p className={styles.error} role="alert">
        Could not load invoices: {e instanceof Error ? e.message : String(e)}
      </p>
    );
  }
  const now = new Date();
  const view = viewFor(inputs, base, now);
  const { exposure: e, rates } = view;
  const c = (n: number) => compact(base, n);
  const open = inputs.invoices.filter((i) => OPEN_STATUSES.has(i.status) && i.amountDue > 0);
  const paidToday = inputs.invoices.filter((i) => !OPEN_STATUSES.has(i.status) && i.payments?.some((p) => p.date === inputs.asOf));
  const overdue = e.rows.reduce((s, r) => s + r.buckets.overdue * rates[r.currency], 0);
  const skipped = [...inputs.skipped, ...e.skipped];
  const readOnly = inputs.source === "demo";
  // The demo never calls the model: it shows the saved run for this currency, or rule-based proposals.
  const run: Promise<AgentRun> = readOnly
    ? Promise.resolve(inputs.agentRuns?.[base] ?? rulesRun(view.agentInput, "demo snapshot"))
    : cachedAgentRun(view.agentInput);

  const cellValue = e.rows.flatMap((r) => BUCKETS.map((b) => r.buckets[b] * rates[r.currency]));
  const maxCell = Math.max(1, ...cellValue);
  const level = (v: number) => (v > 0 ? Math.min(5, Math.ceil((v / maxCell) * 5)) : 0);

  // Actions on invoices still open; ones on invoices since paid or cancelled are counted, not listed.
  const allDone = inputs.invoices.flatMap((i) => (i.agentLog ?? []).filter((a) => a.kind !== "archived").map((a) => ({ ...a, inv: i })));
  const done = allDone.filter((d) => OPEN_STATUSES.has(d.inv.status)).sort((a, b) => b.at.localeCompare(a.at));
  const doneClosed = allDone.length - done.length;

  return (
    <>
      <nav className={styles.baseNav} aria-label="Home currency">
        <span className={styles.muted}>Home currency</span>
        {BASES.map((b) => (
          <Link key={b} href={`/?base=${b}`} className={styles.basePill} aria-current={b === base ? "true" : undefined}>
            {b}
          </Link>
        ))}
        <span className={styles.sourceBadge} data-source={inputs.source}>
          {inputs.source === "live" ? "Live · PayPal sandbox" : "Demo snapshot"} · as of {inputs.asOf}
        </span>
      </nav>

      <section className={styles.hero} aria-label="Headline">
        <p className={styles.heroLabel}>
          If exchange rates move {SHOCK_PCT}% either way, what you are owed in foreign currencies changes by about
        </p>
        <p className={styles.heroValue}>{c(e.totalShock)}</p>
        <p className={styles.muted}>Up or down — equally likely. This is the size of the risk, not a forecast.</p>
      </section>

      <section className={styles.tiles} aria-label="Summary">
        <Tile
          label="Owed to you in foreign currencies"
          value={c(e.totalValue)}
          note={`${open.filter((i) => i.currency !== base).length} open invoices · ${e.rows.map((r) => r.currency).join(" · ") || "none"}`}
        />
        <Tile label="Already overdue" value={c(overdue)} note="still exposed every day it stays unpaid" />
        <Tile label={`Owed in ${base} (no FX risk)`} value={c(e.baseTotal)} note={`${open.filter((i) => i.currency === base).length} open invoices`} />
      </section>

      <Timing view={view} />

      <section aria-labelledby="exposure-h">
        <h2 id="exposure-h">Where the exposure sits</h2>
        <p className={styles.muted}>Unpaid amounts by currency and by when they fall due. Darker cells hold more money in {base} terms.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Currency</th>
                {BUCKETS.map((b) => (
                  <th key={b} scope="col" className={styles.num}>
                    {BUCKET_LABEL[b]}
                  </th>
                ))}
                <th scope="col" className={styles.num}>
                  In {base}
                </th>
                <th scope="col" className={styles.num}>
                  ±{SHOCK_PCT}%
                </th>
              </tr>
            </thead>
            <tbody>
              {e.rows.map((r) => (
                <tr key={r.currency}>
                  <th scope="row">{r.currency}</th>
                  {BUCKETS.map((b) => {
                    const v = r.buckets[b] * rates[r.currency];
                    return (
                      <td
                        key={b}
                        className={`${styles.num} ${styles.heat}`}
                        data-level={level(v)}
                        title={v ? `${money(r.currency, r.buckets[b])} ≈ ${full(base, v)}` : undefined}
                      >
                        {cell(r.currency, r.buckets[b])}
                      </td>
                    );
                  })}
                  <td className={styles.num}>{c(r.value)}</td>
                  <td className={styles.num}>±{c(r.shock)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                {BUCKETS.map((b) => (
                  <td key={b} className={styles.num}>
                    {c(e.rows.reduce((s, r) => s + r.buckets[b] * rates[r.currency], 0))}
                  </td>
                ))}
                <td className={styles.num}>{c(e.totalValue)}</td>
                <td className={styles.num}>±{c(e.totalShock)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {(skipped.length > 0 || inputs.archived > 0) && (
          <p className={styles.muted}>
            {skipped.length > 0 && (
              <span className={styles.warn}>
                Not counted ({skipped.length}): {skipped.map((s) => `${s.id} — ${s.reason}`).join("; ")}.{" "}
              </span>
            )}
            {inputs.archived > 0 && <>{inputs.archived} retired demo invoices are left out on purpose.</>}
          </p>
        )}
      </section>

      <Evidence ecb={inputs.ecb} base={base} asOf={inputs.asOf} ccys={e.rows.map((r) => r.currency)} lead={e.rows.slice().sort((a, b) => b.value - a.value)[0]?.currency} />

      <section aria-labelledby="actions-h">
        <h2 id="actions-h">What the agent proposes</h2>
        <p className={styles.muted}>
          Claude reads your invoices through tools, decides what to propose and writes each e-mail. Code checks every
          number and word before you see it, and nothing runs in PayPal until you approve.
        </p>
        <Suspense fallback={<p className={styles.why}>The agent is reading your invoices…</p>}>
          <AgentPlan run={run} base={base} readOnly={readOnly} ecb={inputs.ecb} input={view.agentInput} />
        </Suspense>
      </section>

      <section aria-labelledby="new-h">
        <h2 id="new-h">Before you send the next invoice</h2>
        <p className={styles.muted}>
          Describe it in a sentence. Claude reads it into fields; code prices each way of billing from this client&apos;s
          payment history and the ECB rates; Claude compares them in plain words, checked like everything else. Nothing is
          created until you approve one.
        </p>
        <InvoiceAssistant base={base} clients={[...new Set(inputs.invoices.map((i) => i.recipientName).filter((n): n is string => !!n))].sort()} />
      </section>

      <section aria-labelledby="done-h">
        <h2 id="done-h">Done by the agent</h2>
        {done.length === 0 ? (
          <p className={styles.muted}>Nothing yet. Approved actions show up here and stay recorded on the invoice.</p>
        ) : (
          <ul className={styles.doneList}>
            {done.map((d) => (
              <li key={`${d.inv.id}-${d.kind}-${d.at}`}>
                <time dateTime={d.at}>{d.at.slice(0, 16).replace("T", " ")} UTC</time>
                <span>{d.kind === "reminder" ? "Reminder sent" : d.kind === "created" ? "Invoice created" : "Early-payment discount applied"}</span>
                <span>
                  {d.inv.number} · {money(d.inv.currency, d.inv.amountDue)} still owed, due {d.inv.dueDate}
                </span>
              </li>
            ))}
          </ul>
        )}
        {doneClosed > 0 && (
          <p className={styles.muted}>
            {doneClosed} earlier {doneClosed === 1 ? "action" : "actions"} on invoices since paid or cancelled not listed.
          </p>
        )}
      </section>

      <section aria-labelledby="client-h" className={styles.sandboxPanel}>
        <h2 id="client-h">Act as the client (sandbox)</h2>
        <p className={styles.muted}>
          Close the loop: pay an open invoice as the client and watch the exposure shrink and the payment appear under
          &ldquo;What the wait already did&rdquo;. &ldquo;Open as client&rdquo; is the real PayPal invoice page (log in
          with the sandbox buyer account); &ldquo;Simulate client payment&rdquo; records the same payment without a login and
          is labelled as a simulation.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Invoice</th>
                <th scope="col">Client</th>
                <th scope="col" className={styles.num}>
                  Still owed
                </th>
                <th scope="col">Due</th>
                <th scope="col">Pay it</th>
              </tr>
            </thead>
            <tbody>
              {[...paidToday, ...open.slice().sort((a, b) => (rates[b.currency] ?? 0) * b.amountDue - (rates[a.currency] ?? 0) * a.amountDue)].map((i) => {
                const paid = !OPEN_STATUSES.has(i.status);
                return (
                  <tr key={i.id} className={paid ? styles.today : undefined}>
                    <th scope="row">{i.number}</th>
                    <td>{i.recipientName ?? ""}</td>
                    <td className={styles.num}>{paid ? money(i.currency, i.total ?? 0) : money(i.currency, i.amountDue)}</td>
                    <td>{i.dueDate}</td>
                    <td>
                      {paid ? (
                        "Paid today ✓"
                      ) : (
                        <div className={styles.inlineForm}>
                          <a href={clientViewUrl(i.id)} target="_blank" rel="noopener noreferrer" className={styles.link}>
                            Open as client ↗
                          </a>
                          <SimulatePayment invoiceId={i.id} disabledReason={readOnly ? "demo" : undefined} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <footer className={styles.footer}>
        <p>
          Rates: {RATE_SOURCE}, {inputs.ecb.date}, crossed into {base}. 1σ swing from {VOL_LOOKBACK_DAYS} days of daily
          moves, scaled by the square root of time.
        </p>
        <p>No exchange-rate forecasts. PayPal sandbox only — no real money moves.</p>
      </footer>
    </>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className={styles.tile}>
      <p className={styles.tileLabel}>{label}</p>
      <p className={styles.tileValue}>{value}</p>
      <p className={styles.muted}>{note}</p>
    </div>
  );
}

function Timing({ view }: { view: BookView }) {
  const t = view.timing;
  const c = (n: number) => compact(view.base, n);
  const signed = (n: number) => (Math.round(n) === 0 ? c(0) : `${n > 0 ? "+" : "−"}${c(Math.abs(n))}`);
  if (t.rows.length === 0)
    return (
      <section aria-labelledby="timing-h">
        <h2 id="timing-h">What the wait already did</h2>
        <p className={styles.muted}>No foreign-currency payments arrived in the last {TIMING_DAYS} days.</p>
      </section>
    );
  return (
    <section aria-labelledby="timing-h">
      <h2 id="timing-h">What the wait already did — last {TIMING_DAYS} days</h2>
      <p className={styles.timingLead}>
        Money that arrived was worth <strong>{signed(t.net)}</strong> in {view.base} on the day it was paid compared with
        the day it was invoiced
        {Math.round(t.lateNet) !== 0 && (
          <>
            {" "}— <strong>{signed(t.lateNet)}</strong> of that during days the payment was late
          </>
        )}
        .
      </p>
      <p className={styles.muted}>
        History, not a forecast: rate moves while you waited went {signed(t.gains)} for you and {signed(t.losses)} against
        you. The next wait can go either way.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Invoice</th>
              <th scope="col" className={styles.num}>
                Received
              </th>
              <th scope="col">Invoiced → paid</th>
              <th scope="col" className={styles.num}>
                Days late
              </th>
              <th scope="col" className={styles.num}>
                Effect in {view.base}
              </th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={`${r.invoiceId}-${r.paidDate}`} className={r.paidDate === t.to ? styles.today : undefined}>
                <th scope="row">
                  {r.invoiceNumber}
                  {r.paidDate === t.to && " · paid today"}
                </th>
                <td className={styles.num}>{money(r.currency, r.amount)}</td>
                <td>
                  {r.invoiceDate} → {r.paidDate} ({r.daysWaited} days)
                </td>
                <td className={styles.num}>{r.daysLate || ""}</td>
                <td className={styles.num}>{signed(r.effect)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Evidence({ ecb, base, asOf, ccys, lead }: { ecb: EcbQuotes; base: string; asOf: string; ccys: string[]; lead?: string }) {
  const bands = bandsByWait(ecb, base, ccys, asOf);
  if (!bands.length || bands.every((b) => b.n === 0)) return null;
  const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`;
  const at = (h: number) => bands.find((b) => b.currency === lead && b.horizon === h);
  const b7 = at(7);
  const b60 = at(60);
  return (
    <section aria-labelledby="evidence-h">
      <h2 id="evidence-h">How far rates moved while money waited — two years of ECB rates</h2>
      {b7 && b60 && b60.n > 0 && (
        <p className={styles.evidenceLead}>
          Over the last two years, {lead} money that waited 60 days moved between <strong>{pct(b60.p5)}</strong> and{" "}
          <strong>{pct(b60.p95)}</strong> against {base} nine times out of ten. Waiting 7 days: {pct(b7.p5)} to {pct(b7.p95)}.
        </p>
      )}
      <p className={styles.muted}>
        Half-width of the range each currency moved within, nine times out of ten, by days waited. Every ECB fixing in the
        last {LOOKBACK_DAYS} days is a start day. History, not a forecast — the longer money waits, the wider the range.
      </p>
      <WaitChart bands={bands} base={base} />
    </section>
  );
}

function Replay({ r, ecb, input }: { r: AgentRun; ecb: EcbQuotes; input: AgentInput }) {
  if (!r.proposals.length || !input.candidates.length) return null;
  const { asInvoiced, withProposals } = timelines(input, r);
  const a = replayBook(ecb, input.base, asInvoiced, input.asOf);
  const b = replayBook(ecb, input.base, withProposals, input.asOf);
  if (!(a.n > 0 && b.n > 0)) return null;
  const c = (n: number) => compact(input.base, n);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${c(Math.abs(n))}`;
  const wa = a.p95 - a.p5;
  const wb = b.p95 - b.p5;
  const cost = r.proposals.reduce((s, p) => s + (p.kind === "early_pay_discount" ? p.cost : 0), 0);
  return (
    <div className={styles.replay}>
      <p>
        <strong>Your open book, replayed over two years of ECB rates.</strong> If clients pay on the current dates, the
        total in {input.base} would have moved between {signed(a.p5)} and {signed(a.p95)} nine times out of ten. If they
        pay as these proposals ask, between {signed(b.p5)} and {signed(b.p95)}
        {wa > 0 && <> — a range {Math.round((1 - wb / wa) * 100)}% narrower</>}.
        {cost > 0 && <> The discounts offered cost {c(cost)} whichever way rates move.</>}
      </p>
      <p className={styles.muted}>
        Assumptions: an overdue invoice is paid {ASSUME.overdueWaitDays} days from today without a reminder and{" "}
        {ASSUME.afterReminderDays} days after one; a discounted invoice is paid on its new due date; others on their due
        date. {a.n} historical start days, {a.from} to {a.to}. History, not a forecast.
      </p>
    </div>
  );
}

async function AgentPlan({ run, base, readOnly, ecb, input }: { run: Promise<AgentRun>; base: string; readOnly: boolean; ecb: EcbQuotes; input: AgentInput }) {
  const r = await run;
  const reminders = r.proposals.filter((p) => p.kind === "reminder");
  const offers = r.proposals.filter((p) => p.kind === "early_pay_discount");
  const calls = r.steps.filter((s) => s.tool !== "summary").length;
  return (
    <>
      <div className={styles.agentStatus}>
        {r.source === "agent" ? (
          <p>
            <strong>Planned by Claude</strong> ({r.model}) · {calls} tool calls ·{" "}
            {r.rejections === 0 ? "every draft passed the checks first time" : `${r.rejections} draft${r.rejections === 1 ? "" : "s"} rejected by the checks and rewritten`}
          </p>
        ) : (
          <p>
            <strong>Rule-based proposals</strong> · the agent did not run ({r.reason}); fixed wording below
          </p>
        )}
        <p>{r.summary}</p>
        {r.steps.length > 0 && (
          <details>
            <summary>Agent steps</summary>
            <ol className={styles.steps}>
              {r.steps.map((s, i) => (
                <li key={i} data-ok={s.ok}>
                  <code>{s.tool}</code>
                  {s.invoice && <> · {s.invoice}</>} — {s.ok ? s.detail : `rejected: ${s.detail}`}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>

      <Replay r={r} ecb={ecb} input={input} />

      {reminders.length > 0 && (
        <>
          <h3 className={styles.groupH}>Chase what is already late</h3>
          <ul className={styles.cards}>
            {reminders.map((p) => (
              <ProposalCard key={p.invoiceId} p={p} base={base} readOnly={readOnly} agent={r.source === "agent"} />
            ))}
          </ul>
        </>
      )}
      {offers.length > 0 && (
        <>
          <h3 className={styles.groupH}>Pull large, distant invoices closer</h3>
          <p className={styles.note}>
            The PayPal sandbox rejects conditional early-payment rules (HTTP 500), so the agent edits the invoice instead:
            the discount is applied and the due date moves in. The discount stays even if the client pays late.
          </p>
          <ul className={styles.cards}>
            {offers.map((p) => (
              <ProposalCard key={p.invoiceId} p={p} base={base} readOnly={readOnly} agent={r.source === "agent"} />
            ))}
          </ul>
        </>
      )}
      {r.notProposed.length > 0 && (
        <details className={styles.leftAlone}>
          <summary>Left alone ({r.notProposed.length})</summary>
          <ul>
            {r.notProposed.map((n) => (
              <li key={n.invoiceNumber}>
                <strong>{n.invoiceNumber}</strong> — {n.why}{" "}
                <span className={styles.muted}>({n.by === "agent" ? "agent's call" : "not eligible"})</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function ProposalCard({ p, base, readOnly, agent }: { p: AgentProposal; base: string; readOnly: boolean; agent: boolean }) {
  const c = (n: number) => compact(base, n);
  return (
    <li className={styles.card}>
      <p className={styles.cardKind}>
        {p.kind === "reminder" ? "Send a payment reminder" : `Offer ${p.percent}% off to be paid within ${p.withinDays} days`}
      </p>
      <p className={styles.cardTitle}>
        {p.invoiceNumber} · {money(p.currency, p.amount)} <span className={styles.muted}>≈ {c(p.value)}</span>
      </p>
      {p.kind === "reminder" ? (
        <p>
          {p.daysOverdue} days overdue.
          {p.lastReminderAt && <span className={styles.muted}> Last reminder {p.lastReminderAt.slice(0, 10)}.</span>}
        </p>
      ) : (
        <dl className={styles.compare}>
          <div>
            <dt>Cost if the client takes it</dt>
            <dd>{c(p.cost)}</dd>
          </div>
          <div>
            <dt>1σ swing until the due date ({p.daysToDue} days)</dt>
            <dd>{p.swingNow == null ? "n/a" : `±${c(p.swingNow)}`}</dd>
          </div>
          <div>
            <dt>1σ swing if paid within {p.withinDays} days</dt>
            <dd>{p.swingIfEarly == null ? "n/a" : `±${c(p.swingIfEarly)}`}</dd>
          </div>
        </dl>
      )}
      <div className={styles.why}>
        <p>{p.rationale}</p>
        <p className={styles.whySource}>
          {agent ? "Written by Claude · checked: only our numbers, no forecasts or advice" : "Standard wording"}
        </p>
      </div>
      <ApproveForm p={p} base={base} disabledReason={readOnly ? "Read-only demo snapshot" : undefined} />
    </li>
  );
}
