"use client";

import { useActionState } from "react";
import { unlock, type UnlockState } from "./access-actions";
import styles from "./page.module.css";

export function UnlockForm() {
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlock, null);
  return (
    <form action={action} className={styles.unlock}>
      <span>
        <strong>Judges:</strong> enter the access code from the Devpost testing instructions to run the agent&apos;s
        actions on the PayPal sandbox. Without it you can look around; nothing runs.
      </span>
      <input name="code" type="password" autoComplete="off" aria-label="Access code" maxLength={64} />
      <button type="submit" className={styles.secondaryButton} disabled={pending}>
        {pending ? "Checking…" : "Unlock"}
      </button>
      {state && !state.ok && (
        <span role="alert" className={styles.error}>
          {state.message}
        </span>
      )}
    </form>
  );
}
