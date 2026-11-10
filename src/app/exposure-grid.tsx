"use client";

// "Where the exposure sits" as an AG Grid (Community): currencies by due-date bucket, each cell shaded by how much
// money it holds in the home currency. Clicking a cell narrows the invoice grid below to that currency and bucket
// (an event both grids share — src/app/grid-theme.ts); clicking a currency narrows it to that currency.

import { type CellClickedEvent, type CellKeyDownEvent, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useSyncExternalStore } from "react";
import type { Bucket } from "@/lib/types";
import { FOCUS_EVENT, gridTheme, type FocusDetail } from "./grid-theme";
import styles from "./page.module.css";

import "./grid-modules";

export type ExposureCell = { text: string; value: number; title?: string }; // text and value in home; title has the invoice currency
export type ExposureRow = { currency: string; cells: Record<Bucket, ExposureCell>; value: string; shock: string; total?: boolean };

// Phones: three columns instead of six (Overdue · Next 4 weeks · Later), so every bucket fits 390 px without sideways
// scrolling ("28+ days", the largest bucket, sat off screen — blind review round 12). A merged cell filters the invoice
// grid to all of its buckets.
const PHONE_GROUPS: { key: Bucket; label: string; parts: Bucket[] }[] = [
  { key: "overdue", label: "Overdue", parts: ["overdue"] },
  { key: "w1", label: "Next 4 weeks", parts: ["w1", "w2", "w3", "w4"] },
  { key: "later", label: "Later", parts: ["later"] },
];

