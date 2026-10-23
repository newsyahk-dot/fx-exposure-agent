import { connection } from "next/server";
import { Suspense } from "react";
import { loadInputs, RATE_SOURCE, type BookInputs } from "@/lib/book";
import { factsFor, proposalKey, type Explanation } from "@/lib/explain";
import { cachedExplanations } from "@/lib/explanations";
import { computeExposure, OPEN_STATUSES } from "@/lib/exposure";
import { cell, krwCompact, krwFull, money } from "@/lib/format";
import { buildProposals, type Proposal } from "@/lib/proposals";
import { BUCKETS, type Bucket } from "@/lib/types";
import { ApproveButton } from "./approve-button";
import styles from "./page.module.css";

const SHOCK_PCT = 3;

const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Overdue",
  w1: "Due in 0–6 days",
  w2: "7–13 days",
  w3: "14–20 days",
  w4: "21–27 days",
  later: "28+ days",
};

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>FX Exposure Agent</h1>
        <p className={styles.lede}>
          How much of the money your clients still owe you is riding on exchange rates — and what you can do in PayPal to
          shorten it.
        </p>
      </header>
      <Suspense fallback={<p className={styles.muted}>Loading your PayPal invoices…</p>}>
        <Book />
      </Suspense>
    </main>
  );
}

