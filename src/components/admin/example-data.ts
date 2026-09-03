export const SEED_ROW_COUNTS = [50_000, 100_000, 250_000, 500_000, 1_000_000] as const
export type SeedRowCount = (typeof SEED_ROW_COUNTS)[number]

export const ROW_COUNT: SeedRowCount = 50_000
export const STREAM_ROW_COUNT = 12_000
const SEED_CHUNK_SIZE = 5_000
const ANALYTICS_CHUNK_SIZE = 10_000
const EXPLORER_FILTER_CHUNK_SIZE = 10_000
const EXPLORER_SORT_YIELD_SIZE = 100_000
const EXPLORER_CACHE_LIMIT = 3

export const regions = [
  'North America',
  'Latin America',
  'Europe',
  'Middle East',
  'Africa',
  'South Asia',
  'Southeast Asia',
  'Oceania'
] as const

export const industries = [
  'Fintech',
  'Health',
  'Commerce',
  'Logistics',
  'Climate',
  'Security',
  'Media',
  'Developer tools'
] as const

export const plans = ['Core', 'Scale', 'Pro', 'Enterprise'] as const
export const statuses = ['Healthy', 'Watching', 'At risk', 'Onboarding'] as const

export type Region = (typeof regions)[number]
export type Industry = (typeof industries)[number]
export type Plan = (typeof plans)[number]
export type AccountStatus = (typeof statuses)[number]

export interface PerformanceRow {
  id: string
  account: string
  contact: string
  email: string
  region: string
  industry: Industry
  plan: Plan
  status: AccountStatus
  revenue: number
  seats: number
  health: number
  latency: number
  events: number
  updatedAt: number
}

export interface AnalyticsRow {
  accounts: number
  healthTotal: number
  id: string
  industry: Industry
  region: Region
  revenue: number
  seats: number
}

export interface SeedProgress {
  completed: number
  elapsedMs: number
  phase: 'loading' | 'seeding'
  total: number
}

interface ProgressOptions<TProgress> {
  onProgress?: (progress: TProgress) => void
  signal?: AbortSignal
}

interface SeedRowsOptions extends ProgressOptions<SeedProgress> {
  rowCount?: SeedRowCount
}

export interface AnalyticsProgress {
  completed: number
  elapsedMs: number
  phase: 'indexing'
  total: number
}

type AnalyticsRowsOptions = ProgressOptions<AnalyticsProgress>

export interface SeedRowsResult {
  elapsedMs: number
  rows: PerformanceRow[]
}

export interface AnalyticsRowsResult {
  elapsedMs: number
  rows: AnalyticsRow[]
  sourceRowCount: number
}

export interface ExplorerSort {
  desc: boolean
  id: string
}

export interface ExplorerColumnFilter {
  id: string
  value: unknown
}

export interface ExplorerProgress {
  completed: number
  elapsedMs: number
  matched: number
  phase: 'filtering' | 'sorting'
  total: number
}

export interface ExplorerRowsResult {
  elapsedMs: number
  rows: PerformanceRow[]
}

interface ExplorerRowsOptions extends ProgressOptions<ExplorerProgress> {
  filters?: ReadonlyArray<ExplorerColumnFilter>
  query?: string
  sorting?: ReadonlyArray<ExplorerSort>
}

interface AnalyticsAccumulator {
  accounts: number
  healthTotal: number
  industry: Industry
  region: string
  revenue: number
  seats: number
}

interface ExplorerTask {
  controller: AbortController
  key: string
  latestProgress: ExplorerProgress | null
  listeners: Set<(progress: ExplorerProgress) => void>
  source: ReadonlyArray<PerformanceRow>
  task: Promise<ExplorerRowsResult>
}

interface YieldingScheduler {
  yield?: () => Promise<void>
}

const yieldToMain = () => {
  const scheduler = (globalThis as { scheduler?: YieldingScheduler }).scheduler
  if (scheduler?.yield !== undefined) return scheduler.yield()

  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0))
}

const assertNotAborted = (signal?: AbortSignal) => {
  if (signal?.aborted === true) {
    throw new DOMException('The operation was cancelled.', 'AbortError')
  }
}

let seedCache: SeedRowsResult | null = null
let seedTask: { rowCount: SeedRowCount; task: Promise<SeedRowsResult> } | null = null
let latestSeedProgress: SeedProgress | null = null
const seedProgressListeners = new Set<(progress: SeedProgress) => void>()

