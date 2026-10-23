"use client";

import { useActionState } from "react";
import { simulateClientPayment, type ApproveState } from "./actions";
import styles from "./page.module.css";

export function SimulatePayment({ invoiceId, disabledReason }: { invoiceId: string; disabledReason?: string }) {
  const [state, action, pending] = useActionState<ApproveState, FormData>(simulateClientPayment, null);
  return (
    <form action={action} className={styles.inlineForm}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button type="submit" className={styles.secondaryButton} disabled={pending || !!disabledReason || !!state?.ok}>
        {pending ? "Paying…" : "Simulate client payment"}
      </button>
      {state && (
        <span role="status" className={state.ok ? styles.ok : styles.error}>
          {state.message}
        </span>
      )}
    </form>
  );
}
