import { read, utils } from 'xlsx'

export interface SheetTable {
  name: string
  columns: string[]
  rows: string[][]
  /** Rows in the source before truncation. */
  totalRows: number
  truncated: boolean
}

/** Upper bound on rendered rows; larger uploads show the head plus a notice. */
export const MAX_SHEET_ROWS = 5000
/** Guard against pathological single-row pastes with thousands of columns. */
export const MAX_SHEET_COLS = 500
/** Refuse uploads larger than this before parsing. */
export const MAX_SHEET_BYTES = 10 * 1024 * 1024

const CANDIDATE_DELIMITERS = [',', '\t', ';', '|'] as const

function stripQuotedSpans(line: string): string {
  return line.replace(/"(?:[^"]|"")*"/g, '')
}

export function sniffDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 5)
  if (lines.length === 0) return ','
  let best = ','
  let bestScore = -1
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const counts = lines.map((line) => stripQuotedSpans(line).split(delimiter).length - 1)
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)]
    if (mode === 0) continue
    const score = counts.filter((count) => count === mode).length
    if (score > bestScore) {
      bestScore = score
      best = delimiter
    }
  }
  return best
}

/** RFC-4180-style parse: quoted fields may hold delimiters, quotes, and newlines. */
export function parseDelimited(text: string, delimiter?: string): string[][] {
  const sep = delimiter ?? sniffDelimiter(text)
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let quoted = false
  let i = 0
  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }
  while (i < text.length) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
        } else {
          quoted = false
          i++
        }
      } else {
        field += ch
        i++
      }
    } else if (ch === '"') {
      quoted = true
      i++
    } else if (ch === sep) {
      pushField()
      i++
    } else if (ch === '\r' || ch === '\n') {
      pushRow()
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1
    } else {
      field += ch
      i++
    }
  }
  pushRow()
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell === '')) rows.pop()
  return rows
}

function splitPipeRow(line: string): string[] | null {
  if (!line.includes('|')) return null
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
  return trimmed.split('|').map((cell) => cell.trim())
}

function isSeparatorRow(line: string): boolean {
  const cells = splitPipeRow(line)
  if (!cells || cells.length === 0) return false
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

/** Returns the grid when the text holds a pipe table, otherwise null. */
export function parseMarkdownTable(text: string): string[][] | null {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].includes('|') || !isSeparatorRow(lines[i + 1])) continue
    const header = splitPipeRow(lines[i])
    if (!header) continue
    const grid: string[][] = [header]
    for (let j = i + 2; j < lines.length; j++) {
      const row = splitPipeRow(lines[j])
      if (!row || row.every((cell) => cell === '')) break
      grid.push(row)
    }
    if (grid.length > 1) return grid
  }
  return null
}

/** One item per line becomes a single-column grid. */
export function parseList(text: string): string[][] {
  const items = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return items.map((item) => [item])
}

function toDisplayCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  return String(value)
}

/** First sheet wins; every cell becomes display text. */
export function parseWorkbook(bytes: ArrayBuffer): { name: string; grid: string[][] } {
  const workbook = read(bytes, { type: 'array', dense: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('The workbook has no sheets.')
  const sheet = workbook.Sheets[sheetName]
  const grid = utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false }) as string[][]
  return { name: sheetName, grid: grid.map((row) => row.map(toDisplayCell)) }
}

const SHEETS_ID_PATTERN = /\/spreadsheets\/d\/([A-Za-z0-9-_]+)/
const RAW_ID_PATTERN = /^[A-Za-z0-9-_]{20,}$/

export function extractSheetsId(input: string): string | null {
  const trimmed = input.trim()
  const fromUrl = SHEETS_ID_PATTERN.exec(trimmed)?.[1]
  if (fromUrl) return fromUrl
  if (RAW_ID_PATTERN.test(trimmed)) return trimmed
  return null
}

