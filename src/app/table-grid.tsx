"use client";
// A small read-only AG Grid for the tables that used to be plain HTML ("What the wait already did", the per-currency
// summary on /try). The server passes display text plus a number to sort by, since functions cannot cross from a
// server component; sorting, resizing, tooltips and CSV come from the grid. Same theme and modules as the other grids.

import { type ColDef, type GridApi } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo, useRef } from "react";
import { gridTheme } from "./grid-theme";
import styles from "./page.module.css";

import "./grid-modules";

export type TableCol = {
  field: string; // text shown in the cell
  header: string;
  sortBy?: string; // a numeric field to sort by instead of the text
  csvBy?: string; // a field to export instead of the text (plain numbers)
  right?: boolean;
  late?: string; // a boolean field: show the cell in the "late" colour
  minWidth?: number;
  flex?: number; // share of the free width (the date column took "(28 d…" at every width — blind review round 11)
  tooltip?: string;
};
export type TableRow = Record<string, string | number | boolean | null>;

export function TableGrid({
  rows,
  cols,
  label,
  csvName,
  highlightField,
}: {
  rows: TableRow[];
  cols: TableCol[];
  label: string;
  csvName?: string;
  highlightField?: string; // a boolean field: highlight the row (e.g. paid today)
}) {
  const api = useRef<GridApi<TableRow> | null>(null);
  const columns = useMemo<ColDef<TableRow>[]>(
    () =>
      cols.map((c) => ({
        field: c.field,
        headerName: c.header,
        headerTooltip: c.tooltip,
        minWidth: c.minWidth ?? 90,
        flex: c.flex ?? 1,
        type: c.right ? "rightAligned" : undefined,
        tooltipField: c.right ? undefined : c.field,
        ...(c.sortBy ? { comparator: (_a: unknown, _b: unknown, na, nb) => Number(na.data?.[c.sortBy!] ?? 0) - Number(nb.data?.[c.sortBy!] ?? 0) } : {}),
        ...(c.late ? { cellClassRules: { [styles.gridLate]: (p) => !!p.data?.[c.late!] } } : {}),
      })),
    [cols],
  );
  return (
    <div className={styles.gridWrap} role="region" aria-label={label}>
      {csvName && (
        <div className={styles.gridTools}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() =>
              api.current?.exportDataAsCsv({
                fileName: csvName,
                processCellCallback: (p) => {
                  const col = cols.find((c) => c.field === p.column.getColId());
                  return col?.csvBy ? (p.node?.data?.[col.csvBy] ?? "") : (p.value ?? "");
                },
              })
            }
          >
            Download CSV
          </button>
        </div>
      )}
      <AgGridReact<TableRow>
        theme={gridTheme}
        rowData={rows}
        columnDefs={columns}
        defaultColDef={{ sortable: true, resizable: true }}
        domLayout="autoHeight"
        autoSizeStrategy={{ type: "fitGridWidth" }}
        tooltipShowDelay={300}
        tabToNextCell={() => false}
        rowClassRules={highlightField ? { [styles.gridTodayRow]: (p) => !!p.data?.[highlightField] } : undefined}
        onGridReady={(e) => (api.current = e.api)}
      />
    </div>
  );
}
