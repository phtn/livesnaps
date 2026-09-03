import type {
  BuiltInFilterFn,
  Column,
  ColumnFilter,
  ColumnFiltersState,
  PaginationState,
  RowData,
  SortingState,
  TableFeatures
} from '@octanejs/tanstack-table'
import { features } from './hyper/features'

export type TableFilterFeatures<TFeatures extends TableFeatures> = Pick<
  TFeatures,
  'columnFilteringFeature' | 'columnFacetingFeature'
>

export type FilterOperator =
  | BuiltInFilterFn
  | 'notIncludesString'
  | 'notEqualsString'
  | 'notEquals'
  | 'greaterThan'
  | 'notGreaterThan'
  | 'greaterThanOrEqualTo'
  | 'notGreaterThanOrEqualTo'
  | 'lessThan'
  | 'notLessThan'
  | 'lessThanOrEqualTo'
  | 'notLessThanOrEqualTo'
  | 'isRelativeToToday'
  | 'inRange'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'

export type JoinOperator = 'and' | 'or'

export interface ExtendedColumnFilter extends ColumnFilter {
  filterId?: string
  operator?: FilterOperator
  joinOperator?: JoinOperator
}

export interface TableToolbarContext<T> {
  getFilteredData: () => T[]
}

export interface BulkUpdateSelectionArgs<T extends RowData> {
  ids: string[]
  rows: T[]
  updates: Partial<T>
}

export interface RowReorderArgs<T extends RowData> {
  fromIndex: number
  movedRow: T
  rows: T[]
  toIndex: number
}

export interface DataTableQueryState {
  columnFilters: ColumnFiltersState
  globalFilter: string
  pagination: PaginationState
  sorting: SortingState
}

export interface DataTableFilterListProps<T extends RowData> {
  columns: Column<typeof features, T, unknown>[]
  columnFilters: ColumnFiltersState
  onReset: () => void
}

export type RowIdAccessor<T extends RowData> = keyof T | ((row: T, index: number) => string | number | null | undefined)
