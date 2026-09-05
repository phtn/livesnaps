export type TableExportFormat = 'csv' | 'pdf'

export type TableExportValue = string | number | boolean | bigint | Date | null | undefined

export interface TableExportColumn {
  header: string
  id: string
  width: number
}

export interface TableExportDocument {
  columns: TableExportColumn[]
  generatedAt: string
  rows: string[][]
  title: string
}

export interface TableExportOptions {
  fileName?: string
  title?: string
}

interface TableExportColumnDefinition<T> extends TableExportColumn {
  getValue: (row: T) => unknown
}

const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/
const FILE_EXTENSION = /\.(csv|pdf)$/i
const UNSAFE_FILE_CHARACTERS = /[^a-z0-9._-]+/gi

export const toExportText = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  if (typeof value === 'string') return value
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value)

  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

const escapeCsvCell = (value: string) => {
  const safeValue = CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value
  return `"${safeValue.replaceAll('"', '""')}"`
}

export const serializeTableExportCsv = ({ columns, rows }: TableExportDocument): string =>
  [columns.map(({ header }) => header), ...rows]
    .map((row) => row.map((value) => escapeCsvCell(value)).join(','))
    .join('\r\n')

export const createTableExportDocument = <T>({
  columns,
  generatedAt = new Date(),
  rows,
  title
}: {
  columns: TableExportColumnDefinition<T>[]
  generatedAt?: Date
  rows: T[]
  title: string
}): TableExportDocument => ({
  columns: columns.map(({ header, id, width }) => ({ header, id, width })),
  generatedAt: generatedAt.toISOString(),
  rows: rows.map((row) => columns.map((column) => toExportText(column.getValue(row)))),
  title
})

export const createTableExportFileName = (
  requestedName: string | undefined,
  format: TableExportFormat,
  generatedAt: string
) => {
  const rawStem = requestedName?.trim().replace(FILE_EXTENSION, '') || 'table-export'
  const safeStem = rawStem.replace(UNSAFE_FILE_CHARACTERS, '-').replace(/^-+|-+$/g, '') || 'table-export'
  const date = generatedAt.slice(0, 10)
  return `${safeStem}-${date}.${format}`
}

export const downloadTableExport = (contents: BlobPart, type: string, fileName: string) => {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
