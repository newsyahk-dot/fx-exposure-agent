"use client";

// Keeps the Today screen current while it is open: every 10 s (tab visible only, for up to 30 min) it asks
// the server for a fresh render. The book is cached, so this is cheap; a PayPal webhook expires that cache when a
// client pays, so the payment appears here on its own. A tick is skipped while the last refresh is still running —
// they used to pile up when the server was slow, and one failing then took the whole page down.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

export function LiveRefresh({ everyMs = 10_000, forMs = 30 * 60_000 }: { everyMs?: number; forMs?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const busy = useRef(false);
  useEffect(() => {
    busy.current = pending;
  }, [pending]);
  useEffect(() => {
    const until = Date.now() + forMs;
    const t = setInterval(() => {
      if (Date.now() > until) return clearInterval(t);
      if (document.visibilityState !== "visible" || busy.current) return;
      busy.current = true;
      start(() => router.refresh());
    }, everyMs);
    return () => clearInterval(t);
  }, [router, everyMs, forMs]);
  return null;
}
