"use client";

// "Try it with your own invoices": paste an invoice list (or open a CSV — it is read in the browser, never uploaded
// as a file), pick a home currency, and see what is waiting, what is late, where the exchange-rate risk sits and what
// the agent would do today. Read-only: these invoices are not in PayPal, so nothing can be sent from here.

import { useActionState, useRef } from "react";
import type { AgentProposal } from "@/lib/agent";
import { annualCostPct } from "@/lib/offer-rule";
import { BASES } from "@/lib/fx";
import { compact, money } from "@/lib/format";
import { sampleCsv } from "@/lib/own-invoices";
import { analyzeOwnAction, type OwnState } from "./try-actions";
import styles from "./page.module.css";

const PLACEHOLDER = "Invoice number,Client,Currency,Amount due,Due date\nINV-104,Studio Nord (Berlin),EUR,4200,2026-10-03\nINV-107,Hayashi Design,JPY,380000,2026-10-21";

export function OwnInvoicesForm() {
  const [state, action, pending] = useActionState<OwnState, FormData>(analyzeOwnAction, null);
  const text = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <form action={action} className={styles.assistantForm}>
        <label className={styles.field}>
          Your invoice list — CSV or tab-separated, with a header row (an export from PayPal or any invoicing tool works)
          <textarea ref={text} name="text" rows={8} placeholder={PLACEHOLDER} spellCheck={false} />
        </label>
        <div className={styles.examples}>
          <button type="button" className={styles.chip} onClick={() => text.current && (text.current.value = sampleCsv(new Date().toISOString().slice(0, 10)))}>
            Load a sample
          </button>
          <label className={styles.chip}>
            Open a CSV file…
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f && text.current) text.current.value = await f.text();
              }}
            />
          </label>
          <span className={styles.muted}>Needed columns: currency, amount due, due date. Optional: client, invoice number, status.</span>
        </div>
        <div className={styles.approveRow}>
          <label className={styles.field}>
            Home currency
            <select name="base" defaultValue="USD">
              {BASES.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="agent" value="1" /> Ask Claude to plan (needs the access code)
          </label>
          <button type="submit" className={styles.approve} disabled={pending}>
            {pending ? "Reading your invoices…" : "Show what's waiting"}
          </button>
        </div>
        <p className={styles.muted}>Nothing is stored: the list is analysed on the server and discarded.</p>
      </form>
      {state && !state.ok && (
        <p role="alert" className={styles.error}>
          {state.message}
        </p>
      )}
      {state?.ok && <OwnResult s={state} />}
    </>
  );
}

