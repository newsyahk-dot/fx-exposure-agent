"use client";

// Shown instead of the framework's blank "This page couldn't load" when a render fails (for example PayPal or the
// model timing out while the page reloads after an action). The action itself may well have gone through, so say so,
// and try again on its own once.

import { useEffect } from "react";
import styles from "./page.module.css";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    const t = setTimeout(() => reset(), 5000);
    return () => clearTimeout(t);
  }, [error, reset]);
  return (
    <main className={styles.page}>
      <div className={styles.staleNotice} role="alert">
        <p>
          <strong>This page did not finish loading.</strong> PayPal or the agent took too long to answer. If you just approved
          something, it has most likely gone through — the page tries again in a few seconds.
        </p>
        <p>
          <button type="button" className={styles.approve} onClick={() => reset()}>
            Try again now
          </button>{" "}
          <button type="button" className={styles.secondaryButton} onClick={() => window.location.assign("/")}>
            Reload from the start
          </button>
        </p>
      </div>
    </main>
  );
}