async function Book() {
  await connection();
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
  const e = computeExposure(inputs.invoices, inputs.rates, inputs.asOf, { shockPct: SHOCK_PCT });
  const proposals = buildProposals(inputs.invoices, inputs.rates, inputs.asOf, { dailyVols: inputs.dailyVols, now: new Date() });
  const readOnly = inputs.source === "demo";
  // Started now, awaited inside each card's Suspense boundary: the page never waits on the model.
  const explanations: Promise<Record<string, Explanation>> = inputs.explanations
    ? Promise.resolve(inputs.explanations)
    : cachedExplanations(proposals.map(factsFor));
  // Actions on invoices still open. Ones on invoices since paid or cancelled are counted, not listed.
  const allDone = inputs.invoices.flatMap((i) => (i.agentLog ?? []).map((a) => ({ ...a, inv: i })));
  const done = allDone.filter((d) => OPEN_STATUSES.has(d.inv.status)).sort((a, b) => b.at.localeCompare(a.at));
  const doneClosed = allDone.length - done.length;
  const open = inputs.invoices.filter((i) => OPEN_STATUSES.has(i.status) && i.amountDue > 0);
  const overdueKrw = e.rows.reduce((s, r) => s + r.buckets.overdue * inputs.rates[r.currency], 0);
  const skipped = [...inputs.skipped, ...e.skipped];

  // Cell shade = KRW value of the cell, five steps of one blue ramp (magnitude, not identity).
  const cellKrw = e.rows.flatMap((r) => BUCKETS.map((b) => r.buckets[b] * inputs.rates[r.currency]));
  const maxCell = Math.max(1, ...cellKrw);
  const level = (krw: number) => (krw > 0 ? Math.min(5, Math.ceil((krw / maxCell) * 5)) : 0);

  return (
    <>
      <p className={styles.sourceBadge} data-source={inputs.source}>
        {inputs.source === "live" ? "Live · PayPal sandbox" : "Demo snapshot"} · as of {inputs.asOf}
      </p>

      <section className={styles.hero} aria-label="Headline">
        <p className={styles.heroLabel}>If the won moves {SHOCK_PCT}% either way, what you are owed changes by about</p>
        <p className={styles.heroValue}>{krwCompact(e.totalShockKrw)}</p>
        <p className={styles.muted}>
          Up or down — equally likely. This is the size of the risk, not a forecast.
        </p>
      </section>

      <section className={styles.tiles} aria-label="Summary">
        <Tile label="Owed to you in foreign currency" value={krwCompact(e.totalKrw)} note={`${open.length} open invoices`} />
        <Tile label="Already overdue" value={krwCompact(overdueKrw)} note={`${proposals.filter((p) => p.kind === "reminder").length} large enough to chase`} />
        <Tile label="Currencies" value={String(e.rows.length)} note={e.rows.map((r) => r.currency).join(" · ")} />
      </section>

      <section aria-labelledby="exposure-h">
        <h2 id="exposure-h">Where the exposure sits</h2>
        <p className={styles.muted}>
          Unpaid amounts by currency and by when they fall due. Darker cells hold more money in won terms.
        </p>
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
                <th scope="col" className={styles.num}>In won</th>
                <th scope="col" className={styles.num}>±{SHOCK_PCT}%</th>
              </tr>
            </thead>
            <tbody>
              {e.rows.map((r) => (
                <tr key={r.currency}>
                  <th scope="row">{r.currency}</th>
                  {BUCKETS.map((b) => {
                    const krw = r.buckets[b] * inputs.rates[r.currency];
                    return (
                      <td
                        key={b}
                        className={`${styles.num} ${styles.heat}`}
                        data-level={level(krw)}
                        title={krw ? `${money(r.currency, r.buckets[b])} ≈ ${krwFull(krw)}` : undefined}
                      >
                        {cell(r.currency, r.buckets[b])}
                      </td>
                    );
                  })}
                  <td className={styles.num}>{krwCompact(r.krw)}</td>
                  <td className={styles.num}>±{krwCompact(r.shockKrw)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                {BUCKETS.map((b) => (
                  <td key={b} className={styles.num}>
                    {krwCompact(e.rows.reduce((s, r) => s + r.buckets[b] * inputs.rates[r.currency], 0))}
                  </td>
                ))}
                <td className={styles.num}>{krwCompact(e.totalKrw)}</td>
                <td className={styles.num}>±{krwCompact(e.totalShockKrw)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {skipped.length > 0 && (
          <p className={styles.warn}>
            Not counted ({skipped.length}): {skipped.map((s) => `${s.id} — ${s.reason}`).join("; ")}
          </p>
        )}
      </section>

      <section aria-labelledby="actions-h">
        <h2 id="actions-h">What the agent can do</h2>
        <p className={styles.muted}>
          Each action runs in PayPal only after you approve it. Costs and swings are shown side by side; the choice is
          yours.
        </p>
        <h3 className={styles.groupH}>Chase what is already late</h3>
        <ul className={styles.cards}>
          {proposals
            .filter((p) => p.kind === "reminder")
            .map((p) => (
              <ProposalCard key={`${p.kind}-${p.invoiceId}`} p={p} readOnly={readOnly} explanations={explanations} />
            ))}
        </ul>
        <h3 className={styles.groupH}>Pull large, distant invoices closer</h3>
        <p className={styles.note}>
          The PayPal sandbox rejects conditional early-payment rules (HTTP 500), so the agent edits the invoice instead:
          the discount is applied and the due date moves in. The discount stays even if the client pays late.
        </p>
        <ul className={styles.cards}>
          {proposals
            .filter((p) => p.kind === "early_pay_discount")
            .map((p) => (
              <ProposalCard key={`${p.kind}-${p.invoiceId}`} p={p} readOnly={readOnly} explanations={explanations} />
            ))}
        </ul>
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
                <span>{d.kind === "reminder" ? "Reminder sent" : "Early-payment discount applied"}</span>
                <span>
                  {d.inv.number} · {money(d.inv.currency, d.inv.amountDue)} still owed, due {d.inv.dueDate}
                </span>
              </li>
            ))}
          </ul>
        )}
        {doneClosed > 0 && (
          <p className={styles.muted}>
            {doneClosed} earlier {doneClosed === 1 ? "action" : "actions"} on invoices that have since been paid or
            cancelled {doneClosed === 1 ? "is" : "are"} not listed.
          </p>
        )}
      </section>

      <footer className={styles.footer}>
        <p>
          Rates: {RATE_SOURCE}, {inputs.rateDate}. 1σ swing from 120 days of daily moves, scaled by the square root of
          time.
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

function ProposalCard({
  p,
  readOnly,
  explanations,
}: {
  p: Proposal;
  readOnly: boolean;
  explanations: Promise<Record<string, Explanation>>;
}) {
  const why = (
    <Suspense fallback={<p className={styles.why}>Claude is writing a short explanation…</p>}>
      <Why explanations={explanations} k={proposalKey(p)} />
    </Suspense>
  );
  const demoReason = readOnly ? "Read-only demo snapshot" : undefined;
  if (p.kind === "reminder") {
    return (
      <li className={styles.card}>
        <p className={styles.cardKind}>Send a payment reminder</p>
        <p className={styles.cardTitle}>
          {p.invoiceNumber} · {money(p.currency, p.amount)} <span className={styles.muted}>≈ {krwCompact(p.krw)}</span>
        </p>
        <p>{p.daysOverdue} days overdue.</p>
        {why}
        {p.lastReminderAt && (
          <p className={styles.muted}>Last reminder: {p.lastReminderAt.slice(0, 16).replace("T", " ")} UTC</p>
        )}
        <ApproveButton
          kind="reminder"
          invoiceId={p.invoiceId}
          label="Approve: send reminder"
          disabledReason={demoReason ?? (p.canAct ? undefined : "Sent recently — available again in a few days")}
        />
      </li>
    );
  }
  return (
    <li className={styles.card}>
      <p className={styles.cardKind}>Offer {p.discountPct}% off to be paid within {p.discountWithinDays} days</p>
      <p className={styles.cardTitle}>
        {p.invoiceNumber} · {money(p.currency, p.amount)} <span className={styles.muted}>≈ {krwCompact(p.krw)}</span>
      </p>
      <dl className={styles.compare}>
        <div>
          <dt>Cost if the client takes it</dt>
          <dd>{krwCompact(p.costKrw)}</dd>
        </div>
        <div>
          <dt>1σ swing until the due date ({p.daysToDue} days)</dt>
          <dd>{p.swingNowKrw == null ? "n/a" : `±${krwCompact(p.swingNowKrw)}`}</dd>
        </div>
        <div>
          <dt>1σ swing if paid within {p.discountWithinDays} days</dt>
          <dd>{p.swingIfEarlyKrw == null ? "n/a" : `±${krwCompact(p.swingIfEarlyKrw)}`}</dd>
        </div>
      </dl>
      {why}
      <ApproveButton
        kind="early_pay_discount"
        invoiceId={p.invoiceId}
        label={`Approve: apply ${p.discountPct}% and move due date in`}
        disabledReason={demoReason}
      />
    </li>
  );
}

async function Why({ explanations, k }: { explanations: Promise<Record<string, Explanation>>; k: string }) {
  let e: Explanation | undefined;
  try {
    e = (await explanations)[k];
  } catch {
    e = undefined;
  }
  if (!e) return null;
  return (
    <div className={styles.why}>
      <p>{e.text}</p>
      <p className={styles.whySource}>
        {e.source === "claude"
          ? "Written by Claude from the numbers above · checked: no new figures, no forecasts"
          : e.reason && e.reason !== "no API key"
            ? `Standard wording — Claude's sentence was withheld (${e.reason})`
            : "Standard wording"}
      </p>
    </div>
  );
}
