"use client";

// Every open invoice in one AG Grid (Community): ranked by what it puts at risk, with today's agent status and any
// early-payment offer, sortable by any column, searchable, quick views (late / agent acting / offers out) as an
// external filter, a pinned total row that follows the filter, cells that flash when PayPal reports a change (the
// page refreshes every 10 s), and a CSV download for the seller's own records. Invoices paid today stay listed
// (greyed) so the change is visible. Colours come from the page's CSS variables, so the grid follows light and dark mode.

import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type ICellRendererParams,
  type RowSelectionOptions,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useRef, useState } from "react";
import type { InvoiceRow } from "@/lib/invoice-rows";
import { approve } from "./actions";
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
  cellHorizontalPadding: 10, // nine columns at desktop width: the default padding truncated "18 days late"
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

export function InvoiceGrid({
  rows,
  base,
  clientUrls,
  lockReason,
}: {
  rows: InvoiceRow[];
  base: string;
  clientUrls: Record<string, string>;
  lockReason?: string; // approvals need the access code on the hosted demo
}) {
  const api = useRef<GridApi<InvoiceRow> | null>(null);
  const router = useRouter();
  // Rows with a proposal still waiting can be ticked and approved together — after a confirmation that lists exactly
  // what will be sent. Each one goes through the same server action (and checks) as the card's own button.
  const [selected, setSelected] = useState<InvoiceRow[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ number: string; ok: boolean; message: string }[]>([]);
  const rowSelection = useMemo<RowSelectionOptions<InvoiceRow>>(
    () => ({ mode: "multiRow", isRowSelectable: (n) => !!n.data?.action && !n.data.detailOf, hideDisabledCheckboxes: true, enableClickSelection: false }),
    [],
  );
  const approveSelected = () => runApprovals(selected);
  const runApprovals = async (list: InvoiceRow[]) => {
    setRunning(true);
    const out: typeof results = [];
    for (const r of list) {
      const a = r.action;
      if (!a) continue;
      const f = new FormData();
      f.set("kind", a.kind);
      f.set("invoiceId", r.id);
      f.set("base", base);
      if (a.kind === "reminder") {
        f.set("subject", a.subject);
        f.set("message", a.message);
      } else {
        f.set("percent", String(a.percent));
        f.set("withinDays", String(a.withinDays));
        f.set("clientNote", a.clientNote);
      }
      const res = await approve(null, f).catch((e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : String(e) }));
      out.push({ number: r.number, ok: !!res?.ok, message: res?.message ?? "No answer" });
      setResults([...out]);
    }
    setRunning(false);
    setConfirming(false);
    api.current?.deselectAll();
    router.refresh();
  };
  const [search, setSearch] = useState("");
  // Detail rows (AG Grid full-width rows, Community): open an invoice to see how this client has paid before and the
  // agent's draft for it, and approve just that one.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const displayRows = useMemo(
    () => rows.flatMap((r) => (expanded.has(r.id) ? [r, { ...r, id: `${r.id}#detail`, detailOf: r.id }] : [r])),
    [rows, expanded],
  );
  const [view, setView] = useState<View>("all");
  const viewRef = useRef<View>("all"); // read by the grid's filter callbacks
  // Stable callbacks: AG Grid refilters when these change identity, and the refilter re-rendered the page in a loop.
  const filter = useMemo(
    () => ({
      present: () => viewRef.current !== "all",
      pass: (n: { data?: InvoiceRow }) => !!n.data && VIEWS[viewRef.current].pass(n.data), // a detail row carries its invoice's fields
    }),
    [],
  );
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
        minWidth: 164,
        // The invoice number opens PayPal's client view (a separate column did not fit at desktop width).
        cellRenderer: (p: ICellRendererParams<InvoiceRow>) =>
          p.data?.id && clientUrls[p.data.id] ? (
            <span className={styles.gridInvoice}>
              <button
                type="button"
                className={styles.gridToggle}
                aria-expanded={expanded.has(p.data.id)}
                aria-label={`${expanded.has(p.data.id) ? "Close" : "Open"} details for ${p.value}`}
                onClick={() => toggle(p.data!.id)}
              >
                {expanded.has(p.data.id) ? "▾" : "▸"}
              </button>
              <a href={clientUrls[p.data.id]} target="_blank" rel="noopener noreferrer" className={styles.link} title="Open in PayPal as the client">
                {p.value} ↗
              </a>
            </span>
          ) : (
            p.value
          ),
      },
      {
        field: "client",
        headerName: "Client",
        minWidth: 136,
        tooltipField: "client",
        // Name, and underneath how this client has paid before (from their fully paid invoices).
        cellRenderer: (p: ICellRendererParams<InvoiceRow>) =>
          p.node.rowPinned ? null : (
            <span className={styles.gridTwoLine}>
              <span>{p.value}</span>
              {p.data?.usuallyPays && <small>{p.data.usuallyPays}</small>}
            </span>
          ),
      },
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
        minWidth: 116,
        valueFormatter: (p) =>
          p.value == null ? "" : p.data?.paidToday ? "paid today" : p.value < 0 ? `${-p.value} days late` : p.value === 0 ? "today" : `in ${p.value} days`,
        cellClassRules: { [styles.gridLate]: (p) => !p.data?.paidToday && (p.value ?? 0) < 0 },
      },
      {
        field: "atRisk",
        headerName: "At risk ±3%",
        minWidth: 88,
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
        minWidth: 156,
        tooltipField: "agent",
        enableCellChangeFlash: true,
        cellClassRules: { [styles.gridActive]: (p) => /proposed|sent|Paid/.test(p.value ?? "") },
      },
      {
        field: "offer",
        headerName: "Offer",
        headerTooltip: "A separate PayPal invoice for the discounted amount; it lapses after its date and the original applies",
        minWidth: 104,
        hide: !hasOffers,
        tooltipField: "offer",
        enableCellChangeFlash: true,
        valueFormatter: (p) =>
          p.node?.rowPinned || !p.value
            ? ""
            : `${p.value}${p.data?.offerState === "paid" ? " · paid" : p.data?.offerState === "expired" ? " · lapsed" : p.data?.offerState === "closed" ? " · closed" : ""}`,
      },
      { field: "value", headerName: `In ${base}`, headerTooltip: `What it is worth in ${base} at today's ECB rates`, minWidth: 84, type: "rightAligned", valueFormatter: (p) => home(p.value) },
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
    [base, maxRisk, clientUrls, hasOffers, expanded],
  );

  // Totals follow the filter: what is at risk among the invoices currently shown. The filtered list is tied to the
  // rows it was taken from, so new rows from the server start from the full total again.
  const [shown, setShown] = useState<{ from: InvoiceRow[]; list: InvoiceRow[] } | null>(null);
  const totals = [total(shown?.from === rows ? shown.list : rows)];
  const refreshTotals = () => {
    const list: InvoiceRow[] = [];
    api.current?.forEachNodeAfterFilter((n) => n.data && !n.data.detailOf && list.push(n.data));
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
          onClick={() =>
            api.current?.exportDataAsCsv({
              fileName: `open-invoices-${base}.csv`,
              skipPinnedBottom: false,
              allColumns: true,
              shouldRowBeSkipped: (p) => !!p.node.data?.detailOf,
            })
          }
        >
          Download CSV
        </button>
      </div>
      {(selected.length > 0 || results.length > 0) && (
        <div className={styles.gridApprove} role="region" aria-label="Approve from the grid">
          {selected.length > 0 && !confirming && !running && (
            <p>
              <strong>{selected.length} selected</strong> — the agent&apos;s own wording, checked again on the server.{" "}
              <button type="button" className={styles.approve} disabled={!!lockReason} onClick={() => setConfirming(true)}>
                Approve selected ({selected.length})
              </button>
              {lockReason && <span className={styles.muted}> {lockReason}</span>}
            </p>
          )}
          {(confirming || running) && (
            <>
              <p>
                <strong>This will run in PayPal:</strong>
              </p>
              <ul>
                {selected.map((r) => (
                  <li key={r.id}>
                    {r.number} — {r.action?.label}
                  </li>
                ))}
              </ul>
              <p>
                <button type="button" className={styles.approve} disabled={running} onClick={approveSelected}>
                  {running ? `Running in PayPal… ${results.length}/${selected.length}` : `Confirm: approve ${selected.length}`}
                </button>{" "}
                {!running && (
                  <button type="button" className={styles.secondaryButton} onClick={() => setConfirming(false)}>
                    Cancel
                  </button>
                )}
              </p>
            </>
          )}
          {results.length > 0 && !running && (
            <ul>
              {results.map((x) => (
                <li key={x.number} className={x.ok ? styles.ok : styles.error}>
                  {x.ok ? "✓" : "✗"} {x.number}: {x.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div>
        <DetailCtx.Provider value={{ lockReason, busy: running, approveOne: (r) => runApprovals([r]), close: toggle }}>
        <AgGridReact<InvoiceRow>
          theme={theme}
          rowData={displayRows}
          columnDefs={columns}
          defaultColDef={{ sortable: true, resizable: true, filter: false }}
          quickFilterText={search}
          pinnedBottomRowData={totals as InvoiceRow[]}
          getRowId={(p) => p.data.id ?? p.data.number}
          rowHeight={52}
          domLayout="autoHeight"
          rowSelection={rowSelection}
          selectionColumnDef={{ pinned: "left", width: 44, minWidth: 44, maxWidth: 44, headerTooltip: "Select proposals to approve together" }}
          onSelectionChanged={(e) => {
            const rows = e.api.getSelectedRows();
            setSelected(rows);
            if (rows.length) setResults([]); // a new selection starts over; clearing it after a run keeps the results
          }}
          onGridReady={(e) => (api.current = e.api)}
          onFilterChanged={refreshTotals}
          isExternalFilterPresent={filter.present}
          doesExternalFilterPass={filter.pass}
          isFullWidthRow={isDetail}
          fullWidthCellRenderer={DetailCell}
          getRowHeight={rowHeight}
          postSortRows={detailsUnderParents}
          rowClassRules={{ [styles.gridPaid]: (p) => !!p.data?.paidToday }}
          tooltipShowDelay={300}
          includeHiddenColumnsInQuickFilter
          autoSizeStrategy={{ type: "fitGridWidth" }}
        />
        </DetailCtx.Provider>
      </div>
    </div>
  );
}

function total(all: InvoiceRow[]): TotalRow {
  const rows = all.filter((r) => !r.paidToday && !r.detailOf);
  return {
    number: `${rows.length} open invoice${rows.length === 1 ? "" : "s"}`,
    value: rows.reduce((s, r) => s + r.value, 0),
    atRisk: rows.reduce((s, r) => s + r.atRisk, 0),
  };
}

// Grid callbacks live outside the component: AG Grid redraws full-width rows when these props change identity, and a
// redraw inside a render made the grid loop once a row was opened. The detail renderer reads live state from context.
type DetailState = { lockReason?: string; busy: boolean; approveOne: (r: InvoiceRow) => void; close: (id: string) => void };
const DetailCtx = createContext<DetailState>({ busy: false, approveOne: () => {}, close: () => {} });
const isDetail = (p: { rowNode: { data?: InvoiceRow } }) => !!p.rowNode.data?.detailOf;
const rowHeight = (p: { data?: InvoiceRow }) => (p.data?.detailOf ? detailHeight(p.data) : 52);
// Keep each detail row right under its invoice whatever the sort.
const detailsUnderParents = (params: { nodes: { data?: InvoiceRow }[] }) => {
  const nodes = params.nodes;
  for (const d of nodes.filter((n) => n.data?.detailOf)) {
    nodes.splice(nodes.indexOf(d), 1);
    nodes.splice(nodes.findIndex((n) => n.data?.id === d.data!.detailOf) + 1, 0, d);
  }
};
function DetailCell(p: ICellRendererParams<InvoiceRow>) {
  const ctx = useContext(DetailCtx);
  const d = p.data;
  if (!d?.detailOf) return null;
  const r = { ...d, id: d.detailOf, detailOf: undefined };
  return <DetailRow r={r} lockReason={ctx.lockReason} busy={ctx.busy} onApprove={() => ctx.approveOne(r)} onClose={() => ctx.close(r.id)} />;
}

// Text wraps at roughly 70 characters in each half of the detail row (one column, ~40 characters, on a phone); the
// estimate errs on the tall side, and the row scrolls inside if it is still short.
const detailHeight = (r: InvoiceRow | undefined) => {
  const narrow = typeof window !== "undefined" && window.innerWidth < 720;
  const per = narrow ? 40 : 70;
  const lines = (t: string | undefined) => (t ? Math.ceil(t.length / per) : 0); // line breaks collapse when shown
  const a = r?.action;
  const draft = !a ? 1 : a.kind === "reminder" ? 1 + lines(a.subject) + lines(a.message) : 1 + lines(a.label) + 2 + lines(a.clientNote);
  const hist = Math.max(1, (r?.history.length ?? 0) * (narrow ? 2 : 1));
  return Math.max(narrow ? 190 : 150, 70 + 22 * (narrow ? hist + draft + 1 : Math.max(hist, draft)) + (a ? 56 : 0));
};

const fmt = (ccy: string, v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, currencyDisplay: "code" }).format(v);

// The opened invoice: how this client has paid before, and what the agent proposes for it (approve just this one).
function DetailRow({
  r,
  lockReason,
  busy,
  onApprove,
  onClose,
}: {
  r: InvoiceRow;
  lockReason?: string;
  busy: boolean;
  onApprove: () => void;
  onClose: () => void;
}) {
  const a = r.action;
  return (
    <div className={styles.gridDetail}>
      <div>
        <p>
          <strong>How {r.client || "this client"} has paid</strong>
        </p>
        {r.history.length ? (
          <ul>
            {r.history.map((h) => (
              <li key={h.number}>
                {h.number} · {fmt(h.currency, h.amount)} · due {h.dueDate}, paid {h.paidOn}{" "}
                <span className={h.daysLate > 0 ? styles.gridLateText : styles.muted}>{h.daysLate > 0 ? `(${h.daysLate} days late)` : "(on time)"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>No paid invoices from this client yet.</p>
        )}
      </div>
      <div>
        <p>
          <strong>{a ? "What the agent proposes" : "Agent today"}</strong>
        </p>
        {a ? (
          <>
            <p>{a.label}</p>
            {a.kind === "reminder" ? (
              <p className={styles.gridDraft}>
                <em>{a.subject}</em>
                <br />
                {a.message}
              </p>
            ) : (
              <p className={styles.gridDraft}>
                {a.percent}% off if paid within {a.withinDays} days — a separate early-payment invoice; the original stays as it is.
                <br />
                <em>{a.clientNote}</em>
              </p>
            )}
            <p>
              <button type="button" className={styles.approve} disabled={busy || !!lockReason} onClick={onApprove}>
                {a.kind === "reminder" ? "Approve: send this reminder" : "Approve: send this offer"}
              </button>{" "}
              {lockReason && <span className={styles.muted}>{lockReason}</span>}
            </p>
          </>
        ) : (
          <p>{r.agent}</p>
        )}
        <p>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Close
          </button>
        </p>
      </div>
    </div>
  );
}
