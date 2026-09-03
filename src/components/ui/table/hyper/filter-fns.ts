import type { Row, RowData } from '@octanejs/tanstack-table'
import type { features } from './features'
import { getFilterMatchTokens, getFilterValueToken } from './filter-utils'

const normalizedTokensByRow = new WeakMap<object, Map<string, string[]>>()

interface ResolvedColumnFilter {
  kind: 'resolved-column-filter'
  text?: string
  tokens?: string[]
}

/**
 * Normalizes text for case-, whitespace-, and accent-insensitive matching.
 */
export const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

const getNormalizedRowTokens = <TData extends RowData>(row: Row<typeof features, TData>, columnId: string) => {
  let tokensByColumn = normalizedTokensByRow.get(row)
  if (!tokensByColumn) {
    tokensByColumn = new Map()
    normalizedTokensByRow.set(row, tokensByColumn)
  }

  let normalizedTokens = tokensByColumn.get(columnId)
  if (!normalizedTokens) {
    normalizedTokens = getFilterMatchTokens(row.getValue(columnId)).map(normalizeText)
    tokensByColumn.set(columnId, normalizedTokens)
  }

  return normalizedTokens
}

const resolveColumnFilterValue = (value: unknown): ResolvedColumnFilter => {
  if (Array.isArray(value)) {
    return {
      kind: 'resolved-column-filter',
      tokens: [...new Set(value.map((item) => normalizeText(getFilterValueToken(item))).filter(Boolean))]
    }
  }

  return {
    kind: 'resolved-column-filter',
    text: normalizeText(String(value ?? ''))
  }
}

const isResolvedColumnFilter = (value: unknown): value is ResolvedColumnFilter =>
  Boolean(value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'resolved-column-filter')

const filterImplementation = <TData extends RowData>(
  row: Row<typeof features, TData>,
  columnId: string,
  filterValue: unknown
): boolean => {
  const resolvedFilter = isResolvedColumnFilter(filterValue) ? filterValue : resolveColumnFilterValue(filterValue)
  const rowValue = row.getValue(columnId)

  if (rowValue === null || rowValue === undefined) {
    return (resolvedFilter.tokens?.length ?? 0) === 0 && !resolvedFilter.text
  }

  const rowTokens = getNormalizedRowTokens(row, columnId)
  if (resolvedFilter.tokens) {
    if (resolvedFilter.tokens.length === 0) return true
    return resolvedFilter.tokens.some((filterToken) =>
      rowTokens.some((rowToken) => rowToken === filterToken || rowToken.includes(filterToken))
    )
  }

  if (!resolvedFilter.text) return true
  return rowTokens.some((rowToken) => rowToken.includes(resolvedFilter.text ?? ''))
}

/**
 * The resolver runs once per filter update rather than once per scanned row.
 * Row tokens are cached by row identity and column.
 */
export const filterFn = Object.assign(filterImplementation, {
  resolveFilterValue: resolveColumnFilterValue,
  autoRemove: (value: unknown) => (Array.isArray(value) ? value.length === 0 : String(value ?? '').trim().length === 0)
})

export const multiSelectFilterFn = <TData extends RowData>(
  row: Row<typeof features, TData>,
  columnId: string,
  filterValue: (string | number | boolean)[]
): boolean => {
  if (!filterValue?.length) return true
  const rowValue = row.getValue(columnId)
  const rowTokens = getFilterMatchTokens(rowValue)

  return filterValue.some((value) => {
    const filterToken = getFilterValueToken(value)
    return rowTokens.includes(filterToken) || value === rowValue
  })
}

export const groupFilter = <TData extends RowData>(
  row: Row<typeof features, TData>,
  columnId: string,
  filterValue: unknown
): boolean => {
  const value = row.getValue(columnId)

  if (Array.isArray(filterValue)) {
    if (filterValue.length === 0) return true
    const rowTokens = getFilterMatchTokens(value)
    return filterValue.some((filterItem) => {
      const filterToken = getFilterValueToken(filterItem)
      return rowTokens.includes(filterToken) || filterItem === value
    })
  }

  if (filterValue === null || filterValue === undefined || filterValue === '') {
    return true
  }
  const filterToken = getFilterValueToken(filterValue)
  return value === filterValue || getFilterMatchTokens(value).includes(filterToken)
}

const globalFilterImplementation = <TData extends RowData>(
  row: Row<typeof features, TData>,
  columnId: string,
  filterValue: string
): boolean => {
  if (!filterValue) return true
  const value = row.getValue(columnId)
  if (value === null || value === undefined) return false

  return getNormalizedRowTokens(row, columnId).some((token) => token.includes(filterValue))
}

/**
 * TanStack resolves the global query once before scanning rows.
 */
export const globalFilterFn = Object.assign(globalFilterImplementation, {
  resolveFilterValue: (value: unknown) => normalizeText(String(value ?? '')),
  autoRemove: (value: unknown) => String(value ?? '').trim().length === 0
})
