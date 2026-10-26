import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { rulesRun, type AgentInput, type AgentRun } from "@/lib/agent";
import { planFor } from "@/lib/agent-cache";
import { writesAllowed } from "@/lib/access";
import { RATE_SOURCE, type BookInputs } from "@/lib/book";
import { loadInputs } from "@/lib/book-cache";
import { ASSUME, bandsByWait, LOOKBACK_DAYS, replayBook, timelines } from "@/lib/evidence";
import { OPEN_STATUSES } from "@/lib/exposure";
import { BASES, type EcbQuotes } from "@/lib/fx";
import { cell, compact, full, money } from "@/lib/format";
import { clientViewUrl } from "@/lib/paypal";
import { DEFAULT_POLICY } from "@/lib/policy";
import { paidToday, startOfDayValue } from "@/lib/today";
import { BUCKETS, type Bucket, type Invoice } from "@/lib/types";
import { pickBase, SHOCK_PCT, TIMING_DAYS, VOL_LOOKBACK_DAYS, viewFor, type BookView } from "@/lib/view";
import { AutopilotPanel } from "./autopilot-panel";
import { SimulatePayment } from "./client-pay";
import { InvoiceAssistant } from "./invoice-assistant";
import { LiveRefresh } from "./live-refresh";
import { TodayPlan } from "./today";
import { UnlockForm } from "./unlock-form";
import { WaitChart } from "./wait-chart";
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
          Know what exchange rates can take from your unpaid PayPal invoices — and shrink it in one click.
        </p>
      </header>
      <Suspense fallback={<p className={styles.muted}>Loading your PayPal invoices…</p>}>
        <Book searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

type Step = "today" | "exposure" | "evidence" | "invoice" | "autopilot";
// The order is the story: what to do today (the loop), where the risk sits, why waiting is the risk, then
// prevention (the next invoice) and delegation (autopilot).
const STEPS: { id: Step; label: string; next: string }[] = [
  { id: "today", label: "Today", next: "See where the risk sits" },
  { id: "exposure", label: "Where it sits", next: "See what waiting has done before" },
  { id: "evidence", label: "Evidence", next: "Plan the next invoice" },
  { id: "invoice", label: "Next invoice", next: "Hand routine work to the autopilot" },
  { id: "autopilot", label: "Autopilot", next: "" },
];
const pickStep = (s: string | string[] | undefined): Step => STEPS.find((x) => x.id === s)?.id ?? "today";

