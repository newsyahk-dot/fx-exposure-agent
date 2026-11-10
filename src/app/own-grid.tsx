"use client";
// "Try it with your own invoices": the pasted list in an AG Grid — every line, read or not, with column filters
// (floating), quick search, sorting by home-currency value and CSV export. Rows that could not be read or valued stay
// in the grid with the reason, so nothing is silently dropped. Read-only: these invoices are not in PayPal.

import { type ColDef, type GridApi, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useRef, useState } from "react";
import type { AgentRun } from "@/lib/agent";
import { compact } from "@/lib/format";
import type { OwnLine } from "@/lib/own-analysis";
import { gridTheme } from "./grid-theme";
import styles from "./page.module.css";

import "./grid-modules";

type Row = OwnLine & { agent: string };

const fmtCcy = (ccy: string, v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, currencyDisplay: "code" }).format(v);
const dueText = (d: number | null) => (d == null ? "" : d < 0 ? `${-d} days late` : d === 0 ? "today" : `in ${d} days`);

export function OwnGrid({ lines, run, base }: { lines: OwnLine[]; run: AgentRun; base: string }) {
  const api = useRef<GridApi<Row> | null>(null);
  const [search, setSearch] = useState("");
  const home = useMemo(() => (v: number) => compact(base, v), [base]);
  const rows = useMemo<Row[]>(() => {
    const did = new Map(run.proposals.map((p) => [p.invoiceNumber, p.kind === "reminder" ? "Payment reminder" : `Early-payment offer, ${p.percent}% off`]));
    const why = new Map(run.notProposed.map((n) => [n.invoiceNumber, n.why]));
    return lines.map((l) => ({
      ...l,
      agent: l.error ? "" : did.get(l.number) ?? why.get(l.number) ?? (l.currency === base ? `In ${base}: no exchange-rate risk` : "Nothing to do today"),
    }));
  }, [lines, run, base]);

  const columns = useMemo<ColDef<Row>[]>(
    () => [
      { field: "row", headerName: "Line", minWidth: 64, maxWidth: 76, type: "rightAligned", filter: false },
      {
        field: "number",
        headerName: "Invoice",
        minWidth: 100,
        filter: "agTextColumnFilter",
        cellRenderer: (p: ICellRendererParams<Row>) => (p.data?.error && !p.value ? <span className={styles.gridLateText}>Not read</span> : p.value),
      },
      { field: "client", headerName: "Client", minWidth: 140, filter: "agTextColumnFilter", wrapText: true, autoHeight: true },
      { field: "currency", headerName: "Ccy", minWidth: 64, maxWidth: 80, filter: false },
      {
        field: "amount",
        headerName: "Still owed",
        minWidth: 120,
        type: "rightAligned",
        filter: "agNumberColumnFilter",
        valueFormatter: (p) => (p.value == null || !p.data?.currency ? "" : fmtCcy(p.data.currency, p.value)),
        getQuickFilterText: (p) => (p.value == null || !p.data?.currency ? "" : `${fmtCcy(p.data.currency, p.value)} ${p.data.currency}`),
      },
      {
        field: "daysToDue",
        headerName: "Due",
        minWidth: 100,
        filter: "agNumberColumnFilter",
        filterParams: { buttons: ["reset"] },
        headerTooltip: "Filter by days to due date: negative numbers are days late",
        valueFormatter: (p) => dueText(p.value),
        getQuickFilterText: (p) => dueText(p.value),
        cellClassRules: { [styles.gridLate]: (p) => (p.value ?? 0) < 0 },
      },
      {
        field: "value",
        headerName: `In ${base}`,
        minWidth: 84,
        type: "rightAligned",
        filter: "agNumberColumnFilter",
        valueFormatter: (p) => (p.value == null ? "" : home(p.value)),
      },
      {
        field: "atRisk",
        headerName: "At risk",
        minWidth: 100,
        type: "rightAligned",
        sort: "desc",
        filter: "agNumberColumnFilter",
        headerTooltip: "What a 3% move either way would change, in the home currency — the size of the risk, not a forecast",
        valueFormatter: (p) => (p.value == null ? "" : p.value ? `±${home(p.value)}` : "none"),
      },
      {
        field: "agent",
        headerName: "Agent today",
        minWidth: 230,
        flex: 1,
        wrapText: true, // the reason is the point of this column: show it whole, not "this client has a late inv…"
        autoHeight: true,
        filter: "agTextColumnFilter",
        tooltipValueGetter: (p) => p.data?.error ?? p.value,
        cellRenderer: (p: ICellRendererParams<Row>) => (p.data?.error ? <span className={styles.gridLateText}>{p.data.error}</span> : p.value),
      },
    ],
    [base, home],
  );

  const unread = rows.filter((r) => r.error).length;
  return (
    <div className={`${styles.gridWrap} ${styles.ownGrid}`}>
      <div className={styles.gridTools}>
        <input
          type="search"
          placeholder="Search invoices, clients, amounts…"
          aria-label="Search your invoices"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className={styles.secondaryButton} onClick={() => api.current?.exportDataAsCsv({ fileName: "my-invoices-fx.csv" })}>
          Download CSV
        </button>
        <span className={styles.muted}>
          {rows.length - unread} read{unread ? ` · ${unread} not read (red rows, with the reason)` : ""} · filter any column from the row under the headers
        </span>
      </div>
      <AgGridReact<Row>
        theme={gridTheme}
        rowData={rows}
        columnDefs={columns}
        defaultColDef={{ sortable: true, resizable: true, floatingFilter: true, suppressHeaderMenuButton: true }}
        quickFilterText={search}
        domLayout="autoHeight"
        rowClassRules={{ [styles.gridErrorRow]: (p) => !!p.data?.error }}
        tooltipShowDelay={300}
        autoSizeStrategy={{ type: "fitGridWidth" }}
        tabToNextCell={() => false}
        overlayNoRowsTemplate="No invoice matches this search or filter."
        onGridReady={(e) => (api.current = e.api)}
        pagination={rows.length > 25}
        paginationPageSize={25}
        paginationPageSizeSelector={false}
      />
    </div>
  );
}
