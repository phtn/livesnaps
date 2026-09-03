// import { createTableHook, RowData } from '@octanejs/tanstack-table'
// import { dynamicFilterFn } from './data'
// import { features } from './Features'

// import { DataTablePagination } from './data/pagination'
// import { DataTableSortList } from './data/sort-list'
// import { DataTableViewOptions } from './data/view-options'
// import { DataTableFilterList } from './filter-list'

// import {
//   ActionsCell,
//   AgeCell,
//   DateCell,
//   DepartmentCell,
//   GroupedCell,
//   SelectCell,
//   StatusCell,
//   TextCell
// } from './data/cell-components'

// import { ColumnHeader } from './data/column-header'
// import { ResizeHandle, SelectAllHeader } from './data/header-components'

// export const { createAppColumnHelper, useAppTable, useTableContext, useCellContext, useHeaderContext } =
//   createTableHook({
//     features,
//     defaultColumn: {
//       size: 120,
//       minSize: 60,
//       maxSize: 800,
//       filterFn: dynamicFilterFn
//     },
//     globalFilterFn: 'fuzzy',
//     getRowId: (row: RowData & { id: string }) => row.id,
//     enableRowSelection: true,
//     columnResizeMode: 'onChange' as const,

//     tableComponents: {
//       Pagination: DataTablePagination,
//       FilterList: DataTableFilterList,
//       SortList: DataTableSortList,
//       ViewOptions: DataTableViewOptions
//     },

//     cellComponents: {
//       SelectCell,
//       TextCell,
//       AgeCell,
//       StatusCell,
//       DepartmentCell,
//       DateCell,
//       GroupedCell,
//       ActionsCell
//     },

//     headerComponents: {
//       ColumnHeader,
//       SelectAllHeader,
//       ResizeHandle
//     }
//   })
