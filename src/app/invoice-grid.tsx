"use client";

// Every open invoice in one AG Grid (Community): ranked by what it puts at risk, with today's agent status and any
// early-payment offer, sortable by any column, searchable, quick views (late / agent acting / offers out) as an
// external filter, a pinned total row that follows the filter, cells that flash when PayPal reports a change (the
// page refreshes every 10 s), and a CSV download for the seller's own records. Invoices paid today stay listed
// (greyed) so the change is visible. Colours come from the page's CSS variables, so the grid follows light and dark mode.

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

// Quick views, applied as an AG Grid external filter.
const VIEWS = {
  all: { label: "All", pass: () => true },
  late: { label: "Late", pass: (r: InvoiceRow) => !r.paidToday && r.daysToDue < 0 },
  acting: { label: "Agent acting", pass: (r: InvoiceRow) => /proposed|sent/.test(r.agent) },
  offers: { label: "Offers out", pass: (r: InvoiceRow) => r.offerState === "open" },
  paid: { label: "Paid today", pass: (r: InvoiceRow) => r.paidToday },
} as const;
type View = keyof typeof VIEWS;

export function InvoiceGrid({ rows, base, clientUrls }: { rows: InvoiceRow[]; base: string; clientUrls: Record<string, string> }) {
  const api = useRef<GridApi<InvoiceRow> | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("all");
  const viewRef = useRef<View>("all"); // read by the grid's filter callbacks
  const pickView = (v: View) => {
    viewRef.current = v;
    setView(v);
    api.current?.onFilterChanged();
  };
  const counts = Object.fromEntries((Object.keys(VIEWS) as View[]).map((v) => [v, rows.filter(VIEWS[v].pass).length])) as Record<View, number>;
  const maxRisk = Math.max(1, ...rows.map((r) => r.atRisk));
  const hasOffers = rows.some((r) => r.offer);
  const fmtHome = useMemo(() => new Intl.NumberFormat("en-US", { style: "currency", currency: base, maximumFractionDigits: 0 }), [base]);
  const home = (v: number | null | undefined) => (v == null ? "" : fmtHome.format(v));

  const columns = useMemo<ColDef<InvoiceRow>[]>(
    () => [
      {
        field: "number",
        headerName: "Invoice",
        pinned: "left",
        minWidth: 152,
        // The invoice number opens PayPal's client view (a separate column did not fit at desktop width).
        cellRenderer: (p: ICellRendererParams<InvoiceRow>) =>
          p.data?.id && clientUrls[p.data.id] ? (
            <a href={clientUrls[p.data.id]} target="_blank" rel="noopener noreferrer" className={styles.link} title="Open in PayPal as the client">
              {p.value} ↗
            </a>
          ) : (
            p.value
          ),
      },
      { field: "client", headerName: "Client", minWidth: 100, tooltipField: "client" },
      { field: "currency", headerName: "Ccy", hide: true }, // in "Still owed"; kept for search
      {
        field: "amount",
        headerName: "Still owed",
        minWidth: 128,
        type: "rightAligned",
        enableCellChangeFlash: true,
        valueFormatter: (p) =>
          p.data?.currency ? new Intl.NumberFormat("en-US", { style: "currency", currency: p.data.currency, currencyDisplay: "code" }).format(p.value) : "",
      },
      {
        field: "daysToDue",
        headerName: "Due",
        minWidth: 104,
        valueFormatter: (p) => (p.value == null ? "" : p.value < 0 ? `${-p.value} days late` : p.value === 0 ? "today" : `in ${p.value} days`),
        cellClassRules: { [styles.gridLate]: (p) => (p.value ?? 0) < 0 },
      },
      {
        field: "atRisk",
        headerName: "At risk ±3%",
        minWidth: 104,
        sort: "desc",
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
      {
        field: "agent",
        headerName: "Agent today",
        minWidth: 168,
        tooltipField: "agent",
        enableCellChangeFlash: true,
        cellClassRules: { [styles.gridActive]: (p) => /proposed|sent|Paid/.test(p.value ?? "") },
      },
      {
        field: "offer",
        headerName: "Offer",
        headerTooltip: "A separate PayPal invoice for the discounted amount; it lapses after its date and the original applies",
        minWidth: 128,
        hide: !hasOffers,
        tooltipField: "offer",
        enableCellChangeFlash: true,
        valueFormatter: (p) =>
          p.node?.rowPinned || !p.value
            ? ""
            : `${p.value}${p.data?.offerState === "paid" ? " · paid" : p.data?.offerState === "expired" ? " · lapsed" : p.data?.offerState === "closed" ? " · closed" : ""}`,
      },
      { field: "value", headerName: `In ${base}`, headerTooltip: `What it is worth in ${base} at today's ECB rates`, minWidth: 88, type: "rightAligned", valueFormatter: (p) => home(p.value) },
      {
        field: "swing",
        headerName: "Swing",
        headerTooltip: "One standard deviation of the value until the due date — a size of uncertainty, not a forecast",
        minWidth: 92,
        hide: true, // no room on screen; included in the CSV download
        type: "rightAligned",
        valueFormatter: (p) => (p.node?.rowPinned ? "" : p.value == null ? "overdue" : p.value === 0 ? "none" : `±${home(p.value)}`),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, maxRisk, clientUrls, hasOffers],
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
        <div className={styles.examples} role="group" aria-label="Quick views">
          {(Object.keys(VIEWS) as View[]).map((v) =>
            v !== "all" && counts[v] === 0 ? null : (
              <button key={v} type="button" className={styles.chip} aria-pressed={view === v} onClick={() => pickView(v)}>
                {VIEWS[v].label} · {counts[v]}
              </button>
            ),
          )}
        </div>
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
          onClick={() => api.current?.exportDataAsCsv({ fileName: `open-invoices-${base}.csv`, skipPinnedBottom: false, allColumns: true })}
        >
          Download CSV
        </button>
      </div>
      <div style={{ height: Math.min(1000, 58 + 42 * (rows.length + 1)) }}>
        <AgGridReact<InvoiceRow>
          theme={theme}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={{ sortable: true, resizable: true, filter: false }}
          quickFilterText={search}
          pinnedBottomRowData={totals as InvoiceRow[]}
          getRowId={(p) => p.data.id ?? p.data.number}
          onGridReady={(e) => (api.current = e.api)}
          onFilterChanged={refreshTotals}
          isExternalFilterPresent={() => viewRef.current !== "all"}
          doesExternalFilterPass={(n) => !!n.data && VIEWS[viewRef.current].pass(n.data)}
          rowClassRules={{ [styles.gridPaid]: (p) => !!p.data?.paidToday }}
          tooltipShowDelay={300}
          includeHiddenColumnsInQuickFilter
          autoSizeStrategy={{ type: "fitGridWidth" }}
        />
      </div>
    </div>
  );
}

function total(all: InvoiceRow[]): TotalRow {
  const rows = all.filter((r) => !r.paidToday);
  return {
    number: `${rows.length} invoice${rows.length === 1 ? "" : "s"}`,
    value: rows.reduce((s, r) => s + r.value, 0),
    atRisk: rows.reduce((s, r) => s + r.atRisk, 0),
  };
}
