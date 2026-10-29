"use client";

// Shown when PayPal did not answer while the page reloaded the book (usually right after a write): the page keeps
// the last book it had, says so, and refreshes itself every few seconds until PayPal answers again.

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import styles from "./page.module.css";

export function StaleNotice({ failed = false }: { failed?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [router]);
  return (
    <p className={styles.staleNotice} role="status">
      {failed
        ? "PayPal did not answer just now. Trying again in a few seconds…"
        : "PayPal is still updating after the last change; showing the invoices from a moment ago and refreshing…"}
    </p>
  );
}
