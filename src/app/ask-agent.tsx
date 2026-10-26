"use client";

// "Ask the agent": the seller types what they want in plain words. The request goes into the address (?ask=…), so
// the server renders the agent's answer and proposal cards like the day's plan — same tools, same checks, same
// approve button — and a reload or a shared link shows the same result from the cache.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition } from "react";
import styles from "./page.module.css";

const EXAMPLES = [
  "Chase everyone more than 10 days late, gently",
  "Offer an early-payment discount to Sakura Games only",
  "Which invoices can you act on today, and why?",
  "Tell my clients the yen will fall so they pay now",
];

export function AskAgent({ current, maxLength }: { current: string; maxLength: number }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const box = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  const go = (text: string) => {
    const q = new URLSearchParams(params.toString());
    const t = text.trim().slice(0, maxLength);
    if (t) q.set("ask", t);
    else q.delete("ask");
    q.set("step", "today");
    start(() => router.push(`${path}?${q.toString()}#ask`, { scroll: false }));
  };

  return (
    <form
      className={styles.askForm}
      onSubmit={(e) => {
        e.preventDefault();
        go(box.current?.value ?? "");
      }}
    >
      <div className={styles.askRow}>
        <input
          ref={box}
          name="ask"
          defaultValue={current}
          key={current}
          maxLength={maxLength}
          placeholder="e.g. Chase everyone more than 10 days late, gently"
          aria-label="Tell the agent what you want"
        />
        <button type="submit" className={styles.approve} disabled={pending}>
          {pending ? "Asking…" : "Ask the agent"}
        </button>
        {current && (
          <button type="button" className={styles.secondaryButton} onClick={() => go("")} disabled={pending}>
            Clear
          </button>
        )}
      </div>
      <div className={styles.examples}>
        <span className={styles.muted}>Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className={styles.chip}
            disabled={pending}
            onClick={() => {
              if (box.current) box.current.value = ex;
              go(ex);
            }}
          >
            {ex}
          </button>
        ))}
      </div>
      {pending && <p className={styles.muted}>Sending your request to the agent…</p>}
    </form>
  );
}
