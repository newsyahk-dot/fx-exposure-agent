"use client";

import { useActionState } from "react";
import type { AgentProposal } from "@/lib/agent";
import { approve, type ApproveState } from "./actions";
import styles from "./page.module.css";

// The client-facing text is editable: the seller can change the agent's draft before approving.
// Whatever is submitted is checked again on the server.
export function ApproveForm({ p, base, disabledReason, openDraft = false }: { p: AgentProposal; base: string; disabledReason?: string; openDraft?: boolean }) {
  const [state, action, pending] = useActionState<ApproveState, FormData>(approve, null);
  const locked = pending || !!disabledReason || !!state?.ok;
  return (
    <form action={action} className={styles.approveForm}>
      <input type="hidden" name="kind" value={p.kind} />
      <input type="hidden" name="invoiceId" value={p.invoiceId} />
      <input type="hidden" name="base" value={base} />
      <details className={styles.draft} open={openDraft}>
        <summary>{p.kind === "reminder" ? "E-mail the agent wrote for this client" : "Note the client will see"}</summary>
        {p.kind === "reminder" ? (
          <>
            <label>
              Subject
              <input name="subject" defaultValue={p.subject} maxLength={120} disabled={locked} />
            </label>
            <label>
              Message
              <textarea name="message" defaultValue={p.message} rows={5} maxLength={900} disabled={locked} />
            </label>
          </>
        ) : (
          <>
            <input type="hidden" name="percent" value={p.percent} />
            <input type="hidden" name="withinDays" value={p.withinDays} />
            <label>
              Note on the invoice
              <textarea name="clientNote" defaultValue={p.clientNote} rows={3} maxLength={300} disabled={locked} />
            </label>
          </>
        )}
        <p className={styles.muted}>You can edit this. It is checked again when you approve.</p>
      </details>
      <div className={styles.approveRow}>
        <button type="submit" className={styles.approve} disabled={locked}>
          {pending
            ? "Running in PayPal…"
            : p.kind === "reminder"
              ? "Approve: send reminder"
              : `Approve: offer ${p.percent}% off if paid by ${shortDate(p.newDueDate)}`}
        </button>
        {disabledReason && !state && (
          <span className={styles.muted}>{disabledReason}</span>
        )}
        {state && (
          <span role="status" className={state.ok ? styles.ok : styles.error}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
