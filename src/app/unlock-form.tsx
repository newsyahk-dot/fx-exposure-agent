"use client";

import { useActionState } from "react";
import { unlock, type UnlockState } from "./access-actions";
import styles from "./page.module.css";

export function UnlockForm() {
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlock, null);
  return (
    <form action={action} className={styles.unlock}>
      <span className={styles.unlockText}>
        <strong>Judges</strong> · the access code in the Devpost testing instructions lets you run actions on the PayPal
        sandbox. Without it, look around freely.
      </span>
      <input name="code" type="password" autoComplete="off" aria-label="Access code" placeholder="Access code" maxLength={64} />
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
