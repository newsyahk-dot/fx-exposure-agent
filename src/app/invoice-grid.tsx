"use client";

// Every open invoice in one AG Grid (Community): ranked by what it puts at risk, with today's agent status and any
// early-payment offer, sortable by any column, searchable, quick views (late / agent acting / offers out) as an
// external filter, a pinned total row that follows the filter, cells that flash when PayPal reports a change (the
// page refreshes every 10 s), and a CSV download for the seller's own records. Invoices paid today stay listed
// (greyed, at the bottom) so the change is visible. The Draft column edits the agent's wording or the discount with
// AG Grid's own editors; the server checks the edited text again before anything goes to PayPal. Colours come from the page's CSS variables, so the grid follows light and dark mode.

import {
  type ColDef,
  type GridApi,
  type ICellRendererParams,
  type RowSelectionOptions,
} from "ag-grid-community";
import { AgGridReact, type CustomCellEditorProps } from "ag-grid-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { applyEdit, type DraftEdit, type InvoiceRow } from "@/lib/invoice-rows";
import { annualCostPct } from "@/lib/offer-rule";
import { compact } from "@/lib/format";
import { FOCUS_EVENT, gridTheme, parseSearch, type FocusDetail } from "./grid-theme";
import { approve } from "./actions";
import styles from "./page.module.css";

import "./grid-modules";

const theme = gridTheme;

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


// Tab moves on to the next control on the page instead of walking every cell (round 7 review, 2026-11-09).
const leaveGrid = () => false as const;