const publishSeedProgress = (progress: SeedProgress) => {
  latestSeedProgress = progress
  for (const listener of seedProgressListeners) listener(progress)
}

const runSeed = async (rowCount: SeedRowCount): Promise<SeedRowsResult> => {
  const startedAt = performance.now()
  publishSeedProgress({ completed: 0, elapsedMs: 0, phase: 'loading', total: rowCount })

  const { faker } = await import('@faker-js/faker/locale/en_US')

  faker.seed(24_082_026)
  faker.setDefaultRefDate('2026-08-25T12:00:00.000Z')

  const rows = new Array<PerformanceRow>(rowCount)

  for (let chunkStart = 0; chunkStart < rowCount; chunkStart += SEED_CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + SEED_CHUNK_SIZE, rowCount)

    for (let index = chunkStart; index < chunkEnd; index += 1) {
      const firstName = faker.person.firstName()
      const lastName = faker.person.lastName()

      rows[index] = {
        id: `AC-${String(index + 1).padStart(6, '0')}`,
        account: faker.company.name(),
        contact: `${firstName} ${lastName}`,
        email: faker.internet.email({ firstName, lastName, provider: 'example.dev' }).toLowerCase(),
        region: faker.location.continent(),
        industry: faker.helpers.arrayElement(industries),
        plan: faker.helpers.arrayElement(plans),
        status: faker.helpers.arrayElement(statuses),
        revenue: faker.number.int({ min: 1_200, max: 240_000 }),
        seats: faker.number.int({ min: 3, max: 900 }),
        health: faker.number.int({ min: 38, max: 100 }),
        latency: faker.number.int({ min: 18, max: 680 }),
        events: faker.number.int({ min: 300, max: 48_000 }),
        updatedAt: faker.date.recent({ days: 30 }).getTime()
      }
    }

    publishSeedProgress({
      completed: chunkEnd,
      elapsedMs: performance.now() - startedAt,
      phase: 'seeding',
      total: rowCount
    })

    if (chunkEnd < rowCount) await yieldToMain()
  }

  return { elapsedMs: performance.now() - startedAt, rows }
}

export const seedPerformanceRows = async ({
  onProgress,
  rowCount = ROW_COUNT,
  signal
}: SeedRowsOptions = {}): Promise<SeedRowsResult> => {
  assertNotAborted(signal)

  if (seedCache !== null && seedCache.rows.length >= rowCount) {
    return seedCache.rows.length === rowCount ? seedCache : { elapsedMs: 0, rows: seedCache.rows.slice(0, rowCount) }
  }

  if (seedTask !== null && seedTask.rowCount !== rowCount) {
    try {
      await seedTask.task
    } catch {
      // A failed task for another count should not prevent this request.
    }
    assertNotAborted(signal)
    return seedPerformanceRows({ onProgress, rowCount, signal })
  }

  const listener =
    onProgress === undefined
      ? undefined
      : (progress: SeedProgress) => {
          if (signal?.aborted !== true) onProgress(progress)
        }

  if (listener !== undefined) {
    seedProgressListeners.add(listener)
    if (latestSeedProgress !== null) listener(latestSeedProgress)
  }

  const removeListener = () => {
    if (listener !== undefined) seedProgressListeners.delete(listener)
  }
  signal?.addEventListener('abort', removeListener, { once: true })

  if (seedTask === null) {
    const task = runSeed(rowCount)
      .then((result) => {
        if (seedCache === null || result.rows.length > seedCache.rows.length) seedCache = result
        return result
      })
      .catch((error: unknown) => {
        throw error
      })
      .finally(() => {
        if (seedTask?.task === task) {
          seedTask = null
          latestSeedProgress = null
        }
      })

    seedTask = { rowCount, task }
  }

  try {
    const result = await seedTask.task
    assertNotAborted(signal)
    return result
  } finally {
    removeListener()
    signal?.removeEventListener('abort', removeListener)
  }
}

let analyticsCache: { source: ReadonlyArray<PerformanceRow>; result: AnalyticsRowsResult } | null = null
let analyticsTask: { source: ReadonlyArray<PerformanceRow>; task: Promise<AnalyticsRowsResult> } | null = null
let latestAnalyticsProgress: AnalyticsProgress | null = null
const analyticsProgressListeners = new Set<(progress: AnalyticsProgress) => void>()

const publishAnalyticsProgress = (progress: AnalyticsProgress) => {
  latestAnalyticsProgress = progress
  for (const listener of analyticsProgressListeners) listener(progress)
}

