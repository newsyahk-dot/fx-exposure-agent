import Link from "next/link";
import { after, connection } from "next/server";
import { Suspense } from "react";
import { REQUEST_MAX, rulesRun, type AgentInput, type AgentRun } from "@/lib/agent";
import { askFor, planFor, warmOtherPlans } from "@/lib/agent-cache";
import { newInvoicesRequest } from "@/lib/autopilot";
import { notInPlan } from "@/lib/plan-state";
import { writesAllowed } from "@/lib/access";
import { RATE_SOURCE, type BookInputs } from "@/lib/book";
import { loadInputsForPage } from "@/lib/book-cache";
import { StaleNotice } from "./stale-notice";
import { ASSUME, bandsByWait, LOOKBACK_DAYS, replayBook, timelines } from "@/lib/evidence";
import { OPEN_STATUSES } from "@/lib/exposure";
import { BASES, type EcbQuotes } from "@/lib/fx";
import { cell, compact, full, money } from "@/lib/format";
import { clientViewUrl } from "@/lib/paypal";
import { DEFAULT_POLICY, NEW_TERMS_DAYS } from "@/lib/policy";
import { dayChange, paidToday } from "@/lib/today";
import { BUCKETS, type Bucket, type Invoice } from "@/lib/types";
import { pickBase, SHOCK_PCT, TIMING_DAYS, VOL_LOOKBACK_DAYS, viewFor, type BookView } from "@/lib/view";
import { AutopilotPanel } from "./autopilot-panel";
import { SimulatePayment } from "./client-pay";
import { ResetDemoButton } from "./reset-demo";
import { InvoiceAssistant } from "./invoice-assistant";
import { LiveRefresh } from "./live-refresh";
import { TodayPlan, widthPhrase } from "./today";
import { UnlockForm } from "./unlock-form";
import { WaitChart } from "./wait-chart";
import { HeroValue } from "./hero-value";
import { Logo } from "./logo";
import { InvoiceGrid } from "./invoice-grid";
import { AskAgent } from "./ask-agent";
import { AskResult } from "./ask-result";
import { ReplanButton } from "./replan-button";
import { NavLink } from "./nav-link";
import { PreloadGrid } from "./preload-grid";
import { ExposureGrid, type ExposureRow } from "./exposure-grid";
import { invoiceRows } from "@/lib/invoice-rows";
import styles from "./page.module.css";

const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Overdue",
  w1: "0–6 days",
  w2: "7–13 days",
  w3: "14–20 days",
  w4: "21–27 days",
  later: "28+ days",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Server actions on this page include the demo reset (~20-40 s).
