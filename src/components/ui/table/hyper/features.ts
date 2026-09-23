import { useCreateAtom } from '@octanejs/tanstack-store'
import {
  CellSelectionState,
  columnFacetingFeature,
  columnFilteringFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrHas,
  filterFn_includesString,
  filterFn_inDateRange,
  filterFn_inNumberRange,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_text,
  tableFeatures
} from '@octanejs/tanstack-table'
import { rankItem } from '@tanstack/match-sorter-utils'

export interface MyColumnMeta {
  label?: string
  variant?: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi-select'
  options?: Array<{ label: string; value: string; count?: number }>
  filterOptions?: Array<string | number | boolean>
  /** Maximum faceted options mounted at once. Search still covers all options. */
  filterOptionLimit?: number
}

const fuzzyFilterFn = (
  row: { getValue: (id: string) => unknown },
  columnId: string,
  value: unknown,
  addMeta?: (meta: object) => void
) => {
  const itemRank = rankItem(row.getValue(columnId), value as string)
  addMeta?.({ itemRank })
  return itemRank.passed
}

export const cellSelectionAtom = useCreateAtom<CellSelectionState>([])

export const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  columnFacetingFeature,
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  filteredRowModel: createFilteredRowModel(),
  filterFns: {
    arrHas: filterFn_arrHas,
    inDateRange: filterFn_inDateRange,
    inNumberRange: filterFn_inNumberRange,
    includesString: filterFn_includesString
  },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic, text: sortFn_text },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  columnResizingFeature
})