const runAnalyticsIndex = async (source: ReadonlyArray<PerformanceRow>): Promise<AnalyticsRowsResult> => {
  const startedAt = performance.now()
  const buckets = new Map<string, AnalyticsAccumulator>()

  for (let chunkStart = 0; chunkStart < source.length; chunkStart += ANALYTICS_CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + ANALYTICS_CHUNK_SIZE, source.length)

    for (let index = chunkStart; index < chunkEnd; index += 1) {
      const row = source[index]
      const key = `${row.region}\u0000${row.industry}`
      const existing = buckets.get(key)

      if (existing === undefined) {
        buckets.set(key, {
          accounts: 1,
          healthTotal: row.health,
          industry: row.industry,
          region: row.region,
          revenue: row.revenue,
          seats: row.seats
        })
      } else {
        existing.accounts += 1
        existing.healthTotal += row.health
        existing.revenue += row.revenue
        existing.seats += row.seats
      }
    }

    publishAnalyticsProgress({
      completed: chunkEnd,
      elapsedMs: performance.now() - startedAt,
      phase: 'indexing',
      total: source.length
    })

    if (chunkEnd < source.length) await yieldToMain()
  }

  const rows = Array.from(buckets.values(), (bucket): AnalyticsRow => ({
    accounts: bucket.accounts,
    healthTotal: bucket.healthTotal,
    id: `${bucket.region}:${bucket.industry}`,
    industry: bucket.industry,
    region: bucket.region as Region,
    revenue: bucket.revenue,
    seats: bucket.seats
  }))

  return {
    elapsedMs: performance.now() - startedAt,
    rows,
    sourceRowCount: source.length
  }
}

export const prepareAnalyticsRows = async (
  source: ReadonlyArray<PerformanceRow>,
  { onProgress, signal }: AnalyticsRowsOptions = {}
): Promise<AnalyticsRowsResult> => {
  assertNotAborted(signal)

  if (analyticsCache?.source === source) {
    return analyticsCache.result
  }

  if (analyticsTask?.source !== source) {
    latestAnalyticsProgress = null
    analyticsTask = {
      source,
      task: runAnalyticsIndex(source)
        .then((result) => {
          analyticsCache = { result, source }
          return result
        })
        .catch((error: unknown) => {
          analyticsTask = null
          latestAnalyticsProgress = null
          throw error
        })
    }
  }

  const listener =
    onProgress === undefined
      ? undefined
      : (progress: AnalyticsProgress) => {
          if (signal?.aborted !== true) onProgress(progress)
        }

  if (listener !== undefined) {
    analyticsProgressListeners.add(listener)
    if (latestAnalyticsProgress !== null) listener(latestAnalyticsProgress)
  }

  const removeListener = () => {
    if (listener !== undefined) analyticsProgressListeners.delete(listener)
  }
  signal?.addEventListener('abort', removeListener, { once: true })

  try {
    const result = await analyticsTask.task
    assertNotAborted(signal)
    return result
  } finally {
    removeListener()
    signal?.removeEventListener('abort', removeListener)
  }
}

const explorerCaches = new WeakMap<ReadonlyArray<PerformanceRow>, Map<string, ExplorerRowsResult>>()
let explorerTask: ExplorerTask | null = null

const normalizeExplorerQuery = (query: string) => query.trim().toLocaleLowerCase()

const getExplorerKey = (
  query: string,
  sorting: ReadonlyArray<ExplorerSort>,
  filters: ReadonlyArray<ExplorerColumnFilter>
) => {
  const filterKey = [...filters]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((filter) => `${filter.id}:${JSON.stringify(filter.value)}`)
    .join(',')

  return `${normalizeExplorerQuery(query)}\u0000${sorting.map((sort) => `${sort.id}:${sort.desc ? 'desc' : 'asc'}`).join(',')}\u0000${filterKey}`
}

const matchesExplorerQuery = (row: PerformanceRow, query: string) => {
  if (query.length === 0) return true

  return (
    row.account.toLocaleLowerCase().includes(query) ||
    row.contact.toLocaleLowerCase().includes(query) ||
    row.email.toLocaleLowerCase().includes(query) ||
    row.region.toLocaleLowerCase().includes(query) ||
    row.plan.toLocaleLowerCase().includes(query) ||
    row.status.toLocaleLowerCase().includes(query) ||
    String(row.revenue).includes(query) ||
    String(row.health).includes(query)
  )
}

