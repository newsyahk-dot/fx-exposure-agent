// Shared by the two AG Grids on the "Where it sits" step: one theme (colours from the page's CSS variables, so both
// follow light and dark mode) and the event that links them — clicking a cell of the exposure grid narrows the invoice
// grid to that currency and due-date bucket.

import { themeQuartz } from "ag-grid-community";
import type { Bucket } from "@/lib/types";

export const gridTheme = themeQuartz.withParams({
  backgroundColor: "var(--surface-1)",
  foregroundColor: "var(--text-primary)",
  headerBackgroundColor: "var(--surface-2)",
  borderColor: "var(--border)",
  accentColor: "var(--accent)",
  fontFamily: "inherit",
  fontSize: 14,
  headerFontWeight: 600,
  cellHorizontalPadding: 10, // nine columns at desktop width: the default padding truncated "18 days late"
});

export const FOCUS_EVENT = "fxa:focus";
export type FocusDetail = { currency: string; bucket: Bucket | null; label: string } | null;