export function ExposureGrid(props: { rows: ExposureRow[]; total: ExposureRow; buckets: Bucket[]; labels: Record<Bucket, string>; base: string }) {
  // Phones: narrower columns and no "In …"/±3% columns (both are in the tiles above).
  const narrow = useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(max-width: 719px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 719px)").matches,
    () => false,
  );
  const { base } = props;
  const merged = useMemo(() => {
    if (!narrow) return { rows: props.rows, total: props.total, buckets: props.buckets, labels: props.labels, parts: {} as Partial<Record<Bucket, Bucket[]>> };
    const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: base, maximumFractionDigits: 0 });
    const mergeRow = (r: ExposureRow): ExposureRow => {
      const cells = { ...r.cells };
      for (const g of PHONE_GROUPS) {
        const value = g.parts.reduce((s, b) => s + (r.cells[b]?.value ?? 0), 0);
        const titles = g.parts.map((b) => r.cells[b]).filter((x) => x && x.value > 0 && x.title).map((x) => x.title);
        cells[g.key] = { value, text: value > 0 ? fmt.format(value) : "", title: titles.join("; ") || undefined };
      }
      return { ...r, cells };
    };
    const labels = { ...props.labels };
    for (const g of PHONE_GROUPS) labels[g.key] = g.label;
    return {
      rows: props.rows.map(mergeRow),
      total: mergeRow(props.total),
      buckets: PHONE_GROUPS.map((g) => g.key),
      labels,
      parts: Object.fromEntries(PHONE_GROUPS.map((g) => [g.key, g.parts])) as Partial<Record<Bucket, Bucket[]>>,
    };
  }, [narrow, props.rows, props.total, props.buckets, props.labels, base]);
  const { rows, total, buckets, labels } = merged;
  const maxCell = Math.max(1, ...rows.flatMap((r) => buckets.map((b) => r.cells[b].value)));
  const level = (v: number) => (v > 0 ? Math.min(5, Math.ceil((v / maxCell) * 5)) : 0);
  const focus = (d: FocusDetail) => {
    window.dispatchEvent(new CustomEvent<FocusDetail>(FOCUS_EVENT, { detail: d }));
    document.getElementById("grid-h")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const columns = useMemo<ColDef<ExposureRow>[]>(
    () => [
      {
        field: "currency",
        headerName: "Currency",
        pinned: "left",
        minWidth: narrow ? 84 : 116,
        cellRenderer: (p: ICellRendererParams<ExposureRow>) =>
          p.data?.total ? (
            <strong>Total</strong>
          ) : (
            <button type="button" className={styles.linkButton} title={`Show every open ${p.value} invoice below`}>
              {p.value}
            </button>
          ),
      },
      ...buckets.map<ColDef<ExposureRow>>((b) => ({
        colId: b,
        headerName: labels[b],
        type: "rightAligned",
        minWidth: narrow ? 88 : 96,
        valueGetter: (p) => p.data?.cells[b].value ?? 0,
        cellRenderer: (p: ICellRendererParams<ExposureRow>) => {
          const c = p.data?.cells[b];
          if (!c) return null;
          if (p.data?.total) return <strong>{c.text}</strong>;
          // A screen reader hears the row, the column and the level, not just "$5,597" (blind review round 9).
          const lvl = level(c.value);
          return (
            <span aria-label={c.value > 0 ? `${p.data?.currency}, ${labels[b]}: ${c.text}, level ${lvl} of 5` : `${p.data?.currency}, ${labels[b]}: nothing`}>
              {c.text}
            </span>
          );
        },
        // "ag-right-aligned-cell" keeps the numbers under their right-aligned header (a custom cellClass replaces it).
        cellClass: (p) => (p.data?.total ? "ag-right-aligned-cell" : `ag-right-aligned-cell ${styles.heatCell} ${c(p.data?.cells[b].value ?? 0)}`),
        tooltipValueGetter: (p) =>
          p.data && !p.data.total && p.data.cells[b].value > 0 ? `${p.data.cells[b].title} — click (or Enter) to see these invoices below` : undefined,
      })),
      { field: "value", headerName: `In ${base}`, type: "rightAligned", minWidth: 90, hide: narrow },
      { field: "shock", headerName: "±3%", type: "rightAligned", minWidth: 80, hide: narrow, headerTooltip: "What a 3% move either way would change — not a forecast" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buckets, labels, base, maxCell, narrow],
  );
  function c(v: number) {
    const l = level(v);
    return l ? styles[`heat${l}`] : "";
  }
  const onCellClicked = (e: CellClickedEvent<ExposureRow> | CellKeyDownEvent<ExposureRow>, keyboard = false) => {
    const r = e.data;
    if (!r || r.total) return;
    const id = e.column.getColId();
    if (id === "currency") return focus({ currency: r.currency, bucket: null, label: `${r.currency}, every due date`, keyboard });
    const b = id as Bucket;
    if (buckets.includes(b) && r.cells[b].value > 0) {
      const parts = merged.parts[b];
      focus(
        parts && parts.length > 1
          ? { currency: r.currency, bucket: null, buckets: parts, label: `${r.currency}, ${labels[b].toLowerCase()}`, keyboard }
          : { currency: r.currency, bucket: b, label: `${r.currency}, ${labels[b].toLowerCase()}`, keyboard },
      );
    }
  };
  // Keyboard: Enter on a focused cell does what a click does, and focus follows to the invoice grid.
  const onCellKeyDown = (e: CellKeyDownEvent<ExposureRow>) => {
    if ((e.event as KeyboardEvent | null)?.key === "Enter") onCellClicked(e, true);
  };
  return (
    <div className={styles.exposureGrid} role="region" aria-label={`Money still owed by currency and due date, in ${base}`}>
    <AgGridReact<ExposureRow>
      theme={gridTheme}
      rowData={rows}
      pinnedBottomRowData={[total]}
      columnDefs={columns}
      defaultColDef={{ sortable: false, resizable: true }}
      domLayout="autoHeight"
      getRowId={(p) => p.data.currency}
      onCellClicked={onCellClicked}
      onCellKeyDown={onCellKeyDown}
      tooltipShowDelay={300}
      tabToNextCell={() => false} // Tab leaves the grid, like the other grids; arrow keys move between cells
      autoSizeStrategy={{ type: "fitGridWidth" }}
    />
    </div>
  );
}