// The e-mail's sign-off line and the name under it: "Best regards," "Kind regards" "Thanks," "Thank you," "Cheers,"
// "Sincerely," "All the best," — the cursor goes to the end of the line before it.
const SIGN_OFF =
  /(?:\n|(?<=[.!?])[ \t]+)[ \t]*(?:(?:best|kind|warm(?:est)?)\s+(?:regards|wishes)|best|regards|many thanks|thanks(?: again| so much)?|thank you(?: (?:very|so) much)?|cheers|sincerely|all the best|warmly)[ \t]*(?:[.!]|,(?:[ \t]*[^\n,]{1,30})?)?[ \t]*(?:\n[^\n]*){0,2}\s*$/i;

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
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  // The seller's edits to the agent's drafts, by invoice id; applied over the rows from the server.
  const [edits, setEdits] = useState<Record<string, DraftEdit>>({});
  const edit = (id: string, e: DraftEdit | null) =>
    setEdits((all) => {
      const n = { ...all };
      if (e) n[id] = e;
      else delete n[id];
      return n;
    });
  const current = useMemo(
    () =>
      rows.map((r) => {
        const a = r.action && applyEdit(r.action, edits[r.id]);
        if (!a || a === r.action) return r;
        // The Draft column says "edited"; here only a changed percent shows.
        const agent = a.kind === "early_pay_discount" ? r.agent.replace(/^[\d.]+% offer/, `${a.percent}% offer`) : r.agent;
        return { ...r, action: a, agent };
      }),
    [rows, edits],
  );
  // Rows with a proposal still waiting can be ticked and approved together — after a confirmation that lists exactly
  // what will be sent. Each one goes through the same server action (and checks) as the card's own button.
  const [selected, setSelected] = useState<InvoiceRow[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ number: string; ok: boolean; message: string }[]>([]);
  const rowSelection = useMemo<RowSelectionOptions<InvoiceRow>>(
    // selectAll "filtered": the header checkbox selects only the rows on screen. With the default it also picked
    // offers hidden by the Late view, and "Approve selected" listed actions nobody could see (blind review round 9).
    () => ({
      mode: "multiRow",
      selectAll: "filtered",
      isRowSelectable: (n) => !!n.data?.action && !n.data.detailOf,
      hideDisabledCheckboxes: true,
      enableClickSelection: false,
    }),
    [],
  );
  const approveSelected = () => runApprovals(selected);
  const runApprovals = async (list: InvoiceRow[]) => {
    setRunning(true);
    const out: typeof results = [];
    const byId = new Map(current.map((x) => [x.id, x]));
    for (const r0 of list) {
      const r = byId.get(r0.id) ?? r0; // the row as it is now, with any edit made after it was ticked
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
      if (res?.ok) edit(r.id, null);
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
  const focusOnOpen = useRef<string | null>(null);
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const displayRows = useMemo(
    () => current.flatMap((r) => (expanded.has(r.id) ? [r, { ...r, id: `${r.id}#detail`, detailOf: r.id }] : [r])),
    [current, expanded],
  );
  const [view, setView] = useState<View>("all");
  const viewRef = useRef<View>("all"); // read by the grid's filter callbacks
  // A currency (and due-date bucket) picked in the exposure grid above — the two grids are linked by an event.
  const [focus, setFocus] = useState<FocusDetail>(null);
  const focusRef = useRef<FocusDetail>(null);
  const pickFocus = (f: FocusDetail) => {
    focusRef.current = f;
    setFocus(f);
    api.current?.onFilterChanged();
  };
  useEffect(() => {
    const on = (e: Event) => pickFocus((e as CustomEvent<FocusDetail>).detail);
    window.addEventListener(FOCUS_EVENT, on);
    return () => window.removeEventListener(FOCUS_EVENT, on);
  }, []);
  // Stable callbacks: AG Grid refilters when these change identity, and the refilter re-rendered the page in a loop.
  const filter = useMemo(
    () => ({
      present: () => viewRef.current !== "all" || !!focusRef.current,
      pass: (n: { data?: InvoiceRow }) => {
        const r = n.data; // a detail row carries its invoice's fields
        const f = focusRef.current;
        if (!r || !VIEWS[viewRef.current].pass(r)) return false;
        return !f || (r.currency === f.currency && (f.bucket == null || r.bucket === f.bucket) && !r.paidToday);
      },
    }),
    [],
  );
  const pickView = (v: View) => {
    viewRef.current = v;
    setView(v);
    api.current?.onFilterChanged();
  };
  const counts = Object.fromEntries((Object.keys(VIEWS) as View[]).map((v) => [v, current.filter(VIEWS[v].pass).length])) as Record<View, number>;
  const maxRisk = Math.max(1, ...rows.map((r) => r.atRisk));
  const hasOffers = rows.some((r) => r.offer);
  const fmtHome = useMemo(() => new Intl.NumberFormat("en-US", { style: "currency", currency: base, maximumFractionDigits: 0 }), [base]);
  const home = (v: number | null | undefined) => (v == null ? "" : fmtHome.format(v));

  const columns = useMemo<ColDef<InvoiceRow>[]>(
    () => [
      {
        field: "number",
        headerName: "Invoice",
        pinned: narrow ? undefined : "left", // on a phone two pinned columns would fill the screen
        minWidth: narrow ? 134 : 160,
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
                {p.value}
                {!narrow && " ↗"}
              </a>
            </span>
          ) : (
            p.value
          ),
      },
      {
        field: "client",
        headerName: "Client",
        minWidth: 150,
        hide: narrow, // a phone shows the money first; the client is in the detail row and in search
        tooltipField: "client",
        getQuickFilterText: (p) => `${p.data?.client ?? ""} ${p.data?.usuallyPays ?? ""}`, // search what is shown
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
        minWidth: 116,
        hide: narrow, // a phone keeps the ranking column (At risk) on screen instead; the amount is in the detail row
        type: "rightAligned",
        enableCellChangeFlash: true,
        // Search the amount as shown ("760,000", "JPY 760,000").
        getQuickFilterText: (p) =>
          p.data?.currency && p.value != null
            ? `${fmt(p.data.currency, p.data.paidToday ? p.data.paidAmount : p.value)} ${new Intl.NumberFormat("en-US").format(p.value)} ${p.data.value ? `≈ ${home(p.data.value)}` : ""}`.replace(/\s/g, " ") // Intl puts a no-break space after the code
            : "",
        // Sort by what it is worth in the home currency: by face value every yen invoice sorted above every dollar one.
        comparator: (_a, _b, na, nb) => (na.data?.value ?? 0) - (nb.data?.value ?? 0),
        headerTooltip: `Sorted by what it is worth in ${base} (shown underneath), not by face value`,
        // The amount, and underneath what it is worth in the home currency — the sort key, so the order makes sense.
        cellRenderer: (p: ICellRendererParams<InvoiceRow>) =>
          p.node.rowPinned || !p.data?.currency ? (
            p.valueFormatted
          ) : (
            <span className={`${styles.gridTwoLine} ${styles.gridTwoLineRight}`}>
              <span>{p.valueFormatted}</span>
              {p.data.currency !== base && p.data.value > 0 && <small>≈ {home(p.data.value)}</small>}
            </span>
          ),
        valueFormatter: (p) =>
          p.data?.paidToday // what came in today ("paid today" shows under Due)
            ? fmt(p.data.currency, p.data.paidAmount)
            : p.data?.currency ? new Intl.NumberFormat("en-US", { style: "currency", currency: p.data.currency, currencyDisplay: "code" }).format(p.value) : "",
      },
      {
        field: "daysToDue",
        headerName: "Due",
        minWidth: narrow ? 102 : 104,
        // Search the words on screen ("8 days late", "paid today"), not the raw number of days.
        getQuickFilterText: (p) =>
          p.data?.paidToday ? "paid today" : p.value == null ? "" : p.value < 0 ? `${-p.value} days late overdue` : p.value === 0 ? "today" : `in ${p.value} days`,
        valueFormatter: (p) =>
          p.value == null ? "" : p.data?.paidToday ? "paid today" : p.value < 0 ? `${-p.value} days late` : p.value === 0 ? "today" : `in ${p.value} days`,
        cellClassRules: { [styles.gridLate]: (p) => !p.data?.paidToday && (p.value ?? 0) < 0 },
      },
      {
        field: "atRisk",
        headerName: "At risk",
        headerTooltip: "What a 3% move either way would change, in the home currency — the size of the risk, not a forecast",
        minWidth: narrow ? 74 : 88,
        initialSort: "desc", // initial only: a column rebuild (opening a row) must not bring this sort back
        valueFormatter: (p) => (p.value ? `±${home(p.value)}` : "none"), // used by the CSV export
        getQuickFilterText: (p) => (p.value ? `±${home(p.value)} ±${compact(base, p.value)}` : "none"), // search what is shown
        cellRenderer: (p: ICellRendererParams<InvoiceRow>) =>
          p.node.rowPinned ? (
            <strong>±{base === "KRW" || base === "JPY" ? compact(base, p.value) : home(p.value)}</strong>
          ) : p.value ? (
            <span className={styles.gridBar}>
              <i style={{ width: `${Math.round((p.value / maxRisk) * 100)}%` }} aria-hidden="true" />
              <span>±{base === "KRW" || base === "JPY" ? compact(base, p.value) : home(p.value)}</span>
            </span>
          ) : (
            <span className={styles.muted}>none</span>
          ),
      },
      {
        field: "agent",
        headerName: "Agent today",
        minWidth: 152,
        hide: narrow, // phones: Invoice, Due and At risk fit 390 px; the agent's action is in the detail row
        tooltipField: "agent",
        enableCellChangeFlash: true,
        cellClassRules: { [styles.gridActive]: (p) => /proposed|sent|Paid/.test(p.value ?? "") },
      },
      {
        // The agent's draft, editable before approval: the e-mail in AG Grid's large-text editor, the discount in a small
        // custom editor (only percents within the app's offer rule). Nothing is sent until she approves, and the
        // server checks the edited text again (numbers from the facts only, no forecasts, no links).
        colId: "draft",
        headerName: "Draft",
        // Search what the cell shows ("e-mail", "edited", "1%"), plus the e-mail text itself.
        getQuickFilterText: (p) =>
          !p.data?.action
            ? ""
            : p.data.action.kind === "reminder"
              ? `e-mail email ${p.data.action.edited ? "edited" : ""} ${p.data.action.subject} ${p.data.action.message}`
              : `${p.data.action.percent}% discount ${p.data.action.percents.length < 2 ? "fixed" : ""}`,
        headerTooltip: "Edit the agent's e-mail or discount before approving — checked again on the server",
        minWidth: 84,
        hide: narrow,
        sortable: false,
        // An offer with only one percent within the rule has nothing to pick: no editor, no ✎.
        editable: (p) =>
          !!p.data?.action && !p.data.detailOf && !p.node.rowPinned && (p.data.action.kind === "reminder" || p.data.action.percents.length > 1),
        valueGetter: (p) => (p.data?.action ? (p.data.action.kind === "reminder" ? p.data.action.message : p.data.action.percent) : null),
        valueSetter: (p) => {
          const a = p.data?.action;
          if (!a) return false;
          edit(p.data.id, a.kind === "reminder" ? { message: String(p.newValue ?? "").trim() } : { percent: Number(p.newValue) });
          return false; // the edit lives in state; new rows arrive through rowData
        },
        cellEditorSelector: (p) =>
          p.data?.action?.kind === "early_pay_discount"
            ? { component: PercentEditor, popup: true } // AG Grid places it over the cell and keeps it on screen ("under" ran off the bottom on low rows)
            : { component: MessageEditor, popup: true },
        cellEditorParams: { maxLength: 900, rows: 10, cols: 64, fmtHome: home },
        // Tab keeps the edit and stays on this row (AG Grid's default moved on and opened the next row's editor).
        suppressKeyboardEvent: (p) => {
          if (p.editing && p.event.key === "Enter") return true; // a new line in the e-mail, not "finish editing"
          if (!p.editing || p.event.key !== "Tab") return false;
          p.event.preventDefault();
          p.api.stopEditing();
          return true;
        },
        cellRenderer: (p: ICellRendererParams<InvoiceRow>) => {
          const a = p.data?.action;
          if (!a || p.node.rowPinned) return null;
          if (a.kind === "early_pay_discount" && a.percents.length < 2)
            return (
              <span className={styles.muted} title="The only discount within the app's offer rule for these dates, so there is nothing to pick">
                {a.percent}% · fixed
              </span>
            );
          return (
            <button
              type="button"
              className={styles.gridEdit}
              aria-label={`Edit the ${a.kind === "reminder" ? "e-mail" : "discount"} for ${p.data!.number}`}
              title={a.kind === "reminder" ? "Edit the e-mail (click outside or Tab to keep it)" : `Pick another discount: ${a.percents.map((x) => `${x}%`).join(", ")}`}
              onClick={() => p.node.rowIndex != null && p.api.startEditingCell({ rowIndex: p.node.rowIndex, colKey: "draft" })}
            >
              ✎ {a.kind === "reminder" ? (a.edited ? "edited" : "e-mail") : `${a.percent}%`}
            </button>
          );
        },
      },
      {
        field: "offer",
        headerName: "Offer",
        headerTooltip: "A separate PayPal invoice for the discounted amount; it lapses after its date and the original applies",
        minWidth: 144,
        hide: !hasOffers || narrow,
        tooltipField: "offer",
        enableCellChangeFlash: true,
        valueFormatter: (p) =>
          p.node?.rowPinned || !p.value
            ? ""
            : // "paid" shows in Agent today ("Paid today (offer)"); here it only cut the date off at 1366 px
              `${p.value}${p.data?.offerState === "expired" ? " · lapsed" : p.data?.offerState === "closed" ? " · closed" : ""}`,
      },
      // In the CSV only: the page is never wider than 1080 px, and on screen this column cut Agent and Offer off.
      { field: "value", headerName: `In ${base}`, headerTooltip: `What it is worth in ${base} at today's ECB rates`, minWidth: 80, hide: true, type: "rightAligned", valueFormatter: (p) => home(p.value) },
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
    [base, maxRisk, clientUrls, hasOffers, expanded, narrow],
  );

  // Totals follow the filter: what is at risk among the invoices currently shown. The filtered list is tied to the
  // rows it was taken from, so new rows from the server start from the full total again.
  const [shown, setShown] = useState<{ from: InvoiceRow[]; list: InvoiceRow[] } | null>(null);
  const totals = [total(shown?.from === rows ? shown.list : rows, base)];
  const refreshTotals = () => {
    const list: InvoiceRow[] = [];
    api.current?.forEachNodeAfterFilter((n) => n.data && !n.data.detailOf && list.push(n.data));
    setShown({ from: rows, list });
    // A selected row that a view or search hides is deselected: approving only ever covers rows on screen.
    const visible = new Set(list.map((r) => r.id));
    const hidden = api.current?.getSelectedNodes().filter((n) => n.data && !visible.has(n.data.id)) ?? [];
    if (hidden.length) api.current?.setNodesSelected({ nodes: hidden, newValue: false });
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
        {focus && (
          <span className={styles.focusChip}>
            <button type="button" className={styles.chip} aria-pressed onClick={() => pickFocus(null)} title="Show every invoice again">
              {focus.label} ✕
            </button>
          </span>
        )}
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
              // Numbers as numbers (the currency is its own column), so the file adds up in a spreadsheet.
              processCellCallback: (p) => {
                const d = p.node?.data;
                switch (p.column.getColId()) {
                  case "amount":
                    return d?.paidToday ? d.paidAmount : (p.value ?? "");
                  case "daysToDue": // the due date, and the words on screen ("15 days late")
                    // The pinned total row has no due date: leave it blank (it exported "undefined (in undefined days)").
                    if (p.node?.rowPinned || !d?.dueDate || typeof p.value !== "number") return d?.paidToday ? "paid today" : "";
                    return d.paidToday ? "paid today" : `${d.dueDate} (${p.value < 0 ? `${-p.value} days late` : p.value === 0 ? "today" : `in ${p.value} days`})`;
                  case "atRisk":
                  case "value":
                    return typeof p.value === "number" ? Math.round(p.value * 100) / 100 : (p.value ?? "");
                  case "swing":
                    return typeof p.value === "number" ? Math.round(p.value * 100) / 100 : p.value === null ? "overdue" : "";
                  case "draft": {
                    const a = d?.action;
                    if (!a) return "";
                    return a.kind === "reminder" ? a.message.replace(/\s+/g, " ").trim() : `${a.percent}% off if paid by ${a.newDueDate}`;
                  }
                  default:
                    return p.formatValue ? p.formatValue(p.value) : (p.value ?? "");
                }
              },
            })
          }
        >
          Download CSV
        </button>
      </div>
      {(selected.length > 0 || results.length > 0) && (
        // The short bar stays in view while she ticks rows; the confirmation list does not (sticky, it covered the
        // header and the very rows it lists).
        <div className={styles.gridApprove} data-static={confirming || running || results.length > 0 || undefined} role="region" aria-label="Approve from the grid">
          {selected.length > 0 && !confirming && !running && (
            <p>
              <strong>{selected.length} selected</strong> — the agent&apos;s wording or your edit, checked again on the server.{" "}
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
                {selected.map((r0) => {
                  const r = current.find((x) => x.id === r0.id) ?? r0;
                  return (
                    <li key={r.id}>
                      {r.number} — {r.action?.label}
                      {r.action?.edited ? " (your edit)" : ""}
                    </li>
                  );
                })}
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
      {narrow && <p className={styles.muted}>▸ opens an invoice: the amount, the client, what the agent proposes, and approve.</p>}
      <div role="region" aria-label="Every open invoice, ranked by what it puts at risk">
        <DetailCtx.Provider
          value={{
            lockReason,
            busy: running,
            approveOne: (r) => runApprovals([r]),
            close: toggle,
            undo: (id) => edit(id, null),
            clientUrl: (id) => clientUrls[id],
            focusOnOpen,
            refocus: (id) => {
              const node = api.current?.getRowNode(id);
              if (node?.rowIndex != null) api.current?.setFocusedCell(node.rowIndex, "number");
            },
          }}
        >
        <AgGridReact<InvoiceRow>
          theme={theme}
          tabToNextCell={leaveGrid}
          tabToNextHeader={leaveGrid}
          rowData={displayRows}
          columnDefs={columns}
          defaultColDef={{ sortable: true, resizable: true, filter: false }}
          quickFilterText={search}
          quickFilterParser={parseSearch}
          overlayNoRowsTemplate="No open invoice matches this view or search."
          pinnedBottomRowData={totals as InvoiceRow[]}
          getRowId={(p) => p.data.id ?? p.data.number}
          rowHeight={52}
          domLayout="autoHeight"
          rowSelection={rowSelection}
          selectionColumnDef={{ pinned: narrow ? undefined : "left", width: 44, minWidth: 44, maxWidth: 44, headerTooltip: "Select proposals to approve together" }}
          stopEditingWhenCellsLoseFocus
          // Keyboard: Enter or Space on a focused invoice cell opens or closes its detail row (the ▸ button inside the
          // cell is not reachable with the arrow keys).
          onCellKeyDown={(e) => {
            const k = (e.event as KeyboardEvent | null)?.key;
            if (!("column" in e)) {
              // A focused detail row: Tab or Enter moves into its buttons and link (Tab used to leave the grid and skip
              // them — blind review round 8).
              const t = (e.event as KeyboardEvent).target as HTMLElement | null;
              if ((k === "Tab" || k === "Enter") && t?.classList.contains("ag-full-width-row")) {
                const first = t.querySelector<HTMLElement>("button:not([disabled]), a[href]");
                if (first) {
                  (e.event as KeyboardEvent).preventDefault();
                  first.focus();
                }
              }
              return;
            }
            if ((k === "Enter" || k === " ") && e.column.getColId() === "number" && e.data?.id && !e.data.detailOf && !e.node.rowPinned) {
              (e.event as KeyboardEvent).preventDefault();
              if (!expanded.has(e.data.id)) focusOnOpen.current = e.data.id;
              toggle(e.data.id);
            }
          }}
          onCellEditingStarted={(e) => {
            if (e.column.getColId() !== "draft") return;
            // The open detail row shows the same draft: close it while editing, or the popup covers it and the text
            // shows twice (blind review round 8).
            if (e.data?.id && expanded.has(e.data.id)) toggle(e.data.id);
          }}
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

// The pinned total row. It counts home-currency invoices too (they can be late), so it says how many: otherwise its
// value reads as contradicting the "from clients abroad" total on Today (blind review, 2026-11-09).
function total(all: InvoiceRow[], base: string): TotalRow {
  const rows = all.filter((r) => !r.paidToday && !r.detailOf);
  const home = rows.filter((r) => r.currency === base).length;
  // The "Paid today" view has only paid rows: say that rather than "0 open".
  const paid = all.filter((r) => r.paidToday && !r.detailOf).length;
  if (!rows.length && paid) return { number: `${paid} paid today`, value: 0, atRisk: 0 };
  return {
    // Short enough for the pinned Invoice column ("17 open invoices (6 in USD)" was cut off at desktop width).
    number: `${rows.length} open${home ? ` · ${home} in ${base}` : ""}`,
    value: rows.reduce((s, r) => s + r.value, 0),
    atRisk: rows.reduce((s, r) => s + r.atRisk, 0),
  };
}

// Grid callbacks live outside the component: AG Grid redraws full-width rows when these props change identity, and a
// redraw inside a render made the grid loop once a row was opened. The detail renderer reads live state from context.
type DetailState = {
  lockReason?: string;
  busy: boolean;
  approveOne: (r: InvoiceRow) => void;
  close: (id: string) => void;
  undo: (id: string) => void;
  clientUrl: (id: string) => string | undefined;
  focusOnOpen: { current: string | null }; // the row opened from the keyboard: focus moves into its detail row
  refocus: (id: string) => void; // back to the invoice cell after Escape
};
const DetailCtx = createContext<DetailState>({
  busy: false,
  approveOne: () => {},
  close: () => {},
  undo: () => {},
  clientUrl: () => undefined,
  focusOnOpen: { current: null },
  refocus: () => {},
});
const NARROW = "(max-width: 719px)";
const subscribeNarrow = (cb: () => void) => {
  const m = window.matchMedia(NARROW);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const isNarrow = () => window.matchMedia(NARROW).matches;
const isDetail = (p: { rowNode: { data?: InvoiceRow } }) => !!p.rowNode.data?.detailOf;
// A detail row's height: measured from its content once shown (estimated until then).
const measured = new Map<string, number>();
const rowHeight = (p: { data?: InvoiceRow }) => (p.data?.detailOf ? (measured.get(p.data.id) ?? detailHeight(p.data)) : 52);
// Invoices paid today go to the bottom, and each detail row sits right under its invoice, whatever the sort.
const detailsUnderParents = (params: { nodes: { data?: InvoiceRow }[] }) => {
  const nodes = params.nodes;
  const main = nodes.filter((n) => !n.data?.detailOf);
  const details = nodes.filter((n) => n.data?.detailOf);
  const out: typeof nodes = [];
  for (const n of [...main.filter((x) => !x.data?.paidToday), ...main.filter((x) => x.data?.paidToday)]) {
    out.push(n);
    const d = details.find((x) => x.data!.detailOf === n.data?.id);
    if (d) out.push(d);
  }
  nodes.splice(0, nodes.length, ...out);
};
function DetailCell(p: ICellRendererParams<InvoiceRow>) {
  const ctx = useContext(DetailCtx);
  const ref = useRef<HTMLDivElement>(null);
  const d = p.data;
  const id = d?.id;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !id) return;
    const fit = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0 && Math.abs((p.node.rowHeight ?? 0) - h) > 1) {
        measured.set(id, h);
        p.node.setRowHeight(h);
        p.api.onRowHeightChanged();
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [id, p.node, p.api]);
  if (!d?.detailOf) return null;
  const r = { ...d, id: d.detailOf, detailOf: undefined };
  return (
    <div ref={ref}>
      <DetailRow
        r={r}
        lockReason={ctx.lockReason}
        busy={ctx.busy}
        clientUrl={ctx.clientUrl(r.id)}
        autoFocus={ctx.focusOnOpen.current === r.id}
        onFocused={() => (ctx.focusOnOpen.current = null)}
        onApprove={() => ctx.approveOne(r)}
        onClose={() => ctx.close(r.id)}
        onEscape={() => {
          ctx.close(r.id);
          ctx.refocus(r.id);
        }}
        onUndo={() => ctx.undo(r.id)}
      />
    </div>
  );
}

// First guess before the detail row is measured: text wraps at roughly 70 characters in each half (one column, ~40
// characters, on a phone).
const detailHeight = (r: InvoiceRow | undefined) => {
  const narrow = typeof window !== "undefined" && window.innerWidth < 720;
  const per = narrow ? 40 : 70;
  const lines = (t: string | undefined) => (t ? Math.ceil(t.length / per) : 0); // line breaks collapse when shown
  const a = r?.action;
  const draft = !a ? 1 : a.kind === "reminder" ? 1 + lines(a.subject) + lines(a.message) : 1 + lines(a.label) + 2 + lines(a.clientNote);
  const hist = Math.max(1, (r?.history.length ?? 0) * (narrow ? 2 : 1));
  return Math.max(narrow ? 190 : 150, 70 + 22 * (narrow ? hist + draft + 1 : Math.max(hist, draft)) + (a ? 56 : 0));
};

// Popup cell editor for the reminder e-mail. AG Grid's large-text editor selects the whole text when it opens, and
// moving the cursor afterwards raced it (one run in two left everything selected, so the first key erased the e-mail —
// blind review round 9). This editor places the cursor itself, before the sign-off ("Best regards, Maya", "Thanks,",
// "Cheers"…), so what she types lands in the message, and keeps the greeting in view.
function MessageEditor(p: CustomCellEditorProps<InvoiceRow, string>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(String(p.value ?? ""));
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    const sign = ta.value.search(SIGN_OFF);
    let at = sign > 0 ? sign : ta.value.length;
    while (at > 0 && /\s/.test(ta.value[at - 1])) at--; // end of the last message line, not a blank line
    ta.setSelectionRange(at, at);
    ta.scrollTop = 0;
  }, []);
  return (
    <div className={styles.messageEditor}>
      <textarea
        ref={ref}
        aria-label={`E-mail to ${p.data?.client || "the client"} for ${p.data?.number}`}
        value={text}
        maxLength={900}
        rows={10}
        cols={64}
        onChange={(e) => {
          setText(e.target.value);
          p.onValueChange(e.target.value);
        }}
      />
      <span className={styles.muted}>Tab or click outside to keep it · Esc to cancel · checked again on the server</span>
    </div>
  );
}

// Popup cell editor for an offer's discount: one button per percent the app's offer rule allows for this invoice.
function PercentEditor(p: CustomCellEditorProps<InvoiceRow, number> & { fmtHome?: (v: number) => string }) {
  const a = p.data?.action;
  const sooner = p.data ? p.data.daysToDue - (a?.kind === "early_pay_discount" ? a.withinDays : 0) : 0;
  const [picked, setPicked] = useState(false);
  useLayoutEffect(() => {
    if (picked) p.stopEditing();
  }, [picked, p]);
  if (a?.kind !== "early_pay_discount") return null;
  return (
    <div className={styles.percentEditor} role="group" aria-label={`Discount for ${p.data.number}`}>
      <span className={styles.muted}>
        Paid by {a.newDueDate}, {sooner} days sooner. Pick the discount (within the app&apos;s rule):
      </span>
      {a.percents.map((x) => (
        <button
          key={x}
          type="button"
          autoFocus={p.value === x} // keyboard focus moves into the editor when it opens
          aria-pressed={p.value === x}
          className={styles.chip}
          onClick={() => {
            p.onValueChange(x);
            setPicked(true);
          }}
        >
          {x}% off · costs {p.fmtHome ? p.fmtHome((p.data.value * x) / 100) : `${x}%`} · about {annualCostPct(x, sooner)}% a year
        </button>
      ))}
      <button type="button" className={styles.linkButton} onClick={() => p.stopEditing(true)}>
        Cancel
      </button>
    </div>
  );
}

const fmt = (ccy: string, v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, currencyDisplay: "code" }).format(v);