function OwnResult({ s }: { s: Extract<OwnState, { ok: true }> }) {
  const a = s.analysis;
  const c = (n: number) => compact(a.base, n);
  const away = a.rows.map((r) => r.currency).join(", ");
  return (
    <section aria-label="Your invoices" className={styles.ownResult}>
      {a.read === 0 ? (
        <p className={styles.warn}>No invoices could be read — see the reasons below.</p>
      ) : (
        <div className={styles.hero}>
          <p className={styles.heroLabel}>Waiting to be paid in currencies other than {a.base}{away && `, in ${away}`}</p>
          <p className={styles.heroValue}>
            <span className={styles.heroNumber}>{c(a.waiting)}</span>
          </p>
          <div className={styles.heroChips}>
            {a.overdue > 0 && (
              <span className={styles.statChip} data-tone="late">
                <strong>{c(a.overdue)}</strong> overdue · {a.overdueCount} invoice{a.overdueCount === 1 ? "" : "s"}
              </span>
            )}
            <span className={styles.statChip}>
              <strong>±{c(a.shock)}</strong> if rates move 3% either way
            </span>
          </div>
          <p className={styles.muted}>
            Up or down, equally likely — the size of the risk, not a forecast. {a.read} invoice{a.read === 1 ? "" : "s"} read
            {a.baseTotal > 0 && <>; {c(a.baseTotal)} already in {a.base} carries no exchange-rate risk</>}. Rates: ECB reference
            rates via Frankfurter, {a.ecbDate}.
          </p>
        </div>
      )}

      {a.rows.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Currency</th>
              <th scope="col" className={styles.num}>Still owed</th>
              <th scope="col" className={styles.num}>In {a.base}</th>
              <th scope="col" className={styles.num}>Overdue</th>
              <th scope="col" className={styles.num}>If rates move 3%</th>
            </tr>
          </thead>
          <tbody>
            {a.rows.map((r) => (
              <tr key={r.currency}>
                <th scope="row">
                  {r.currency} <span className={styles.muted}>· {r.count}</span>
                </th>
                <td className={styles.num}>{money(r.currency, r.total)}</td>
                <td className={styles.num}>{c(r.value)}</td>
                <td className={styles.num}>{r.overdue > 0 ? c(r.overdue) : "—"}</td>
                <td className={styles.num}>±{c(r.shock)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {a.read > 0 && (
        <>
          <h2>{a.run.source === "agent" ? "What Claude would do today" : "What the agent would do today"}</h2>
          <p className={styles.muted}>
            {a.run.source === "agent"
              ? "Claude planned this with the same tools and checks as the demo; every number is computed by code."
              : "Rule-based plan (the same rules the agent works under). Tick “Ask Claude to plan” with the access code for Claude's own plan."}{" "}
            Read-only here: these invoices are not in PayPal, so nothing is sent.
          </p>
          {s.note && <p className={styles.warn}>{s.note}</p>}
          {a.run.source === "agent" && a.run.summary && <p>{a.run.summary}</p>}
          {a.run.proposals.length === 0 ? (
            <p className={styles.muted}>Nothing to do today: no overdue invoices to chase and no offer within the app&apos;s rule.</p>
          ) : (
            <ul className={styles.cards}>
              {a.run.proposals.map((p) => (
                <OwnCard key={`${p.kind}-${p.invoiceId}`} p={p} c={c} />
              ))}
            </ul>
          )}
          {a.run.notProposed.length > 0 && (
            <details className={styles.leftAlone}>
              <summary>Left alone ({a.run.notProposed.length})</summary>
              <ul>
                {a.run.notProposed.map((n) => (
                  <li key={n.invoiceNumber}>
                    <strong>{n.invoiceNumber}</strong> — {n.why}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {a.skipped.length > 0 && (
        <details className={styles.leftAlone} open={a.read === 0}>
          <summary>Rows not read ({a.skipped.length})</summary>
          <ul>
            {a.skipped.map((k, i) => (
              <li key={i}>
                Row {k.row}: {k.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {Object.keys(a.columns).length > 0 && (
        <p className={styles.muted}>
          Columns read:{" "}
          {Object.entries(a.columns)
            .map(([f, h]) => `${f} ← “${h}”`)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}

function OwnCard({ p, c }: { p: AgentProposal; c: (n: number) => string }) {
  const daysSooner = p.kind === "early_pay_discount" ? Math.max(0, p.daysToDue - p.withinDays) : 0;
  return (
    <li className={styles.card} data-state="open">
      <p className={styles.cardKind}>
        {p.kind === "reminder" ? "Chase a late payment" : `Ask to be paid ${Math.round(daysSooner / 7)} weeks sooner, for ${p.percent}% off`}
      </p>
      <p className={styles.cardTitle}>
        {p.invoiceNumber} · {money(p.currency, p.amount)}
      </p>
      {p.kind === "reminder" ? (
        <p className={styles.cardPitch}>
          Overdue {p.daysOverdue} days · <strong>{c(p.value)} waiting</strong>
        </p>
      ) : (
        <p className={styles.cardPitch}>
          <strong>{c(p.cost)}</strong> off · due <strong>{p.newDueDate}</strong> · {daysSooner} days sooner · about{" "}
          {annualCostPct(p.percent, daysSooner)}% a year
        </p>
      )}
      <p className={styles.muted}>{p.rationale}</p>
      {p.kind === "reminder" && (
        <details className={styles.draft}>
          <summary>The e-mail it would send</summary>
          <p>
            <strong>{p.subject}</strong>
          </p>
          <p>{p.message}</p>
        </details>
      )}
    </li>
  );
}
