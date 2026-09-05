import type { IconName } from '@/lib/icons'
import type { AdminSnapListItem } from '@/lib/snaps/admin-photo-types'
import { VERIFICATION_ENTRY_STATUS_VALUES } from '@/lib/verifications/entries'
import type { UserIdentity } from '../../../convex/users/v'
import type { VerificationEntry } from '../../../convex/verificationEntries/d'

export const SEED_ROW_COUNTS = [50_000, 100_000, 250_000, 500_000, 1_000_000] as const
export type SeedRowCount = (typeof SEED_ROW_COUNTS)[number]

export const ROW_COUNT: SeedRowCount = 50_000
export const STREAM_ROW_COUNT = 12_000
const SEED_CHUNK_SIZE = 5_000
const ANALYTICS_CHUNK_SIZE = 10_000
const EXPLORER_FILTER_CHUNK_SIZE = 10_000
const EXPLORER_SORT_YIELD_SIZE = 100_000
const EXPLORER_CACHE_LIMIT = 3

/** Applicants submit repeatedly, so the user pool is far smaller than the snap count. */
const SNAPS_PER_USER = 8

/* Row shapes are derived from the Convex tables so schema drift breaks the build. */

/**
 * A flat projection of a `snaps` document, matching what `snaps.q.listForAdmin`
 * returns. The nested `photos`, `location`, and `location_session` objects are
 * reduced to `photoCount` plus the scalars the admin table actually reads:
 * synthesizing them in full would cost more memory than a million-row seed can
 * afford, and nothing here renders them.
 */
export type SnapRow = Pick<
  AdminSnapListItem,
  | '_id'
  | 'bestAccuracyMeters'
  | 'countryCode'
  | 'countryCodeMatchesIpinfo'
  | 'createdAt'
  | 'email'
  | 'firebaseUid'
  | 'fullName'
  | 'handler'
  | 'locationLabel'
  | 'make'
  | 'mileage'
  | 'model'
  | 'phone'
  | 'plateNumber'
  | 'status'
  | 'updatedAt'
  | 'uploadId'
  | 'verification_status'
  | 'year'
> & {
  /** Projection of `metadata.photos.length`. */
  photoCount: number
}

/** A `users` document. `UserIdentity` is that table's own validator type. */
export type UserRow = UserIdentity & { _id: string }

/** A `verificationEntries` document. */
export type VerificationEntryRow = VerificationEntry & { _id: string }

export type SnapSessionStatus = SnapRow['status']
export type SnapVerificationStatus = NonNullable<SnapRow['verification_status']>
export type VerificationEntryStatus = VerificationEntryRow['status']

// `satisfies` ties each list to the Convex union: add or rename a status in the
// schema and this file stops compiling rather than silently seeding a dead value.
export const snapSessionStatuses = [
  'active',
  'abandoned',
  'completed',
  'cancelled',
  'invalidated'
] as const satisfies ReadonlyArray<SnapSessionStatus>

export const snapVerificationStatuses = ['draft', 'submitted'] as const satisfies ReadonlyArray<SnapVerificationStatus>

export const verificationEntryStatuses =
  VERIFICATION_ENTRY_STATUS_VALUES satisfies ReadonlyArray<VerificationEntryStatus>

export const countryCodes = ['PH', 'US', 'CA', 'GB', 'AU', 'SG', 'JP', 'AE'] as const
export const vehicleMakes = ['Toyota', 'Honda', 'Mitsubishi', 'Nissan', 'Hyundai', 'Ford', 'Isuzu', 'Suzuki'] as const

export type CountryCode = (typeof countryCodes)[number]
export type VehicleMake = (typeof vehicleMakes)[number]

/**
 * Presentation for the `countryCodeMatchesIpinfo` badge. Keyed by the tokens
 * `toIpcMatchToken` (in `snap-columns.ts`) emits, not the underlying
 * `boolean | null` — importing that helper here would create a circular
 * import, so the key union is restated instead.
 */
export const snapIpcMatchStatus: Record<
  'match' | 'mismatch' | 'unknown',
  { className: string; icon: IconName; label: string }
