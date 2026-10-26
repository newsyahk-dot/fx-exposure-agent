"use client";

import { useActionState } from "react";
import { replan, type ApproveState } from "./actions";
import styles from "./page.module.css";

export function ReplanButton({ disabledReason }: { disabledReason?: string }) {
  const [state, action, pending] = useActionState<ApproveState, FormData>(replan, null);
  return (
    <form action={action} className={styles.inlineForm}>
      <button type="submit" className={styles.secondaryButton} disabled={pending || !!disabledReason}>
        {pending ? "Re-planning…" : "Re-plan with them"}
      </button>
      {state && !state.ok && (
        <span role="status" className={styles.error}>
          {state.message}
        </span>
      )}
    </form>
  );
}
