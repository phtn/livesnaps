import type { Renderable, SortingState } from '@octanejs/tanstack-table'

/**
 * The structural contract `HyperTable` requires of a table, its headers and its
 * columns — only the surface it actually reads.
 *
 * Structural rather than `Table<TFeatures, …>` because of how TanStack v9 types
 * features: `ExtractFeatureMapTypes<any, …>` expands to *every* feature, so
 * `Table<any, any>` is the MAXIMAL table, not a permissive one. A table built
 * from a feature subset is missing ~34 of its members and will not assign. The
 * same trap applies to `Header<any, …>` and `Column<any, …>`.
 *
 * Declaring the surface instead means any feature set that provides it fits, and
 * one that does not is rejected for the right reason. `HyperTable` needs column
 * visibility, sizing, resizing and row sorting; a table without them genuinely
 * cannot be rendered here. This mirrors `ColumnLike`/`SizedColumnLike` in
 * `column-pinning.ts`, which exist for the same reason.
 */
export interface HyperColumn {
  id: string
  columnDef: { header?: Renderable<any>; maxSize?: number; minSize?: number; size?: number }
  getCanHide: () => boolean
  getCanResize: () => boolean
  getCanSort: () => boolean
  getIsResizing: () => boolean
  getLeafColumns: () => HyperColumn[]
  getSize: () => number
  resetSize: () => void
  toggleSorting: (desc?: boolean, isMulti?: boolean) => void
}

/** A header as `HyperTable` and `ColumnSort` read it. */
export interface HyperHeader {
  colSpan: number
  column: HyperColumn
  isPlaceholder: boolean
  getContext: () => object
  getResizeHandler: () => (event: unknown) => void
  getSize: () => number
}

/** The table itself, as `HyperTable` reads it. */
export interface HyperTableModel {
  getAllLeafColumns: () => HyperColumn[]
  getHeaderGroups: () => Array<{ headers: HyperHeader[] }>
  state: {
    /** Only ever used as a memo input, so its shape does not matter here. */
    columnSizing: unknown
    sorting: SortingState
  }
}

/**
 * A cell as `HyperCell` reads it.
 *
 * `getIsAggregated`/`getIsPlaceholder` and `columnDef.aggregatedCell` are
 * optional because `columnGroupingFeature` is optional — the same probe the
 * library's own `FlexRender` does rather than requiring the feature.
 */
export interface HyperCellModel {
  id: string
  column: {
    id: string
    columnDef: { cell?: Renderable<any>; aggregatedCell?: Renderable<any> }
    getCanHide?: () => boolean
  }
  getContext: () => object
  getIsAggregated?: () => boolean
  getIsPlaceholder?: () => boolean
}

/** A row as `HyperRow` reads it. */
export interface HyperRowModel {
  id: string
  getAllCells: () => HyperCellModel[]
  getCanSelect: () => boolean
  getIsSelected: () => boolean
  getToggleSelectedHandler: () => (event: unknown) => void
  toggleSelected: () => void
}