> = {
  match: {
    className: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300',
    icon: 'circle-check',
    label: 'Verified'
  },
  mismatch: {
    className: 'border-rose-500/25 bg-rose-500/8 text-rose-700 dark:text-rose-300',
    icon: 'alert-triangle',
    label: 'Mismatch'
  },
  unknown: {
    className: 'border-slate-500/30 bg-slate-500/8 text-slate-700 dark:text-slate-300',
    icon: 'circle-minus-line',
    label: 'Not measured'
  }
}

/**
 * Presentation for the `verification_status` badge. A snap only gets a real
 * status once its session completes and the applicant submits the handoff
 * email, so `unsubmitted` covers every row without one yet.
 */
export const snapVerificationStatus: Record<
  'draft' | 'submitted' | 'unsubmitted',
  { className: string; icon: IconName; label: string }
> = {
  draft: {
    className: 'border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300',
    icon: 'draft',
    label: 'Draft'
  },
  submitted: {
    className: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300',
    icon: 'send',
    label: 'Submitted'
  },
  unsubmitted: {
    className: 'border-slate-500/30 bg-slate-500/8 text-slate-700 dark:text-slate-300',
    icon: 'circle-minus-line',
    label: 'Unsubmitted'
  }
}

/**
 * Presentation for a `verificationEntries` row's `status`. An entry is created
 * as a `draft`, goes `active` while its email is being sent, and settles on
 * `submitted`, `cancelled`, or `failed`.
 */
export const verificationEntryStatus: Record<
  VerificationEntryStatus,
  { className: string; icon: IconName; label: string }
> = {
  draft: {
    className: 'border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300',
    icon: 'draft',
    label: 'Draft'
  },
  active: {
    className: 'border-active/80 bg-active/8 text-active dark:active',
    icon: 'bolt',
    label: 'Sending'
  },
  submitted: {
    className: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300',
    icon: 'send',
    label: 'Submitted'
  },
  cancelled: {
    className: 'border-stone-500/30 bg-stone-500/8 text-stone-700 dark:text-stone-300',
    icon: 'octagon',
    label: 'Cancelled'
  },
  failed: {
    className: 'border border-rose-500 bg-rose-500/8 text-rose-700 dark:text-rose-300',
    icon: 'cancel',
    label: 'Failed'
  }
}

export const snapSessionStatus: Record<SnapSessionStatus, { className: string; icon: IconName; label: string }> = {
  completed: {
    className: 'border-emerald-500 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300',
    icon: 'circle-check',
    label: 'Completed'
  },
  active: {
    className: 'border-active/80 bg-active/8 text-active dark:active',
    icon: 'bolt',
    label: 'Active'
  },
  pending: {
    className: 'border-orange-500/60 bg-orange-500/8 text-orange-700 dark:text-orange-300',
    icon: 'pending',
    label: 'Pending'
  },
  abandoned: {
    className: 'border-slate-500/30 bg-slate-500/8 text-slate-700 dark:text-slate-300',
    icon: 'alert-triangle',
    label: 'Abandoned'
  },
  cancelled: {
    className: 'border-stone-500/30 bg-stone-500/8 text-stone-700 dark:text-stone-300',
    icon: 'octagon',
    label: 'Cancelled'
  },
  invalidated: {
    className: 'border border-rose-500 bg-rose-500/8 text-rose-700 dark:text-rose-300',
    icon: 'cancel',
    label: 'Rejected'
  }
}

