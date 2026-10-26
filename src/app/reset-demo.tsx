"use client";

import { useActionState } from "react";
import { resetDemoAction, type ApproveState } from "./actions";
import styles from "./page.module.css";

export function ResetDemoButton({ disabledReason }: { disabledReason?: string }) {
  const [state, action, pending] = useActionState<ApproveState, FormData>(resetDemoAction, null);
  return (
    <form action={action} className={styles.approveRow}>
      <button type="submit" className={styles.secondaryButton} disabled={pending || !!disabledReason}>
        {pending ? "Resetting the demo book… (about a minute)" : "Reset the demo book"}
      </button>
      <span className={styles.muted}>Closes the demo invoices and starts the story over. Also happens every night (00:07 UTC).</span>
      {state && (
        <span role="status" className={state.ok ? styles.ok : styles.error}>
          {state.message}
        </span>
      )}
    </form>
  );
}