async function Book({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const base = pickBase(sp.base);
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
  const view = viewFor(inputs, base, new Date());
  const { exposure: e, rates } = view;
  const c = (n: number) => compact(base, n);
  const open = inputs.invoices.filter((i) => OPEN_STATUSES.has(i.status) && i.amountDue > 0);
  const overdue = e.rows.reduce((s, r) => s + r.buckets.overdue * rates[r.currency], 0);
  const skipped = [...inputs.skipped, ...e.skipped];
  const demo = inputs.source === "demo";
  const locked = !demo && !(await writesAllowed());
  const readOnly = demo || locked;
  const lockReason = demo ? "Read-only demo snapshot" : locked ? "Needs the access code" : undefined;
  const step = pickStep(sp.step);
  const href = (st: Step, b: string = base) => `/?base=${b}&step=${st}`;

  // The day's plan (one per home currency); the demo shows the saved one.
  const plan = (): Promise<AgentRun> =>
    demo ? Promise.resolve(inputs.agentRuns?.[base] ?? rulesRun(view.agentInput, "demo snapshot")) : planFor(inputs, base);

  // Before/after for today: payments that arrived today no longer count as exposure.
  const paid = paidToday(inputs.invoices, rates, base, inputs.asOf);
  const startValue = startOfDayValue(e.totalValue, paid, base);
  const startShock = (startValue * SHOCK_PCT) / 100;
  const dropped = startShock - e.totalShock;

  const allDone = inputs.invoices.flatMap((i) => (i.agentLog ?? []).filter((a) => a.kind !== "archived").map((a) => ({ ...a, inv: i })));
  const done = allDone.filter((d) => OPEN_STATUSES.has(d.inv.status)).sort((a, b) => b.at.localeCompare(a.at));
  const doneList = <DoneList done={done} closed={allDone.length - done.length} />;

  return (
    <>
      <nav className={styles.baseNav} aria-label="Home currency">
        <span className={styles.muted}>Home currency</span>
        {BASES.map((b) => (
          <Link key={b} href={href(step, b)} className={styles.basePill} aria-current={b === base ? "true" : undefined}>
            {b}
          </Link>
        ))}
        <span className={styles.sourceBadge} data-source={inputs.source}>
          {inputs.source === "live" ? "Live · PayPal sandbox" : "Demo snapshot"} · as of {inputs.asOf}
        </span>
      </nav>
      {locked && <UnlockForm />}

      <nav aria-label="Steps" className={styles.steps6}>
        <ol>
          {STEPS.map((st, i) => (
            <li key={st.id}>
              <Link href={href(st.id)} aria-current={st.id === step ? "step" : undefined}>
                <span className={styles.stepNum}>{i + 1}</span> {st.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      {step === "today" ? (
        <section className={styles.hero} aria-label="At risk now">
          <p className={styles.heroLabel}>If exchange rates move {SHOCK_PCT}% either way, your unpaid foreign invoices change by about</p>
          <p className={styles.heroValue}>{c(e.totalShock)}</p>
          {Math.round(dropped) > 0 ? (
            <p className={styles.heroDelta}>
              Start of today {c(startShock)} → now {c(e.totalShock)} <strong>(−{c(dropped)})</strong>
            </p>
          ) : null}
          <p className={styles.muted}>
            Up or down — equally likely. The size of the risk, not a forecast. {c(e.totalValue)} owed in{" "}
            {e.rows.map((r) => r.currency).join(", ") || "foreign currencies"}, {c(overdue)} of it overdue.
          </p>
        </section>
      ) : (
        <aside className={styles.score} aria-label="Exposure now">
          <span>
            At risk at ±{SHOCK_PCT}% <strong>{c(e.totalShock)}</strong>
            {Math.round(dropped) > 0 && <span className={styles.ok}> (−{c(dropped)} today)</span>}
          </span>
          <span>
            Owed in foreign currencies <strong>{c(e.totalValue)}</strong>
          </span>
          <span>
            Overdue <strong>{c(overdue)}</strong>
          </span>
        </aside>
      )}

      {step === "today" && (
        <>
          {!demo && <LiveRefresh />}
          {paid.filter((p) => p.invoice.currency !== base).length > 0 && (
            <ul className={styles.notices} aria-label="Paid today">
              {paid
                .filter((p) => p.invoice.currency !== base)
                .map((p) => (
                  <li key={p.invoice.id}>
                    ✓ Paid today: <strong>{p.invoice.number}</strong>
                    {p.invoice.recipientName && <> · {p.invoice.recipientName}</>} · {money(p.invoice.currency, p.amount)} —{" "}
                    {c((p.value * SHOCK_PCT) / 100)} no longer at risk at ±{SHOCK_PCT}%
                  </li>
                ))}
            </ul>
          )}
          {!readOnly && (
            <p className={styles.tryIt}>
              <strong>Try it:</strong> <span>① Approve a proposal below — it runs in PayPal</span>
              <span>② Pay it as the client</span>
              <span>③ Watch the number above go down</span>
            </p>
          )}
          <section aria-labelledby="actions-h">
            <h2 id="actions-h">What the agent proposes today</h2>
            <Suspense fallback={<p className={styles.why}>The agent is planning today… (about 30 seconds, once a day)</p>}>
              <TodayPlan
                run={plan()}
                base={base}
                input={view.agentInput}
                invoices={inputs.invoices}
                ecb={inputs.ecb}
                lockReason={lockReason}
                evidenceHref={href("evidence")}
                paidValue={Object.fromEntries(paid.map((p) => [p.invoice.id, p.value]))}
              />
            </Suspense>
          </section>
          <details className={styles.sandboxPanel}>
            <summary>Act as the client for any open invoice (sandbox)</summary>
            <ClientTable open={open} rates={rates} lockReason={lockReason} />
          </details>
          {doneList}
        </>
      )}

      {step === "exposure" && (
        <>
          <section className={styles.tiles} aria-label="Summary">
            <Tile
              label="Owed to you in foreign currencies"
              value={c(e.totalValue)}
              note={`${open.filter((i) => i.currency !== base).length} open invoices · ${e.rows.map((r) => r.currency).join(" · ") || "none"}`}
            />
            <Tile label="Already overdue" value={c(overdue)} note="still exposed every day it stays unpaid" />
            <Tile label={`Owed in ${base} (no FX risk)`} value={c(e.baseTotal)} note={`${open.filter((i) => i.currency === base).length} open invoices`} />
          </section>
          <ExposureTable view={view} skipped={skipped} archived={inputs.archived} />
          <Timing view={view} />
        </>
      )}

      {step === "evidence" && (
        <>
          <Evidence ecb={inputs.ecb} base={base} asOf={inputs.asOf} ccys={e.rows.map((r) => r.currency)} lead={e.rows.slice().sort((a, b) => b.value - a.value)[0]?.currency} />
          <Suspense fallback={null}>
            <ReplayFor run={plan()} ecb={inputs.ecb} input={view.agentInput} />
          </Suspense>
        </>
      )}

      {step === "invoice" && (
        <section aria-labelledby="new-h">
          <h2 id="new-h">Before you send the next invoice</h2>
          <p className={styles.muted}>
            Describe it in a sentence. Claude reads it into fields; code prices each way of billing from this client&apos;s
            payment history and the ECB rates; Claude compares them in plain words. Nothing is created until you approve one.
          </p>
          <InvoiceAssistant base={base} clients={[...new Set(inputs.invoices.map((i) => i.recipientName).filter((n): n is string => !!n))].sort()} />
        </section>
      )}

      {step === "autopilot" && (
        <>
          <section aria-labelledby="autopilot-h">
            <h2 id="autopilot-h">Standing orders</h2>
            <p className={styles.muted}>
              Approve a policy once and the agent runs the proposals it covers without asking — same agent, same checks, same
              PayPal calls, each one marked &ldquo;autopilot&rdquo; below. Anything outside the policy keeps waiting for your
              click. The policy is stored in your PayPal account as an invoice template.
            </p>
            <AutopilotPanel policy={inputs.policy ?? DEFAULT_POLICY} base={base} readOnly={readOnly} />
          </section>
          {doneList}
        </>
      )}

      <StepFooter step={step} href={href} />

      <footer className={styles.footer}>
        <p>
          Rates: {RATE_SOURCE}, {inputs.ecb.date}, crossed into {base}. Typical swing (1σ) from {VOL_LOOKBACK_DAYS} days of
          daily moves, scaled by the square root of time.
        </p>
        <p>No exchange-rate forecasts. PayPal sandbox only — no real money moves.</p>
      </footer>
    </>
  );
}

function StepFooter({ step, href }: { step: Step; href: (s: Step) => string }) {
  const i = STEPS.findIndex((s) => s.id === step);
  const prev = STEPS[i - 1];
  const next = STEPS[i + 1];
  return (
    <nav className={styles.stepFooter} aria-label="Next step">
      {prev ? (
        <Link href={href(prev.id)} className={styles.link}>
          ← {prev.label}
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={href(next.id)} className={styles.nextStep}>
          {STEPS[i].next} → <span className={styles.muted}>Step {i + 2}: {next.label}</span>
        </Link>
      )}
    </nav>
  );
}

function ClientTable({ open, rates, lockReason }: { open: Invoice[]; rates: Record<string, number>; lockReason?: string }) {
  return (
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
          {open
            .slice()
            .sort((a, b) => (rates[b.currency] ?? 0) * b.amountDue - (rates[a.currency] ?? 0) * a.amountDue)
            .map((i) => (
              <tr key={i.id}>
                <th scope="row">{i.number}</th>
                <td>{i.recipientName ?? ""}</td>
                <td className={styles.num}>{money(i.currency, i.amountDue)}</td>
                <td>{i.dueDate}</td>
                <td>
                  <div className={styles.inlineForm}>
                    <a href={clientViewUrl(i.id)} target="_blank" rel="noopener noreferrer" className={styles.link}>
                      Open as client ↗
                    </a>
                    <SimulatePayment invoiceId={i.id} disabledReason={lockReason} />
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

async function ReplayFor({ run, ecb, input }: { run: Promise<AgentRun>; ecb: EcbQuotes; input: AgentInput }) {
  return <Replay r={await run} ecb={ecb} input={input} />;
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
  const signed = (n: number) => <span className={styles.nowrap}>{`${n >= 0 ? "+" : "−"}${c(Math.abs(n))}`}</span>;
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

function DoneList({ done, closed }: { done: { kind: string; at: string; auto?: true; inv: Invoice }[]; closed: number }) {
  return (
    <section aria-labelledby="done-h">
      <h2 id="done-h">Done by the agent</h2>
      {done.length === 0 ? (
        <p className={styles.muted}>Nothing yet. Approved actions show up here and stay recorded on the invoice.</p>
      ) : (
        <ul className={styles.doneList}>
          {done.map((d) => (
            <li key={`${d.inv.id}-${d.kind}-${d.at}`}>
              <time dateTime={d.at}>{d.at.slice(0, 16).replace("T", " ")} UTC</time>
              <span>
                {d.kind === "reminder" ? "Reminder sent" : d.kind === "created" ? "Invoice created" : "Early-payment discount applied"}
                {d.auto && <strong className={styles.autoTag}> · autopilot</strong>}
              </span>
              <span>
                {d.inv.number} · {money(d.inv.currency, d.inv.amountDue)} still owed, due {d.inv.dueDate}
              </span>
            </li>
          ))}
        </ul>
      )}
      {closed > 0 && (
        <p className={styles.muted}>
          {closed} earlier {closed === 1 ? "action" : "actions"} on invoices since paid or cancelled not listed.
        </p>
      )}
    </section>
  );
}

function ExposureTable({ view, skipped, archived }: { view: BookView; skipped: { id: string; reason: string }[]; archived: number }) {
  const { exposure: e, rates, base } = view;
  const c = (n: number) => compact(base, n);
  const cellValue = e.rows.flatMap((r) => BUCKETS.map((b) => r.buckets[b] * rates[r.currency]));
  const maxCell = Math.max(1, ...cellValue);
  const level = (v: number) => (v > 0 ? Math.min(5, Math.ceil((v / maxCell) * 5)) : 0);
  return (
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
      {(skipped.length > 0 || archived > 0) && (
        <p className={styles.muted}>
          {skipped.length > 0 && (
            <span className={styles.warn}>
              Not counted ({skipped.length}): {skipped.map((s) => `${s.id} — ${s.reason}`).join("; ")}.{" "}
            </span>
          )}
          {archived > 0 && <>{archived} retired demo invoices are left out on purpose.</>}
        </p>
      )}
    </section>
  );
}