/** Snap volume bucketed by country and session status. */
export interface AnalyticsRow {
  accuracySamples: number
  accuracyTotal: number
  countryCode: string
  id: string
  photoTotal: number
  snaps: number
  status: SnapSessionStatus
  submittedTotal: number
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

/**
 * The three tables are seeded together and cross-linked: every snap points at a
 * seeded user's `firebaseUid`, and every submitted snap gets a verification
 * entry carrying its `uploadId`. Joins under test therefore behave like
 * production rather than always missing.
 */
export interface SeedRowsResult {
  elapsedMs: number
  rows: SnapRow[]
  users: UserRow[]
  verificationEntries: VerificationEntryRow[]
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
  rows: SnapRow[]
}

interface ExplorerRowsOptions extends ProgressOptions<ExplorerProgress> {
  filters?: ReadonlyArray<ExplorerColumnFilter>
  query?: string
  sorting?: ReadonlyArray<ExplorerSort>
}

interface AnalyticsAccumulator {
  accuracySamples: number
  accuracyTotal: number
  countryCode: string
  photoTotal: number
  snaps: number
  status: SnapSessionStatus
  submittedTotal: number
}

interface ExplorerTask {
  controller: AbortController
  key: string
  latestProgress: ExplorerProgress | null
  listeners: Set<(progress: ExplorerProgress) => void>
  source: ReadonlyArray<SnapRow>
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

/* Seeding */

let seedCache: SeedRowsResult | null = null
let seedTask: { rowCount: SeedRowCount; task: Promise<SeedRowsResult> } | null = null
let latestSeedProgress: SeedProgress | null = null
const seedProgressListeners = new Set<(progress: SeedProgress) => void>()

const publishSeedProgress = (progress: SeedProgress) => {
  latestSeedProgress = progress
  for (const listener of seedProgressListeners) listener(progress)
}

// Seeded documents stand in for Convex ids, which are branded strings.
const asSnapId = (value: string) => value as SnapRow['_id']

const runSeed = async (rowCount: SeedRowCount): Promise<SeedRowsResult> => {
  const startedAt = performance.now()
  publishSeedProgress({ completed: 0, elapsedMs: 0, phase: 'loading', total: rowCount })

  const { faker } = await import('@faker-js/faker/locale/en_US')

  faker.seed(24_082_026)
  faker.setDefaultRefDate('2026-08-25T12:00:00.000Z')

  const userCount = Math.max(1, Math.round(rowCount / SNAPS_PER_USER))
  const users = new Array<UserRow>(userCount)

  for (let index = 0; index < userCount; index += 1) {
    const firstName = faker.person.firstName()
    const lastName = faker.person.lastName()
    const firebaseUid = faker.string.alphanumeric({ length: 28 })
    const email = faker.internet.email({ firstName, lastName, provider: 'example.dev' }).toLowerCase()
    const createdAt = faker.date.past({ years: 2 }).getTime()

    users[index] = {
      _id: `us-${String(index + 1).padStart(7, '0')}`,
      createdAt,
      email,
      emailVerified: faker.datatype.boolean({ probability: 0.82 }),
      firebaseUid,
      imageUrl: faker.image.avatar(),
      issuer: 'https://securetoken.google.com/livesnaps',
      name: `${firstName} ${lastName}`,
      nickname: faker.datatype.boolean({ probability: 0.35 }) ? firstName.toLowerCase() : null,
      phone: faker.datatype.boolean({ probability: 0.7 }) ? faker.phone.number() : null,
      preferredUsername: faker.datatype.boolean({ probability: 0.4 }) ? email.split('@')[0] : null,
      profileUrl: undefined,
      subject: firebaseUid,
      tokenIdentifier: `https://securetoken.google.com/livesnaps|${firebaseUid}`,
      updatedAt: createdAt
    }
  }

  const rows = new Array<SnapRow>(rowCount)
  const verificationEntries: VerificationEntryRow[] = []

  for (let chunkStart = 0; chunkStart < rowCount; chunkStart += SEED_CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + SEED_CHUNK_SIZE, rowCount)

    for (let index = chunkStart; index < chunkEnd; index += 1) {
      const user = users[index % userCount]
      const status = faker.helpers.arrayElement(snapSessionStatuses)
      const isCompleted = status === 'completed'

      // Only a finished capture has all five slots; an in-flight session has
      // however many the applicant got through.
      const photoCount = isCompleted ? 5 : status === 'active' ? faker.number.int({ min: 1, max: 4 }) : 0

      const verificationStatus: SnapVerificationStatus | undefined = isCompleted
        ? faker.helpers.arrayElement(snapVerificationStatuses)
        : undefined
      const isSubmitted = verificationStatus === 'submitted'

      const createdAt = faker.date.recent({ days: 120 }).getTime()
      const updatedAt = createdAt + faker.number.int({ min: 0, max: 6 * 60 * 60 * 1000 })
      const uploadId = faker.string.uuid()
      const plateNumber = `${faker.string.alpha({ length: 3, casing: 'upper' })} ${faker.string.numeric(4)}`
      const city = faker.location.city()

      const handler = isSubmitted
        ? { email: faker.internet.email({ provider: 'livesnapsnow.com' }).toLowerCase(), name: faker.person.fullName() }
        : undefined

      rows[index] = {
        _id: asSnapId(`sn-${String(index + 1).padStart(7, '0')}`),
        bestAccuracyMeters: photoCount > 0 ? faker.number.float({ min: 3, max: 65, fractionDigits: 1 }) : null,
        countryCode: faker.helpers.arrayElement(countryCodes),
        countryCodeMatchesIpinfo: photoCount > 0 ? faker.datatype.boolean({ probability: 0.88 }) : null,
        createdAt,
        email: user.email ?? '',
        firebaseUid: user.firebaseUid,
        fullName: user.name ?? '',
        handler,
        locationLabel: `${faker.location.streetAddress()}, ${city}`,
        make: faker.helpers.arrayElement(vehicleMakes),
        mileage: isCompleted ? faker.number.int({ min: 1_200, max: 320_000 }) : null,
        model: faker.vehicle.model(),
        phone: user.phone ?? '',
        photoCount,
        plateNumber,
        status,
        updatedAt,
        uploadId,
        verification_status: verificationStatus,
        year: faker.number.int({ min: 2005, max: 2026 })
      }

      if (isSubmitted && handler !== undefined) {
        verificationEntries.push({
          _id: `ve-${String(verificationEntries.length + 1).padStart(7, '0')}`,
          applicant: user.name ?? '',
          attachments: ['photos', 'full report'],
          ccEmailAddress: undefined,
          createdAt: updatedAt,
          emailFromAddress: handler.email,
          emailToAddress: user.email ?? '',
          plateNumber,
          senderName: handler.name,
          senderTokenIdentifier: user.tokenIdentifier,
          senderUid: user.firebaseUid,
          status: faker.helpers.arrayElement(verificationEntryStatuses),
          updatedAt,
          uploadId
        })
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

  return { elapsedMs: performance.now() - startedAt, rows, users, verificationEntries }
}

export const seedSnapRows = async ({
  onProgress,
  rowCount = ROW_COUNT,
  signal
}: SeedRowsOptions = {}): Promise<SeedRowsResult> => {
  assertNotAborted(signal)

  if (seedCache !== null && seedCache.rows.length >= rowCount) {
    return seedCache.rows.length === rowCount
      ? seedCache
      : {
          elapsedMs: 0,
          rows: seedCache.rows.slice(0, rowCount),
          users: seedCache.users,
          verificationEntries: seedCache.verificationEntries
        }
  }

  if (seedTask !== null && seedTask.rowCount !== rowCount) {
    try {
      await seedTask.task
    } catch {
      // A failed task for another count should not prevent this request.
    }
    assertNotAborted(signal)
    return seedSnapRows({ onProgress, rowCount, signal })
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

/* Analytics */

let analyticsCache: { source: ReadonlyArray<SnapRow>; result: AnalyticsRowsResult } | null = null
let analyticsTask: { source: ReadonlyArray<SnapRow>; task: Promise<AnalyticsRowsResult> } | null = null
let latestAnalyticsProgress: AnalyticsProgress | null = null
const analyticsProgressListeners = new Set<(progress: AnalyticsProgress) => void>()

const publishAnalyticsProgress = (progress: AnalyticsProgress) => {
  latestAnalyticsProgress = progress
  for (const listener of analyticsProgressListeners) listener(progress)
}

const runAnalyticsIndex = async (source: ReadonlyArray<SnapRow>): Promise<AnalyticsRowsResult> => {
  const startedAt = performance.now()
  const buckets = new Map<string, AnalyticsAccumulator>()

  for (let chunkStart = 0; chunkStart < source.length; chunkStart += ANALYTICS_CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + ANALYTICS_CHUNK_SIZE, source.length)

    for (let index = chunkStart; index < chunkEnd; index += 1) {
      const row = source[index]
      const key = `${row.countryCode}:${row.status}`
      const existing = buckets.get(key)
      // A session without a fix has no accuracy to average, so it counts toward
      // volume but not toward the mean.
      const hasAccuracy = row.bestAccuracyMeters !== null
      const submitted = row.verification_status === 'submitted' ? 1 : 0

      if (existing === undefined) {
        buckets.set(key, {
          accuracySamples: hasAccuracy ? 1 : 0,
          accuracyTotal: row.bestAccuracyMeters ?? 0,
          countryCode: row.countryCode,
          photoTotal: row.photoCount,
          snaps: 1,
          status: row.status,
          submittedTotal: submitted
        })
      } else {
        existing.snaps += 1
        existing.photoTotal += row.photoCount
        existing.submittedTotal += submitted

        if (hasAccuracy) {
          existing.accuracySamples += 1
          existing.accuracyTotal += row.bestAccuracyMeters ?? 0
        }
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

  const rows = Array.from(
    buckets.values(),
    (bucket): AnalyticsRow => ({
      accuracySamples: bucket.accuracySamples,
      accuracyTotal: bucket.accuracyTotal,
      countryCode: bucket.countryCode,
      id: `${bucket.countryCode}:${bucket.status}`,
      photoTotal: bucket.photoTotal,
      snaps: bucket.snaps,
      status: bucket.status,
      submittedTotal: bucket.submittedTotal
    })
  )

  return {
    elapsedMs: performance.now() - startedAt,
    rows,
    sourceRowCount: source.length
  }
}

export const prepareAnalyticsRows = async (
  source: ReadonlyArray<SnapRow>,
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

/* Explorer */

const explorerCaches = new WeakMap<ReadonlyArray<SnapRow>, Map<string, ExplorerRowsResult>>()
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

  const sortKey = sorting.map((sort) => `${sort.id}:${sort.desc ? 'desc' : 'asc'}`).join(',')

  return `${normalizeExplorerQuery(query)}|${sortKey}|${filterKey}`
}

const matchesExplorerQuery = (row: SnapRow, query: string) => {
  if (query.length === 0) return true

  return (
    row.plateNumber.toLocaleLowerCase().includes(query) ||
    row.fullName.toLocaleLowerCase().includes(query) ||
    row.email.toLocaleLowerCase().includes(query) ||
    row.phone.toLocaleLowerCase().includes(query) ||
    row.locationLabel.toLocaleLowerCase().includes(query) ||
    row.make.toLocaleLowerCase().includes(query) ||
    row.model.toLocaleLowerCase().includes(query) ||
    row.uploadId.toLocaleLowerCase().includes(query) ||
    row.status.toLocaleLowerCase().includes(query)
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

const SELECT_FILTER_IDS = ['countryCode', 'status', 'verification_status'] as const
const RANGE_FILTER_IDS = ['photoCount', 'bestAccuracyMeters', 'mileage', 'year'] as const
const DATE_FILTER_IDS = ['createdAt', 'updatedAt'] as const

type SelectFilterId = (typeof SELECT_FILTER_IDS)[number]
type RangeFilterId = (typeof RANGE_FILTER_IDS)[number]
type DateFilterId = (typeof DATE_FILTER_IDS)[number]

const isSelectFilterId = (id: string): id is SelectFilterId => (SELECT_FILTER_IDS as ReadonlyArray<string>).includes(id)
const isRangeFilterId = (id: string): id is RangeFilterId => (RANGE_FILTER_IDS as ReadonlyArray<string>).includes(id)
const isDateFilterId = (id: string): id is DateFilterId => (DATE_FILTER_IDS as ReadonlyArray<string>).includes(id)

export const matchesExplorerColumnFilters = (row: SnapRow, filters: ReadonlyArray<ExplorerColumnFilter>) => {
  for (const filter of filters) {
    if (isSelectFilterId(filter.id)) {
      const selected = Array.isArray(filter.value) ? filter.value.map(String) : []
      if (selected.length > 0 && !selected.includes(String(row[filter.id] ?? ''))) return false
      continue
    }

    if (isRangeFilterId(filter.id)) {
      const [rawMinimum, rawMaximum] = getExplorerRange(filter.value)
      const minimum = getExplorerNumberBound(rawMinimum)
      const maximum = getExplorerNumberBound(rawMaximum)
      const value = row[filter.id]

      // A null measurement cannot satisfy a bound, so an active range excludes it.
      if (value === null) {
        if (minimum !== undefined || maximum !== undefined) return false
        continue
      }

      if (minimum !== undefined && value < minimum) return false
      if (maximum !== undefined && value > maximum) return false
      continue
    }

    if (isDateFilterId(filter.id)) {
      const [rawFrom, rawTo] = getExplorerRange(filter.value)
      const from = getExplorerDateBound(rawFrom, false)
      const to = getExplorerDateBound(rawTo, true)
      const value = row[filter.id]
      if (from !== undefined && value < from) return false
      if (to !== undefined && value > to) return false
    }
  }

  return true
}

const getExplorerSortValue = (row: SnapRow, id: string): string | number => {
  switch (id) {
    case 'plateNumber':
      return row.plateNumber
    case 'fullName':
      return row.fullName
    case 'email':
      return row.email
    case 'phone':
      return row.phone
    case 'locationLabel':
      return row.locationLabel
    case 'countryCode':
      return row.countryCode
    case 'make':
      return row.make
    case 'model':
      return row.model
    case 'status':
      return row.status
    case 'verification_status':
      return row.verification_status ?? ''
    case 'handler':
      return row.handler?.name ?? ''
    case 'photoCount':
      return row.photoCount
    // Nulls sort first ascending, keeping unmeasured rows clear of the values
    // an operator is actually scanning for.
    case 'bestAccuracyMeters':
      return row.bestAccuracyMeters ?? Number.NEGATIVE_INFINITY
    case 'mileage':
      return row.mileage ?? Number.NEGATIVE_INFINITY
    case 'year':
      return row.year ?? Number.NEGATIVE_INFINITY
    case 'createdAt':
      return row.createdAt
    case 'updatedAt':
      return row.updatedAt
    default:
      return row._id
  }
}

const compareExplorerRows = (left: SnapRow, right: SnapRow, sorting: ReadonlyArray<ExplorerSort>) => {
  for (const sort of sorting) {
    const leftValue = getExplorerSortValue(left, sort.id)
    const rightValue = getExplorerSortValue(right, sort.id)
    const comparison = leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1

    if (comparison !== 0) return sort.desc ? -comparison : comparison
  }

  return left._id < right._id ? -1 : left._id > right._id ? 1 : 0
}

const sortExplorerRows = async (
  input: SnapRow[],
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
  let target = new Array<SnapRow>(input.length)

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
  source: ReadonlyArray<SnapRow>,
  query: string,
  sorting: ReadonlyArray<ExplorerSort>,
  filters: ReadonlyArray<ExplorerColumnFilter>,
  signal: AbortSignal,
  publish: (progress: ExplorerProgress) => void
): Promise<ExplorerRowsResult> => {
  const startedAt = performance.now()
  const normalizedQuery = normalizeExplorerQuery(query)
  const filteredRows: SnapRow[] = []

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

const getCachedExplorerRows = (source: ReadonlyArray<SnapRow>, key: string) => {
  const cache = explorerCaches.get(source)
  const result = cache?.get(key)

  if (cache !== undefined && result !== undefined) {
    cache.delete(key)
    cache.set(key, result)
  }

  return result
}

const cacheExplorerRows = (source: ReadonlyArray<SnapRow>, key: string, result: ExplorerRowsResult) => {
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
  source: ReadonlyArray<SnapRow>,
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
  source: ReadonlyArray<SnapRow>,
  {
    filters = [],
    onProgress,
    query = '',
    signal,
    sorting = [{ id: 'updatedAt', desc: true }]
  }: ExplorerRowsOptions = {}
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

/* Formatting */

export const formatCompact = (value: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value)

export const formatAccuracy = (meters: number | null) =>
  meters === null ? '--' : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(meters)} m`

export const formatMileage = (kilometers: number | null) =>
  kilometers === null ? '--' : `${new Intl.NumberFormat('en-US').format(kilometers)} km`

export const formatRelativeTime = (timestamp: number) => {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000))
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  return `${Math.round(hours / 24)}d ago`
}