// The opened invoice: how this client has paid before, and what the agent proposes for it (approve just this one).
function DetailRow({
  r,
  lockReason,
  busy,
  clientUrl,
  autoFocus,
  onFocused,
  onApprove,
  onClose,
  onEscape,
  onUndo,
}: {
  r: InvoiceRow;
  lockReason?: string;
  busy: boolean;
  clientUrl?: string;
  autoFocus: boolean;
  onFocused: () => void;
  onApprove: () => void;
  onClose: () => void;
  onEscape: () => void;
  onUndo: () => void;
}) {
  const a = r.action;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    box.current?.querySelector<HTMLElement>("button:not([disabled]), a[href]")?.focus();
    onFocused();
  }, [autoFocus, onFocused]);
  // Keyboard inside the detail row is the browser's: Tab walks its buttons and link, Escape closes it and returns to the
  // invoice cell. A native listener, because React's handlers run at the root, after AG Grid has already taken the key
  // for cell navigation.
  const escape = useRef(onEscape);
  useEffect(() => {
    escape.current = onEscape;
  });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target === el) return;
      if (e.key === "Escape") {
        e.preventDefault();
        escape.current();
      }
      e.stopPropagation();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div
      ref={box}
      className={styles.gridDetail}
    >
      <div>
        <p>
          {r.number} · {r.client || "client"} ·{" "}
          {r.paidToday ? (
            <>
              <strong>{fmt(r.currency, r.paidAmount)}</strong> paid today
            </>
          ) : (
            <>
              <strong>{fmt(r.currency, r.amount)}</strong> still owed
            </>
          )}
          {clientUrl && (
            <>
              {" "}
              ·{" "}
              <a href={clientUrl} target="_blank" rel="noopener noreferrer" className={styles.link}>
                Open in PayPal as the client ↗
              </a>
            </>
          )}
        </p>
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
            <p>
              {a.label}
              {a.edited && (
                <>
                  {" "}
                  <span className={styles.gridEdited}>your edit — checked again on the server when you approve</span>{" "}
                  <button type="button" className={styles.linkButton} onClick={onUndo}>
                    Undo edit
                  </button>
                </>
              )}
            </p>
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
            {!a.edited && (a.kind === "reminder" || a.percents.length > 1) && (
              <p className={styles.muted}>
                Change it with ✎ in the Draft column{a.kind === "early_pay_discount" ? ` (allowed: ${a.percents.map((x) => `${x}%`).join(", ")})` : ""}.
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
