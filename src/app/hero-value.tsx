"use client";

// The big number on Today: money still waiting from clients abroad. When it changes it counts to the new value, and
// when a payment arrives it shows how much was collected — the moment the loop closes. Numbers come from the server;
// this only animates between them.

import { useEffect, useRef, useState } from "react";
import { compact } from "@/lib/format";
import styles from "./page.module.css";

const DURATION_MS = 900;

export function HeroValue({ value, base, collected }: { value: number; base: string; collected: number }) {
  const [shown, setShown] = useState(value);
  const [drop, setDrop] = useState<number | null>(null);
  const prev = useRef(value);
  const prevCollected = useRef(collected);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    const gained = collected - prevCollected.current; // only a payment counts as collected (not a discount or a new invoice)
    prevCollected.current = collected;
    if (Math.round(from) === Math.round(value)) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * eased);
      if (t === 0 || (t < 1 && !reduce)) frame = requestAnimationFrame(step);
      if (t === 1 || reduce) setDrop(gained > 0 ? gained : null);
    };
    frame = requestAnimationFrame(step);
    const clear = setTimeout(() => setDrop(null), 8000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(clear);
    };
  }, [value, collected]);

  return (
    <p className={styles.heroValue}>
      <span className={styles.heroNumber}>{compact(base, shown)}</span>
      {drop != null && Math.round(drop) > 0 && (
        <span className={styles.dropBadge} role="status">
          +{compact(base, drop)} collected
        </span>
      )}
    </p>
  );
}
