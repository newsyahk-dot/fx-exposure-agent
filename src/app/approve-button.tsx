"use client";

import { useActionState } from "react";
import { approve, type ApproveState } from "./actions";
import styles from "./page.module.css";

export function ApproveButton({
  kind,
  invoiceId,
  label,
  disabledReason,
}: {
  kind: "reminder" | "early_pay_discount";
  invoiceId: string;
  label: string;
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState<ApproveState, FormData>(approve, null);
  return (
    <form action={action} className={styles.approveRow}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button type="submit" className={styles.approve} disabled={pending || !!disabledReason}>
        {pending ? "Running in PayPal…" : label}
      </button>
      {disabledReason && !state && <span className={styles.muted}>{disabledReason}</span>}
      {state && (
        <span role="status" className={state.ok ? styles.ok : styles.error}>
          {state.message}
        </span>
      )}
    </form>
  );
}