export const maxDuration = 300;

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Logo />
          <h1>FX Exposure Agent</h1>
        </div>
        <p className={styles.lede}>
          Get paid sooner from clients abroad — and see what exchange rates can do to the money you&apos;re still waiting for.
        </p>
        <p>
          <Link href="/try" className={`${styles.link} ${styles.tryLink}`}>
            Try it with your own invoices →
          </Link>
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
const PERSONA_HOME = "USD"; // the demo book's seller is US-based

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
  let stale = false;
  try {
    ({ inputs, stale } = await loadInputsForPage());
  } catch {
    return <StaleNotice failed />;
  }
  const view = viewFor(inputs, base, new Date());
  const { exposure: e, rates } = view;
  const c = (n: number) => compact(base, n);
  const open = inputs.invoices.filter((i) => OPEN_STATUSES.has(i.status) && i.amountDue > 0);
  const overdue = e.rows.reduce((s, r) => s + r.buckets.overdue * rates[r.currency], 0);
  const overdueCount = open.filter((i) => i.currency !== base && (rates[i.currency] ?? 0) > 0 && i.dueDate < inputs.asOf).length;
  // The demo persona lives in the US; another home currency shows the same book as if that were home.
  const away = base === PERSONA_HOME ? "from clients abroad" : `in currencies other than ${base}`;
  const skipped = [...inputs.skipped, ...e.skipped];
  const demo = inputs.source === "demo";
  const locked = !demo && !(await writesAllowed());
  const readOnly = demo || locked;
  const lockReason = demo ? "Read-only demo snapshot" : locked ? "Needs the access code" : undefined;
  const step = pickStep(sp.step);
  const ask = (typeof sp.ask === "string" ? sp.ask : "").trim().slice(0, REQUEST_MAX);
  const href = (st: Step, b: string = base) => `/?base=${b}&step=${st}`;

  // The day's plan (one per home currency); the demo shows the saved one.
  const plan = (): Promise<AgentRun> =>
    demo ? Promise.resolve(inputs.agentRuns?.[base] ?? rulesRun(view.agentInput, "demo snapshot")) : planFor(inputs, base);

  // Keep the other home currencies' plans ready, so a currency switch never waits a minute for the agent.
  if (!demo) after(() => warmOtherPlans(inputs, base, BASES));

  // Before/after for today: payments that arrived today no longer count as exposure.
  const paid = paidToday(inputs.invoices, rates, base, inputs.asOf);
  const day = dayChange(inputs.invoices, paid, rates, base, inputs.asOf);

  const allDone = inputs.invoices.flatMap((i) => (i.agentLog ?? []).filter((a) => a.kind !== "archived").map((a) => ({ ...a, inv: i })));
  const done = allDone.filter((d) => OPEN_STATUSES.has(d.inv.status)).sort((a, b) => b.at.localeCompare(a.at));
  const doneList = <DoneList done={done} closed={allDone.length - done.length} />;

  return (
    <>
      {stale && <StaleNotice />}
      <div className={styles.contextRow}>
        <p className={styles.persona}>
          <span className={styles.avatar} aria-hidden="true">
            M
          </span>
          <span>
            <strong>Maya</strong>, freelance designer in the US
            <span className={styles.muted}>
              {" "}
              · clients in Europe, the UK and Japan · demo book
              {base !== PERSONA_HOME && <> · shown in {base}, so her US-dollar invoices count as foreign here</>}
            </span>
          </span>
        </p>
        <span className={styles.sourceBadge} data-source={inputs.source}>
          {inputs.source === "live" ? "Live · PayPal sandbox" : "Demo snapshot"} · as of {inputs.asOf}
          {!readOnly && <span className={styles.ok}> · actions unlocked</span>}
        </span>
      </div>
      <nav className={styles.baseNav} aria-label="Home currency">
        <span className={styles.muted}>Show amounts in</span>
        {BASES.map((b) => (
          <NavLink key={b} href={href(step, b)} className={styles.basePill} aria-current={b === base ? "true" : undefined}>
            {b}
          </NavLink>
        ))}
      </nav>
      {locked && <UnlockForm />}

      <nav aria-label="Steps" className={styles.steps6}>
        <ol>
          {STEPS.map((st, i) => (
            <li key={st.id}>
              <NavLink href={href(st.id)} aria-current={st.id === step ? "step" : undefined}>
                <span className={styles.stepNum}>{i + 1}</span> {st.label}
              </NavLink>
            </li>
          ))}
        </ol>
      </nav>
      {step !== "exposure" && <PreloadGrid />}

      <div className={styles.stepBody}>
      {step === "today" ? (
        <section className={styles.hero} aria-label="Waiting to be paid">
          <p className={styles.heroLabel}>
            Waiting to be paid {away}, in {listAnd(e.rows.map((r) => r.currency)) || "foreign currencies"}
          </p>
          <HeroValue value={e.totalValue} base={base} collected={day.paid} />
          <div className={styles.heroChips}>
            {overdue > 0 && (
              <span className={styles.statChip} data-tone="late">
                <strong>{c(overdue)}</strong> overdue · {overdueCount} invoice{overdueCount === 1 ? "" : "s"}
              </span>
            )}
            <span className={styles.statChip} title="A stress test: up or down, equally likely — the size of the risk, not a forecast.">
              <strong>±{c(e.totalShock)}</strong> if rates move {SHOCK_PCT}% either way
            </span>
          </div>
          <p className={styles.muted}>Up or down, equally likely — the size of the risk, not a forecast.</p>
          {Math.round(day.paid) > 0 || Math.round(day.added) > 0 ? (
            <p className={styles.heroDelta}>
              Start of today {c(e.totalValue + day.paid - day.added)} → now {c(e.totalValue)}
              {Math.round(day.paid) > 0 && <strong> (+{c(day.paid)} collected today)</strong>}
              {Math.round(day.added) > 0 && <span className={styles.muted}> (+{c(day.added)} new invoices today)</span>}
            </p>
          ) : null}
        </section>
      ) : (
        <aside className={styles.score} aria-label="Waiting to be paid">
          <span>
            Waiting {away} <strong>{c(e.totalValue)}</strong>
            {Math.round(day.paid) > 0 && <span className={styles.ok}> (+{c(day.paid)} collected today)</span>}
          </span>
          <span>
            Overdue <strong>{c(overdue)}</strong>
          </span>
          <span>
            If rates move ±{SHOCK_PCT}% <strong>±{c(e.totalShock)}</strong>
          </span>
        </aside>
      )}

      {step === "today" && (
        <>
          {!demo && <LiveRefresh />}
          {!readOnly && (
            <p className={styles.tryIt}>
              <strong>Try it:</strong> <span>① Approve a card — it runs in PayPal</span>
              <span>② Pay it as the client</span>
              <span>③ See &ldquo;collected&rdquo; above</span>
            </p>
          )}
          {locked && (
            <p className={styles.tryIt}>
              <strong>How it works:</strong> <span>① Approve a card — it runs in PayPal</span>
              <span>② The client pays on PayPal</span>
              <span>③ &ldquo;+… collected&rdquo; appears here</span>
              <span className={styles.muted}>Access code above to try it.</span>
            </p>
          )}
          <section aria-labelledby="actions-h">
            <h2 id="actions-h">What the agent proposes today</h2>
            {/* key: a new home currency is a new boundary, so its fallback shows at once instead of the old plan
                staying on screen until the new one is ready (React keeps revealed content during a navigation). */}
            <Suspense key={base} fallback={<PlanPlaceholder />}>
              <TodayPlan
                run={plan()}
                base={base}
                input={view.agentInput}
                invoices={inputs.invoices}
                ecb={inputs.ecb}
                lockReason={lockReason}
                evidenceHref={href("evidence")}
                paidValue={Object.fromEntries(paid.map((p) => [p.invoice.id, p.value]))}
                waiting={open
                  .filter((i) => i.currency !== base && (rates[i.currency] ?? 0) > 0)
                  .map((i) => ({ id: i.id, value: i.amountDue * rates[i.currency] }))}
                paidToday={{ value: day.paid, count: paid.filter((p) => p.invoice.currency !== base).length }}
                sharedDemo={demo ? undefined : { startedAt: inputs.startedAt }}
              />
            </Suspense>
          </section>
          {!demo && (
            <Suspense key={`new-${base}`} fallback={null}>
              <NewSincePlan
                run={plan()}
                inputs={inputs}
                base={base}
                input={view.agentInput}
                locked={locked}
                ownBase={base === pickBase(inputs.policy?.base)}
                lockReason={lockReason}
                paidValue={Object.fromEntries(paid.map((p) => [p.invoice.id, p.value]))}
              />
            </Suspense>
          )}
          <section aria-labelledby="ask-h" id="ask">
            <h2 id="ask-h">Ask the agent</h2>
            <p className={styles.muted}>In your own words — same tools, same checks, nothing runs without your click.</p>
            <AskAgent current={ask} maxLength={REQUEST_MAX} />
            {ask &&
              (demo ? (
                <p className={styles.muted}>The read-only demo snapshot cannot ask the agent; the live demo can.</p>
              ) : locked ? (
                <p className={styles.warn}>Enter the access code at the top of the page to ask the agent (it calls the model).</p>
              ) : (
                <Suspense key={`${base}|${ask}`} fallback={<p className={`${styles.why} ${styles.slowNote}`}>The agent is working on your request… (about 20–30 seconds)</p>}>
                  <AskResult
                    run={askFor(inputs, base, ask)}
                    request={ask}
                    base={base}
                    input={view.agentInput}
                    invoices={inputs.invoices}
                    lockReason={lockReason}
                    paidValue={Object.fromEntries(paid.map((p) => [p.invoice.id, p.value]))}
                  />
                </Suspense>
              ))}
          </section>
          <details className={styles.sandboxPanel}>
            <summary>Sandbox controls: pay any open invoice as the client, or start the demo over</summary>
            <ClientTable open={open} rates={rates} lockReason={lockReason} />
            <ResetDemoButton disabledReason={lockReason} />
          </details>
          <details className={styles.leftAlone}>
            <summary>Done by the agent ({done.length})</summary>
            <DoneList done={done} closed={allDone.length - done.length} bare />
          </details>
        </>
      )}

      {step === "exposure" && (
        <>
          <ExposureTable view={view} skipped={skipped} baseOpen={open.filter((i) => i.currency === base).length} />
          <section aria-labelledby="grid-h">
            <h2 id="grid-h">Every open invoice, by what it puts at risk</h2>
            <p className={styles.muted}>
              Sort any column, search, and download the list. &ldquo;Agent today&rdquo; shows what the agent proposed or did for
              each invoice; an invoice number opens it in PayPal as the client sees it.
            </p>
            <Suspense key={base} fallback={<p className={`${styles.muted} ${styles.slowNote}`}>Loading the invoice list…</p>}>
              <GridSection run={plan()} invoices={inputs.invoices} view={view} asOf={inputs.asOf} lockReason={lockReason} />
            </Suspense>
          </section>
          <Timing view={view} />
        </>
      )}

      {step === "evidence" && (
        <>
          <Evidence ecb={inputs.ecb} base={base} asOf={inputs.asOf} ccys={e.rows.map((r) => r.currency)} lead={e.rows.slice().sort((a, b) => b.value - a.value)[0]?.currency} />
          <Suspense key={base} fallback={null}>
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
            <ol className={styles.flow} aria-label="How the autopilot decides">
              <li>
                <strong>Every weekday, 00:17 UTC</strong>
                <span>the agent makes the day&apos;s plan</span>
              </li>
              <li>
                <strong>Inside your policy?</strong>
                <span>the kinds of action and limits you approved</span>
              </li>
              <li data-tone="good">
                <strong>Yes — it runs in PayPal</strong>
                <span>same checks, marked &ldquo;autopilot&rdquo;</span>
              </li>
              <li data-tone="wait">
                <strong>No — it waits for you</strong>
                <span>on the Today screen</span>
              </li>
            </ol>
            <AutopilotPanel policy={inputs.policy ?? DEFAULT_POLICY} base={base} readOnly={readOnly} />
          </section>
          {doneList}
        </>
      )}

      </div>

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

// Shown while the day's plan streams in. Usually that takes a fraction of a second (the plan is cached), so only
// outlines show at first; the note appears only if the wait is long (the first plan of the day for a currency).
function PlanPlaceholder() {
  return (
    <div className={styles.planPlaceholder} aria-busy="true">
      <p className={`${styles.why} ${styles.slowNote}`}>The agent is planning today — reading your invoices in PayPal… (about a minute, once a day)</p>
      <ul className={styles.cards} aria-hidden="true">
        <li className={styles.skeletonCard} />
        <li className={styles.skeletonCard} />
        <li className={styles.skeletonCard} />
      </ul>
    </div>
  );
}

const listAnd = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

function StepFooter({ step, href }: { step: Step; href: (s: Step) => string }) {
  const i = STEPS.findIndex((s) => s.id === step);
  const prev = STEPS[i - 1];
  const next = STEPS[i + 1];
  return (
    <nav className={styles.stepFooter} aria-label="Next step">
      {prev ? (
        <NavLink href={href(prev.id)} className={styles.link}>
          ← {prev.label}
        </NavLink>
      ) : (
        <span />
      )}
      {next && (
        <NavLink href={href(next.id)} className={styles.nextStep}>
          {STEPS[i].next} → <span className={styles.muted}>Step {i + 2}: {next.label}</span>
        </NavLink>
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

// Invoices sent after the day's plan was made. A PayPal webhook already asked the agent about them (for the seller's
// policy currency) and ran what the approved policy covers; this shows the agent's answer and what waits for a click.
// Visitors without the access code only see it where the webhook has already made it (no new model call).
async function NewSincePlan({
  run,
  inputs,
  base,
  input,
  locked,
  ownBase,
  lockReason,
  paidValue,
}: {
  run: Promise<AgentRun>;
  inputs: BookInputs;
  base: string;
  input: AgentInput;
  locked: boolean;
  ownBase: boolean;
  lockReason?: string;
  paidValue: Record<string, number>;
}) {
  const r = await run.catch(() => null);
  if (!r) return null;
  const missing = notInPlan(r, input).map((m) => m.invoiceNumber);
  // Invoices the plan never saw on which the autopilot already acted (after a PayPal event): shown as done.
  const seen = new Set([...r.proposals.map((p) => p.invoiceNumber), ...r.notProposed.map((n) => n.invoiceNumber)]);
  const autoDone = inputs.invoices.flatMap((i) =>
    seen.has(i.number) || missing.includes(i.number)
      ? []
      : (i.agentLog ?? []).filter((a) => a.auto && a.kind !== "archived" && a.at >= (r.plannedAt ?? "")).map((a) => ({ inv: i, a })),
  );
  if (!missing.length && !autoDone.length) return null;
  const list = missing.join(", ");
  return (
    <section aria-labelledby="new-since-h" className={styles.newSince}>
      <h2 id="new-since-h">New since today&apos;s plan</h2>
      {missing.length > 0 && inputs.policy?.enabled && inputs.policy.discounts && (
        <p className={styles.muted}>
          Your autopilot leaves invoices sent in the last {NEW_TERMS_DAYS} days on the terms you chose — any offer here waits for your click.
        </p>
      )}
      {autoDone.length > 0 && (
        <ul className={styles.notices} aria-label="Done by the autopilot after a PayPal event">
          {autoDone.map(({ inv, a }) => (
            <li key={`${inv.id}-${a.kind}-${a.at}`}>
              ✓ PayPal told the agent about <strong>{inv.number}</strong>
              {inv.recipientName && <> · {inv.recipientName}</>}; the autopilot{" "}
              {a.kind === "reminder" ? "sent a reminder" : "sent an early-payment offer"} at {a.at.slice(11, 16)} UTC, as your
              approved policy allows — no click needed. Now {money(inv.currency, inv.amountDue)} owed, due {inv.dueDate}.
            </li>
          ))}
        </ul>
      )}
      {!missing.length ? null : locked && !ownBase ? (
        <p className={styles.muted}>
          {list} arrived after the plan. The agent looks at new invoices in the seller&apos;s policy currency (
          {pickBase(inputs.policy?.base)}); switch to it, or enter the access code to ask here.
        </p>
      ) : (
        <Suspense key={list} fallback={<p className={`${styles.why} ${styles.slowNote}`}>The agent is looking at {list}… (about 20 seconds)</p>}>
          <AskResult
            run={askFor(inputs, base, newInvoicesRequest(missing), true)}
            request={newInvoicesRequest(missing)}
            heading={`PayPal: ${list} sent after today's plan — the agent looked at ${missing.length === 1 ? "it" : "them"} on its own.`}
            base={base}
            input={input}
            invoices={inputs.invoices}
            lockReason={lockReason}
            paidValue={paidValue}
          />
        </Suspense>
      )}
      <div className={styles.replanRow}>
        <span className={styles.muted}>Or make a fresh plan for the whole book:</span>
        <ReplanButton base={base} disabledReason={lockReason} />
      </div>
    </section>
  );
}

async function GridSection({
  run,
  invoices,
  view,
  asOf,
  lockReason,
}: {
  run: Promise<AgentRun>;
  invoices: Invoice[];
  view: BookView;
  asOf: string;
  lockReason?: string;
}) {
  const r = await run.catch(() => null);
  const rows = invoiceRows(invoices, view.rates, view.vols, { base: view.base, asOf, shockPct: SHOCK_PCT, input: view.agentInput, run: r });
  return (
    <InvoiceGrid rows={rows} base={view.base} lockReason={lockReason} clientUrls={Object.fromEntries(rows.map((x) => [x.id, clientViewUrl(x.id)]))} />
  );
}

async function ReplayFor({ run, ecb, input }: { run: Promise<AgentRun>; ecb: EcbQuotes; input: AgentInput }) {
  return <Replay r={await run} ecb={ecb} input={input} />;
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
        pay sooner, as these proposals ask, between {signed(b.p5)} and {signed(b.p95)}
        {wa > 0 && (
          <>
            {" "}
            — {widthPhrase(wb / wa)}
          </>
        )}
        .
        {" "}A narrower range is not a gain: the money could have moved either way.
        {cost > 0 && <> The discounts offered cost {c(cost)} for certain — a price for being paid sooner, not a hedge.</>}
      </p>
      <p className={styles.muted}>
        Assumptions: an overdue invoice is paid {ASSUME.overdueWaitDays} days from today without a reminder and{" "}
        {ASSUME.afterReminderDays} days after one; a discounted invoice is paid on its new due date; others on their due
        date. {a.n} historical start days, {a.from} to {a.to}. History, not a forecast.
      </p>
    </div>
  );
}

function DoneList({ done, closed, bare = false }: { done: { kind: string; at: string; auto?: true; inv: Invoice }[]; closed: number; bare?: boolean }) {
  return (
    <section aria-labelledby={bare ? undefined : "done-h"} aria-label={bare ? "Done by the agent" : undefined}>
      {!bare && <h2 id="done-h">Done by the agent</h2>}
      {done.length === 0 ? (
        <p className={styles.muted}>Nothing yet. Approved actions show up here and stay recorded on the invoice.</p>
      ) : (
        <ul className={styles.doneList}>
          {done.map((d) => (
            <li key={`${d.inv.id}-${d.kind}-${d.at}`}>
              <time dateTime={d.at}>{d.at.slice(0, 16).replace("T", " ")} UTC</time>
              <span>
                {d.kind === "reminder" ? "Reminder sent" : d.kind === "created" ? "Invoice created" : "Early-payment offer sent"}
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

function ExposureTable({ view, skipped, baseOpen }: { view: BookView; skipped: { id: string; reason: string }[]; baseOpen: number }) {
  const { exposure: e, rates, base } = view;
  const c = (n: number) => compact(base, n);
  return (
    <section aria-labelledby="exposure-h">
      <h2 id="exposure-h">Where the exposure sits</h2>
      <p className={styles.muted}>Unpaid amounts by currency and by when they fall due. Darker cells hold more money in {base} terms.</p>
      <ExposureGrid
        base={base}
        buckets={BUCKETS}
        labels={BUCKET_LABEL}
        rows={e.rows.map((r) => ({
          currency: r.currency,
          cells: Object.fromEntries(
            BUCKETS.map((b) => {
              const v = r.buckets[b] * rates[r.currency];
              return [b, { text: cell(r.currency, r.buckets[b]), value: v, title: v ? `${money(r.currency, r.buckets[b])} ≈ ${full(base, v)}` : undefined }];
            }),
          ) as ExposureRow["cells"],
          value: c(r.value),
          shock: `±${c(r.shock)}`,
        }))}
        total={{
          currency: "Total",
          total: true,
          cells: Object.fromEntries(
            BUCKETS.map((b) => {
              const v = e.rows.reduce((s, r) => s + r.buckets[b] * rates[r.currency], 0);
              return [b, { text: c(v), value: v }];
            }),
          ) as ExposureRow["cells"],
          value: c(e.totalValue),
          shock: `±${c(e.totalShock)}`,
        }}
      />
      <p className={styles.muted}>Click a cell to see those invoices in the grid below; click a currency to see all of its invoices.</p>
      <p className={styles.muted}>
        {e.baseTotal > 0 && (
          <>
            Not in the table above: {c(e.baseTotal)} owed in {base} across {baseOpen} open invoice{baseOpen === 1 ? "" : "s"} — no
            exchange-rate risk (the grid below lists them too, because late ones are chased like any other).{" "}
          </>
        )}
        {skipped.length > 0 && (
          <span className={styles.warn}>
            Not counted ({skipped.length}): {skipped.map((s) => `${s.id} — ${s.reason}`).join("; ")}.
          </span>
        )}
      </p>
    </section>
  );
}
