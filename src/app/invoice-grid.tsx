"use client";

// Every open invoice in one AG Grid (Community): ranked by what it puts at risk, with today's agent status,
// sortable and filterable by any column, searchable, a pinned total row, and a CSV download for the seller's
// own records. Colours come from the page's CSS variables, so the grid follows light and dark mode.

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type GridApi, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useRef, useState } from "react";
import type { InvoiceRow } from "@/lib/invoice-rows";
import styles from "./page.module.css";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  backgroundColor: "var(--surface-1)",
  foregroundColor: "var(--text-primary)",
  headerBackgroundColor: "var(--surface-2)",
  borderColor: "var(--border)",
  accentColor: "var(--accent)",
  fontFamily: "inherit",
  fontSize: 14,
  headerFontWeight: 600,
});

type TotalRow = Partial<InvoiceRow> & { number: string };

export function InvoiceGrid({ rows, base, clientUrls }: { rows: InvoiceRow[]; base: string; clientUrls: Record<string, string> }) {
  const api = useRef<GridApi<InvoiceRow> | null>(null);
  const [search, setSearch] = useState("");
  const maxRisk = Math.max(1, ...rows.map((r) => r.atRisk));
  const fmtHome = useMemo(() => new Intl.NumberFormat("en-US", { style: "currency", currency: base, maximumFractionDigits: 0 }), [base]);
  const home = (v: number | null | undefined) => (v == null ? "" : fmtHome.format(v));

  const columns = useMemo<ColDef<InvoiceRow>[]>(
    () => [
      { field: "number", headerName: "Invoice", pinned: "left", width: 150, filter: "agTextColumnFilter" },
      { field: "client", headerName: "Client", flex: 1, minWidth: 150, filter: "agTextColumnFilter" },
      { field: "currency", headerName: "Ccy", width: 80, filter: "agTextColumnFilter" },
      {
        field: "amount",
        headerName: "Still owed",
        width: 140,
        type: "rightAligned",
        filter: "agNumberColumnFilter",
        valueFormatter: (p) => (p.data?.currency ? new Intl.NumberFormat("en-US", { style: "currency", currency: p.data.currency }).format(p.value) : ""),
      },
      {
        field: "daysToDue",
        headerName: "Due",
        width: 130,
        filter: "agNumberColumnFilter",
        valueFormatter: (p) => (p.value == null ? "" : p.value < 0 ? `${-p.value} days late` : p.value === 0 ? "today" : `in ${p.value} days`),
        cellClassRules: { [styles.gridLate]: (p) => (p.value ?? 0) < 0 },
      },
      {
        field: "atRisk",
        headerName: "At risk ±3%",
        width: 170,
        sort: "desc",
        filter: "agNumberColumnFilter",
        valueFormatter: (p) => (p.value ? `±${home(p.value)}` : "none"), // used by the CSV export
        cellRenderer: (p: ICellRendererParams<InvoiceRow>) =>
          p.node.rowPinned ? (
            <strong>±{home(p.value)}</strong>
          ) : p.value ? (
            <span className={styles.gridBar}>
              <i style={{ width: `${Math.round((p.value / maxRisk) * 100)}%` }} aria-hidden="true" />
              <span>±{home(p.value)}</span>
            </span>
          ) : (
            <span className={styles.muted}>none</span>
          ),
      },
      { field: "agent", headerName: "Agent today", width: 170, filter: "agTextColumnFilter", cellClassRules: { [styles.gridActive]: (p) => /proposed|sent|Paid/.test(p.value ?? "") } },
      { field: "value", headerName: `Worth (${base})`, width: 140, type: "rightAligned", filter: "agNumberColumnFilter", valueFormatter: (p) => home(p.value) },
      {
        field: "swing",
        headerName: "Typical swing to due",
        headerTooltip: "One standard deviation of the value until the due date — a size of uncertainty, not a forecast",
        width: 170,
        type: "rightAligned",
        filter: "agNumberColumnFilter",
        valueFormatter: (p) => (p.node?.rowPinned ? "" : p.value == null ? "overdue" : p.value === 0 ? "none" : `±${home(p.value)}`),
      },
      {
        headerName: "PayPal",
        width: 120,
        sortable: false,
        filter: false,
        cellRenderer: (p: ICellRendererParams<InvoiceRow>) =>
          p.data?.id && clientUrls[p.data.id] ? (
            <a href={clientUrls[p.data.id]} target="_blank" rel="noopener noreferrer" className={styles.link}>
              Client view ↗
            </a>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, maxRisk, clientUrls],
  );

  // Totals follow the filter: what is at risk among the invoices currently shown. The filtered list is tied to the
  // rows it was taken from, so new rows from the server start from the full total again.
  const [shown, setShown] = useState<{ from: InvoiceRow[]; list: InvoiceRow[] } | null>(null);
  const totals = [total(shown?.from === rows ? shown.list : rows)];
  const refreshTotals = () => {
    const list: InvoiceRow[] = [];
    api.current?.forEachNodeAfterFilter((n) => n.data && list.push(n.data));
    setShown({ from: rows, list });
  };

  return (
    <div className={styles.gridWrap}>
      <div className={styles.gridTools}>
        <input
          type="search"
          placeholder="Search invoices, clients, currencies…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search invoices"
        />
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => api.current?.exportDataAsCsv({ fileName: `open-invoices-${base}.csv`, skipPinnedBottom: false })}
        >
          Download CSV
        </button>
      </div>
      <div style={{ height: Math.min(560, 56 + 42 * (rows.length + 1)) }}>
        <AgGridReact<InvoiceRow>
          theme={theme}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={{ sortable: true, resizable: true, floatingFilter: false }}
          quickFilterText={search}
          pinnedBottomRowData={totals as InvoiceRow[]}
          getRowId={(p) => p.data.id ?? p.data.number}
          onGridReady={(e) => (api.current = e.api)}
          onFilterChanged={refreshTotals}
          tooltipShowDelay={300}
        />
      </div>
    </div>
  );
}

function total(rows: InvoiceRow[]): TotalRow {
  return {
    number: `Total (${rows.length})`,
    value: rows.reduce((s, r) => s + r.value, 0),
    atRisk: rows.reduce((s, r) => s + r.atRisk, 0),
  };
}
