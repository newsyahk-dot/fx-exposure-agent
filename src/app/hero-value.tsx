"use client";

// The big number on Today. When a payment brings it down, it counts down to the new value and shows how much
// came off — the moment the loop closes. Numbers come from the server; this only animates between them.

import { useEffect, useRef, useState } from "react";
import { compact } from "@/lib/format";
import styles from "./page.module.css";

const DURATION_MS = 900;

export function HeroValue({ value, base }: { value: number; base: string }) {
  const [shown, setShown] = useState(value);
  const [drop, setDrop] = useState<number | null>(null);
  const prev = useRef(value);

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (Math.round(from) === Math.round(value)) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = reduce ? 1 : Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (value - from) * eased);
      if (t === 0 || (t < 1 && !reduce)) frame = requestAnimationFrame(step);
      if (t === 1 || reduce) setDrop(value < from ? from - value : null);
    };
    frame = requestAnimationFrame(step);
    const clear = setTimeout(() => setDrop(null), 8000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(clear);
    };
  }, [value]);

  return (
    <p className={styles.heroValue}>
      <span className={styles.heroNumber}>{compact(base, shown)}</span>
      {drop != null && Math.round(drop) > 0 && (
        <span className={styles.dropBadge} role="status">
          −{compact(base, drop)} off your risk
        </span>
      )}
    </p>
  );
}
