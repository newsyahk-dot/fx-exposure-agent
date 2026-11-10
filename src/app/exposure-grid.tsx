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

export function ExposureGrid({ rows, total, buckets, labels, base }: { rows: ExposureRow[]; total: ExposureRow; buckets: Bucket[]; labels: Record<Bucket, string>; base: string }) {
  const maxCell = Math.max(1, ...rows.flatMap((r) => buckets.map((b) => r.cells[b].value)));
  const level = (v: number) => (v > 0 ? Math.min(5, Math.ceil((v / maxCell) * 5)) : 0);
  const focus = (d: FocusDetail) => {
    window.dispatchEvent(new CustomEvent<FocusDetail>(FOCUS_EVENT, { detail: d }));
    document.getElementById("grid-h")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  // Phones: narrower bucket columns and no "In …"/±3% columns (both are in the tiles above), so less sideways scrolling.
  const narrow = useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(max-width: 719px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 719px)").matches,
    () => false,
  );
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
        minWidth: narrow ? 84 : 96,
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
  const onCellClicked = (e: CellClickedEvent<ExposureRow> | CellKeyDownEvent<ExposureRow>) => {
    const r = e.data;
    if (!r || r.total) return;
    const id = e.column.getColId();
    if (id === "currency") return focus({ currency: r.currency, bucket: null, label: `${r.currency}, every due date` });
    const b = id as Bucket;
    if (buckets.includes(b) && r.cells[b].value > 0) focus({ currency: r.currency, bucket: b, label: `${r.currency}, ${labels[b].toLowerCase()}` });
  };
  // Keyboard: Enter on a focused cell does what a click does.
  const onCellKeyDown = (e: CellKeyDownEvent<ExposureRow>) => {
    if ((e.event as KeyboardEvent | null)?.key === "Enter") onCellClicked(e);
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
      autoSizeStrategy={{ type: "fitGridWidth" }}
    />
    </div>
  );
}
