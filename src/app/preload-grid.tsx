"use client";

// Loads the invoice grid's code (AG Grid, the largest script on the site) while the browser is idle, so the first
// click on "Where it sits" does not wait for it.

import { useEffect } from "react";

export function PreloadGrid() {
  useEffect(() => {
    const load = () => void import("./invoice-grid").catch(() => {});
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(load, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(load, 2000);
    return () => clearTimeout(t);
  }, []);
  return null;
}
