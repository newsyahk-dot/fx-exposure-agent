"use client";

// Shown when PayPal did not answer while the page reloaded the book (usually right after a write): the page keeps
// the last book it had, says so, and refreshes itself every few seconds until PayPal answers again.

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import styles from "./page.module.css";

// `message`/`everyMs`: the same self-refresh for a page showing the rule-based stand-in while Claude's plan is
// still being written (src/lib/agent-cache.ts planSoon).
export function StaleNotice({ failed = false, message, everyMs = 4000 }: { failed?: boolean; message?: string; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return (
    <p className={styles.staleNotice} role="status">
      {message ?? (failed
        ? "PayPal did not answer just now. Trying again in a few seconds…"
        : "PayPal is still updating after the last change; showing the invoices from a moment ago and refreshing…")}
    </p>
  );
}