export function extractSheetsGid(input: string): string | null {
  const gid = /(?:[?#&]gid=|gid=)(\d+)/.exec(input)?.[1]
  return gid ?? null
}

export function sheetsGvizUrl(id: string, gid: string | null): string {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&headers=1${gid ? `&gid=${gid}` : ''}`
}

interface GvizCell {
  v?: unknown
  f?: string
}

interface GvizTableJson {
  cols: Array<{ label?: string }>
  rows: Array<{ c?: Array<GvizCell | null> | null }>
}

interface GvizPayload {
  status?: string
  errors?: Array<{ reason?: string; detailed_message?: string }>
  table?: GvizTableJson
}

function asGvizPayload(value: unknown): GvizPayload {
  if (typeof value !== 'object' || value === null) throw new Error('Google returned an unreadable response.')
  return value as GvizPayload
}

/** Unwraps `google.visualization.Query.setResponse({...})`, tolerating the `/*O_o*\/` prefix. */
export function parseGvizResponseText(text: string): GvizPayload {
  const match = /google\.visualization\.Query\.setResponse\(([\s\S]*)\)\s*;?\s*$/.exec(text.trim())
  if (!match) throw new Error('Google returned an unreadable response.')
  return asGvizPayload(JSON.parse(match[1]) as unknown)
}

function gvizCellToString(cell: GvizCell | null | undefined): string {
  if (!cell) return ''
  if (cell.f) return cell.f
  const value = cell.v
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    const date = /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/.exec(value)
    if (date) {
      const [, y, mo, d, h = '0', mi = '0', s = '0'] = date
      const pad = (n: string) => n.padStart(2, '0')
      const day = `${y}-${pad(String(Number(mo) + 1))}-${pad(d)}`
      return h === '0' && mi === '0' && s === '0' ? day : `${day} ${pad(h)}:${pad(mi)}:${pad(s)}`
    }
    return value
  }
  return String(value)
}

export function gvizToGrid(table: GvizTableJson): string[][] {
  const header = table.cols.map((col, i) => col.label?.trim() || `Column ${i + 1}`)
  return [header, ...table.rows.map((row) => table.cols.map((_, i) => gvizCellToString(row.c?.[i])))]
}

function gvizPayloadToGrid(payload: GvizPayload): string[][] {
  if (payload.status === 'error') {
    const reason = payload.errors?.[0]?.reason
    throw new Error(
      reason === 'access_denied' || reason === 'user_not_authenticated'
        ? 'Google refused access. Anyone-with-the-link sharing must be on.'
        : (payload.errors?.[0]?.detailed_message ?? 'Google rejected the sheet query.')
    )
  }
  if (!payload.table) throw new Error('Google returned an unreadable response.')
  return gvizToGrid(payload.table)
}

type GvizResponder = (payload: unknown) => void

/**
 * Browser-only import through a gviz JSONP script tag. Plain `fetch` cannot
 * read docs.google.com cross-origin (no CORS headers), while the script-tag
 * path is the one Google designed for browser use. No data is stored.
 */
export function loadSheetsJsonp(input: string, timeoutMs = 20000): Promise<SheetTable> {
  const id = extractSheetsId(input)
  if (!id) return Promise.reject(new Error('That does not look like a Google Sheets link or ID.'))
  const gid = extractSheetsGid(input)
  return new Promise((resolve, reject) => {
    const host = window as unknown as { google?: { visualization?: { Query?: { setResponse?: GvizResponder } } } }
    host.google ??= {}
    host.google.visualization ??= {}
    host.google.visualization.Query ??= {}
    const query = host.google.visualization.Query
    const prev = query.setResponse
    const script = document.createElement('script')
    const cleanup = () => {
      window.clearTimeout(timer)
      script.remove()
      query.setResponse = prev
    }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('Google did not respond. The link may be private or unreachable.'))
    }, timeoutMs)
    query.setResponse = (payload: unknown) => {
      cleanup()
      try {
        resolve(sheetTableFromGvizPayload(payload))
      } catch (failure) {
        reject(failure instanceof Error ? failure : new Error('Google returned an unreadable response.'))
      }
    }
    script.onerror = () => {
      cleanup()
      reject(new Error('Could not reach Google. Check your connection and the link.'))
    }
    script.src = sheetsGvizUrl(id, gid)
    document.head.appendChild(script)
  })
}

function fileStem(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  return base.replace(/\.[^.]+$/, '') || base
}

function normalizeGrid(name: string, grid: string[][]): SheetTable {
  const trimmed = grid.filter((row) => row.some((cell) => cell.trim() !== ''))
  const width = Math.min(MAX_SHEET_COLS, Math.max(0, ...trimmed.map((row) => row.length)))
  const padded = trimmed.map((row) => Array.from({ length: width }, (_, i) => (row[i] ?? '').trim()))
  const totalRows = Math.max(0, padded.length - 1)
  const truncated = totalRows > MAX_SHEET_ROWS
  const kept = truncated ? padded.slice(0, MAX_SHEET_ROWS + 1) : padded
  const [header = [], ...rows] = kept
  const columns = Array.from({ length: width }, (_, i) => header[i]?.trim() || `Column ${i + 1}`)
  return { name, columns, rows, totalRows, truncated }
}

/** Plain-text routing: pipe table first, then delimited grid, then line list. */
export function parseTextDocument(text: string, singleColumnHeader: string): SheetTable {
  const md = parseMarkdownTable(text)
  if (md) return normalizeGrid(singleColumnHeader, md)
  const grid = parseDelimited(text)
  const width = Math.max(0, ...grid.map((row) => row.length))
  if (width <= 1) {
    const items = parseList(text)
    if (items.length === 0) return { name: singleColumnHeader, columns: [], rows: [], totalRows: 0, truncated: false }
    return normalizeGrid(singleColumnHeader, [['Item'], ...items])
  }
  return normalizeGrid(singleColumnHeader, grid)
}

export async function loadSheetFile(file: File): Promise<SheetTable> {
  if (file.size > MAX_SHEET_BYTES) throw new Error(`"${file.name}" is over the 10 MB upload limit.`)
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const stem = fileStem(file.name)
  if (['xls', 'xlsx', 'xlsm', 'xlsb', 'ods'].includes(ext)) {
    const { name, grid } = parseWorkbook(await file.arrayBuffer())
    return normalizeGrid(`${stem} — ${name}`, grid)
  }
  if (['csv', 'tsv', 'txt', 'list', 'md', 'markdown', 'psv', 'ssv'].includes(ext) || ext === '') {
    return parseTextDocument(await file.text(), stem)
  }
  throw new Error(`".${ext}" files are not supported. Drop a CSV, TSV, Excel, Markdown table, or plain list.`)
}

export function sheetTableFromGvizPayload(payload: unknown): SheetTable {
  return normalizeGrid('Linked sheet', gvizPayloadToGrid(asGvizPayload(payload)))
}
