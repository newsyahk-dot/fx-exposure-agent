"use client";

import { useActionState } from "react";
import { compact, money } from "@/lib/format";
import type { InvoiceOption, InvoiceRequest } from "@/lib/invoice-plan";
import { PLAN_CURRENCIES, TERMS } from "@/lib/invoice-terms";
import { createPlannedInvoice, planInvoice, type CreateState, type PlanState } from "./invoice-actions";
import styles from "./page.module.css";

const EXAMPLE = "Bill Sakura Games ¥480,000 for the level art pack, net 45";

export function InvoiceAssistant({ base, clients }: { base: string; clients: string[] }) {
  const [state, action, pending] = useActionState<PlanState, FormData>(planInvoice, null);
  const f = state?.fields ?? {};
  // Remount the inputs whenever the server returns new fields, so they show what it read.
  const key = JSON.stringify(f);
  return (
    <>
      <form action={action} className={styles.assistantForm}>
        <input type="hidden" name="base" value={base} />
        <label className={styles.field}>
          Describe the invoice
          <textarea key={state?.text ?? ""} name="text" rows={2} maxLength={500} placeholder={EXAMPLE} defaultValue={state?.text ?? ""} />
        </label>
        <div className={styles.fieldRow} key={key}>
          <label className={styles.field}>
            Client
            <input name="client" list="known-clients" defaultValue={f.client ?? ""} maxLength={80} />
          </label>
          <label className={styles.field}>
            Currency
            <select name="currency" defaultValue={f.currency ?? ""}>
              <option value="">—</option>
              {PLAN_CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Amount
            <input name="amount" inputMode="decimal" defaultValue={f.amount ?? ""} />
          </label>
          <label className={styles.field}>
            Days to pay
            <input name="termsDays" type="number" min={TERMS.min} max={TERMS.max} defaultValue={f.termsDays ?? 30} />
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            Work
            <input name="item" defaultValue={f.item ?? ""} maxLength={120} placeholder="Services" />
          </label>
        </div>
        <datalist id="known-clients">
          {clients.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className={styles.approveRow}>
          <button type="submit" name="useText" value="1" className={styles.approve} disabled={pending}>
            {pending ? "Working…" : "Read my request and compare"}
          </button>
          <button type="submit" name="useText" value="0" className={styles.secondaryButton} disabled={pending}>
            Compare with these fields
          </button>
          {state?.parsedBy && (
            <span className={styles.muted}>
              {state.parsedBy === "claude" ? "Fields read by Claude — check them." : `Fields read by simple rules (${state.parseNote}).`}
            </span>
          )}
        </div>
        {state?.error && (
          <p role="alert" className={styles.error}>
            {state.error}
          </p>
        )}
      </form>

      {state?.plan && <Plan plan={state.plan} base={base} readOnly={state.readOnly} />}
    </>
  );
}

function Plan({ plan, base, readOnly }: { plan: NonNullable<NonNullable<PlanState>["plan"]>; base: string; readOnly: boolean }) {
  const c = (n: number) => compact(base, n);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${c(Math.abs(n))}`;
  return (
    <div className={styles.planOut}>
      <div className={styles.agentStatus}>
        <p>
          <strong>{plan.comparisonBy === "claude" ? "Compared by Claude" : "Rule-based comparison"}</strong>
          {plan.comparisonBy === "claude" &&
            (plan.rejected ? ` · ${plan.rejected} draft${plan.rejected === 1 ? "" : "s"} rejected by the checks and rewritten` : " · passed the checks first time")}
        </p>
        <p>{plan.comparison}</p>
        <p className={styles.muted}>{plan.history}</p>
      </div>
      <ul className={styles.cards}>
        {plan.options.map((o) => (
          <li key={o.id} className={styles.card}>
            <p className={styles.cardKind}>{o.title}</p>
            <ul className={styles.parts}>
              {o.parts.map((p, i) => (
                <li key={i}>
                  {money(p.currency, p.amount)} due {p.dueDate} ({p.dueInDays} days)
                </li>
              ))}
            </ul>
            <dl className={styles.compare}>
              <div>
                <dt>Worth today</dt>
                <dd>{c(o.value)}</dd>
              </div>
              <div>
                <dt>Typical swing until paid (1σ)</dt>
                <dd>{o.swing === 0 ? "none for you" : o.swing == null ? "not sized" : `±${c(o.swing)}`}</dd>
              </div>
              <div>
                <dt>Two-year range, 9 in 10</dt>
                <dd>{o.range ? `${signed(o.range.p5)} to ${signed(o.range.p95)}` : o.swing === 0 ? "—" : "not enough history"}</dd>
              </div>
            </dl>
            {o.swing === 0 && <p className={styles.muted}>The client carries the exchange rate instead.</p>}
            <CreateButton option={o} request={plan.request} base={base} readOnly={readOnly} />
          </li>
        ))}
      </ul>
      <p className={styles.muted}>
        Swings and ranges are sizes of uncertainty, either way — not forecasts. The app does not say which option to pick.
      </p>
    </div>
  );
}

function CreateButton({ option, request, base, readOnly }: { option: InvoiceOption; request: InvoiceRequest; base: string; readOnly: boolean }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createPlannedInvoice, null);
  const locked = pending || readOnly || !!state?.ok;
  return (
    <form action={action} className={styles.approveRow}>
      <input type="hidden" name="optionId" value={option.id} />
      <input type="hidden" name="base" value={base} />
      {(Object.keys(request) as (keyof InvoiceRequest)[]).map((k) => (
        <input key={k} type="hidden" name={k} value={String(request[k])} />
      ))}
      <button type="submit" className={styles.approve} disabled={locked}>
        {pending ? "Creating in PayPal…" : option.parts.length > 1 ? "Approve: create and send both" : "Approve: create and send"}
      </button>
      {readOnly && !state && <span className={styles.muted}>Read-only</span>}
      {state && (
        <span role="status" className={state.ok ? styles.ok : styles.error}>
          {state.message}
        </span>
      )}
    </form>
  );
}
