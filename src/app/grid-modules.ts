// The AG Grid Community modules this app uses, registered once for all three grids (invoice grid, exposure heatmap,
// the /try list) instead of AllCommunityModule: a page downloads only the features it shows, and the list doubles as
// documentation of what the grids rely on.

import {
  CellApiModule,
  CellStyleModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColumnAutoSizeModule,
  CsvExportModule,
  CustomEditorModule,
  ExternalFilterModule,
  HighlightChangesModule,
  ModuleRegistry,
  NumberFilterModule,
  PaginationModule,
  PinnedRowModule,
  QuickFilterModule,
  RowApiModule,
  RowAutoHeightModule,
  RowSelectionModule,
  RowStyleModule,
  TextEditorModule,
  TextFilterModule,
  TooltipModule,
  ValidationModule,
} from "ag-grid-community";

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ClientSideRowModelApiModule, // forEachNodeAfterFilter: totals follow the filter
  RowApiModule, // getRowNode: back to the invoice cell after a detail row closes
  CellApiModule,
  RowSelectionModule, // checkboxes on rows with a proposal → "Approve selected"
  CsvExportModule,
  QuickFilterModule, // search, with a custom parser
  ExternalFilterModule, // the quick views and the heatmap link
  TextFilterModule, // /try column filters
  NumberFilterModule,
  PaginationModule, // /try over 25 lines
  CellStyleModule, // cellClassRules, heat levels
  RowStyleModule, // rowClassRules: paid today, unread lines
  TooltipModule,
  CustomEditorModule, // the e-mail and discount editors
  TextEditorModule, // AG Grid's default editor, which it loads with any editable column
  PinnedRowModule, // the total row
  HighlightChangesModule, // cell flash when PayPal reports a change
  RowAutoHeightModule, // wrapped text on /try
  ColumnAutoSizeModule, // fitGridWidth
  ...(process.env.NODE_ENV === "production" ? [] : [ValidationModule]),
]);
