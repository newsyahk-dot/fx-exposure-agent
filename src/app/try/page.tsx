// "Try it with your own invoices": the same analysis and rules as the demo book, on a list the seller pastes.

import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "../logo";
import { OwnInvoicesForm } from "../own-invoices-form";
import styles from "../page.module.css";

export const metadata: Metadata = {
  title: "Try it with your own invoices · FX Exposure Agent",
  description: "Paste your invoice list and see what is waiting from clients abroad, what is late, and what the agent would do today.",
};

// Claude's plan (with the access code) can take ~20 s.
export const maxDuration = 120;

export default function TryPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Logo />
          <h1>Try it with your own invoices</h1>
        </div>
        <p className={styles.lede}>Paste your open invoices and see what is waiting from clients abroad, what is late, and what the agent would do today.</p>
        <p className={styles.muted}>
          <Link href="/" className={styles.link}>
            ← Back to the live demo (Maya&apos;s PayPal sandbox book)
          </Link>
        </p>
      </header>
      <OwnInvoicesForm />
      <p className={styles.muted}>
        Any ECB reference currency works. Exchange rates: up or down, equally likely — sizes of risk, never forecasts. No PayPal
        account is touched from this page.
      </p>
    </main>
  );
}
