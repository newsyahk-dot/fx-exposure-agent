"use client";
// AG Grid and AG Charts are about 420 KB each (compressed). Imported directly, every page downloaded both before it
// became interactive, even pages that show neither. Loaded here on demand instead: each page fetches only the
// library it shows, after the rest of the page is already usable. Both render on the client anyway, so nothing is
// lost by skipping server rendering.

import dynamic from "next/dynamic";
import styles from "./page.module.css";

const Loading = ({ height, label }: { height: number; label: string }) => (
  <div className={`${styles.muted} ${styles.lazyBox}`} style={{ minHeight: height }}>
    {label}
  </div>
);

export const InvoiceGrid = dynamic(() => import("./invoice-grid").then((m) => m.InvoiceGrid), {
  ssr: false,
  loading: () => <Loading height={320} label="Loading the invoice table…" />,
});

export const ExposureGrid = dynamic(() => import("./exposure-grid").then((m) => m.ExposureGrid), {
  ssr: false,
  loading: () => <Loading height={220} label="Loading the table…" />,
});

export const TimelineChart = dynamic(() => import("./timeline-chart").then((m) => m.TimelineChart), {
  ssr: false,
  loading: () => <Loading height={210} label="Loading the chart…" />,
});