const getExplorerRange = (value: unknown): readonly [unknown, unknown] =>
  Array.isArray(value) ? [value[0], value[1]] : [undefined, undefined]

const getExplorerNumberBound = (value: unknown) => {
  if (value === undefined || value === null || String(value).trim() === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

const getExplorerDateBound = (value: unknown, endOfDay: boolean) => {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const timestamp = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

export const matchesExplorerColumnFilters = (row: PerformanceRow, filters: ReadonlyArray<ExplorerColumnFilter>) => {
  for (const filter of filters) {
    if (filter.id === 'region' || filter.id === 'status') {
      const selected = Array.isArray(filter.value) ? filter.value.map(String) : []
      if (selected.length > 0 && !selected.includes(String(row[filter.id]))) return false
      continue
    }

    if (filter.id === 'revenue' || filter.id === 'health') {
      const [rawMinimum, rawMaximum] = getExplorerRange(filter.value)
      const minimum = getExplorerNumberBound(rawMinimum)
      const maximum = getExplorerNumberBound(rawMaximum)
      const value = row[filter.id]
      if (minimum !== undefined && value < minimum) return false
      if (maximum !== undefined && value > maximum) return false
      continue
    }

    if (filter.id === 'updatedAt') {
      const [rawFrom, rawTo] = getExplorerRange(filter.value)
      const from = getExplorerDateBound(rawFrom, false)
      const to = getExplorerDateBound(rawTo, true)
      if (from !== undefined && row.updatedAt < from) return false
      if (to !== undefined && row.updatedAt > to) return false
    }
  }

  return true
}

const getExplorerSortValue = (row: PerformanceRow, id: string): string | number => {
  switch (id) {
    case 'account':
      return row.account
    case 'contact':
      return row.contact
    case 'email':
      return row.email
    case 'region':
      return row.region
    case 'plan':
      return row.plan
    case 'status':
      return row.status
    case 'revenue':
      return row.revenue
    case 'health':
      return row.health
    case 'updatedAt':
      return row.updatedAt
    default:
      return row.id
  }
}

const compareExplorerRows = (left: PerformanceRow, right: PerformanceRow, sorting: ReadonlyArray<ExplorerSort>) => {
  for (const sort of sorting) {
    const leftValue = getExplorerSortValue(left, sort.id)
    const rightValue = getExplorerSortValue(right, sort.id)
    const comparison = leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1

    if (comparison !== 0) return sort.desc ? -comparison : comparison
  }

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

const sortExplorerRows = async (
  input: PerformanceRow[],
  sorting: ReadonlyArray<ExplorerSort>,
  startedAt: number,
  signal: AbortSignal,
  publish: (progress: ExplorerProgress) => void
) => {
  if (sorting.length === 0 || input.length < 2) return input

  const passCount = Math.ceil(Math.log2(input.length))
  const total = input.length * passCount
  let completed = 0
  let completedAtLastYield = 0
  let source = input
  let target = new Array<PerformanceRow>(input.length)

  for (let width = 1; width < input.length; width *= 2) {
    for (let left = 0; left < input.length; left += width * 2) {
      const middle = Math.min(left + width, input.length)
      const right = Math.min(left + width * 2, input.length)
      let leftIndex = left
      let rightIndex = middle

      for (let outputIndex = left; outputIndex < right; outputIndex += 1) {
        if (
          leftIndex < middle &&
          (rightIndex >= right || compareExplorerRows(source[leftIndex], source[rightIndex], sorting) <= 0)
        ) {
          target[outputIndex] = source[leftIndex]
          leftIndex += 1
        } else {
          target[outputIndex] = source[rightIndex]
          rightIndex += 1
        }

        completed += 1
      }

      if (completed - completedAtLastYield >= EXPLORER_SORT_YIELD_SIZE) {
        publish({
          completed,
          elapsedMs: performance.now() - startedAt,
          matched: input.length,
          phase: 'sorting',
          total
        })
        completedAtLastYield = completed
        assertNotAborted(signal)
        await yieldToMain()
      }
    }

    const previousSource = source
    source = target
    target = previousSource
  }

  publish({
    completed: total,
    elapsedMs: performance.now() - startedAt,
    matched: input.length,
    phase: 'sorting',
    total
  })

  return source
}

const runExplorerQuery = async (
  source: ReadonlyArray<PerformanceRow>,
  query: string,
  sorting: ReadonlyArray<ExplorerSort>,
  filters: ReadonlyArray<ExplorerColumnFilter>,
  signal: AbortSignal,
  publish: (progress: ExplorerProgress) => void
): Promise<ExplorerRowsResult> => {
  const startedAt = performance.now()
  const normalizedQuery = normalizeExplorerQuery(query)
  const filteredRows: PerformanceRow[] = []

  for (let chunkStart = 0; chunkStart < source.length; chunkStart += EXPLORER_FILTER_CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + EXPLORER_FILTER_CHUNK_SIZE, source.length)

    for (let index = chunkStart; index < chunkEnd; index += 1) {
      const row = source[index]
      if (matchesExplorerQuery(row, normalizedQuery) && matchesExplorerColumnFilters(row, filters)) {
        filteredRows.push(row)
      }
    }

    publish({
      completed: chunkEnd,
      elapsedMs: performance.now() - startedAt,
      matched: filteredRows.length,
      phase: 'filtering',
      total: source.length
    })

    assertNotAborted(signal)
    if (chunkEnd < source.length) await yieldToMain()
  }

  const orderedRows = await sortExplorerRows(filteredRows, sorting, startedAt, signal, publish)

  return {
    elapsedMs: performance.now() - startedAt,
    rows: orderedRows
  }
}

const getCachedExplorerRows = (source: ReadonlyArray<PerformanceRow>, key: string) => {
  const cache = explorerCaches.get(source)
  const result = cache?.get(key)

  if (cache !== undefined && result !== undefined) {
    cache.delete(key)
    cache.set(key, result)
  }

  return result
}

const cacheExplorerRows = (source: ReadonlyArray<PerformanceRow>, key: string, result: ExplorerRowsResult) => {
  const cache = explorerCaches.get(source) ?? new Map<string, ExplorerRowsResult>()
  cache.delete(key)
  cache.set(key, result)

  while (cache.size > EXPLORER_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }

  explorerCaches.set(source, cache)
}

const createExplorerTask = (
  source: ReadonlyArray<PerformanceRow>,
  key: string,
  query: string,
  sorting: ReadonlyArray<ExplorerSort>,
  filters: ReadonlyArray<ExplorerColumnFilter>
) => {
  const controller = new AbortController()
  const listeners = new Set<(progress: ExplorerProgress) => void>()
  let record: ExplorerTask

  const task = Promise.resolve()
    .then(() =>
      runExplorerQuery(source, query, sorting, filters, controller.signal, (progress) => {
        record.latestProgress = progress
        for (const listener of listeners) listener(progress)
      })
    )
    .then((result) => {
      cacheExplorerRows(source, key, result)
      return result
    })
    .catch((error: unknown) => {
      if (explorerTask === record) explorerTask = null
      throw error
    })

  record = {
    controller,
    key,
    latestProgress: null,
    listeners,
    source,
    task
  }

  return record
}

export const prepareExplorerRows = async (
  source: ReadonlyArray<PerformanceRow>,
  { filters = [], onProgress, query = '', signal, sorting = [{ id: 'revenue', desc: true }] }: ExplorerRowsOptions = {}
): Promise<ExplorerRowsResult> => {
  assertNotAborted(signal)

  const key = getExplorerKey(query, sorting, filters)
  const cachedResult = getCachedExplorerRows(source, key)
  if (cachedResult !== undefined) return cachedResult

  if (explorerTask?.source !== source || explorerTask.key !== key) {
    explorerTask?.controller.abort()
    explorerTask = createExplorerTask(source, key, query, sorting, filters)
  }

  const activeTask = explorerTask
  const listener =
    onProgress === undefined
      ? undefined
      : (progress: ExplorerProgress) => {
          if (signal?.aborted !== true) onProgress(progress)
        }

  if (listener !== undefined) {
    activeTask.listeners.add(listener)
    if (activeTask.latestProgress !== null) listener(activeTask.latestProgress)
  }

  const removeListener = () => {
    if (listener !== undefined) activeTask.listeners.delete(listener)
  }
  signal?.addEventListener('abort', removeListener, { once: true })

  try {
    const result = await activeTask.task
    assertNotAborted(signal)
    return result
  } finally {
    removeListener()
    signal?.removeEventListener('abort', removeListener)
  }
}

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value)

export const formatCompact = (value: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)

export const formatRelativeTime = (timestamp: number) => {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000))
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  return `${Math.round(hours / 24)}d ago`
}
