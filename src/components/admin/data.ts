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
export type VerificationEntryRow = VerificationEntry & { _id: string; handler?: SnapRow['handler'] }

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
    className: 'border-rose-500/15 bg-rose-500/8 text-rose-700 dark:text-rose-400',
    icon: 'alert-triangle',
    label: 'Mismatch'
  },
  unknown: {
    className: 'border-slate-500/10 bg-slate-500/8 text-slate-600 dark:text-slate-400',
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
    className: 'border-taupe-500/30 bg-taupe-500/8 text-taupe-700 dark:text-taupe-300',
    icon: 'draft',
    label: 'Draft'
  },
  submitted: {
    className: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300',
    icon: 'send',
    label: 'Submitted'
  },
  unsubmitted: {
    className: 'border-mist-500/10 bg-mist-500/10 text-mist-600 dark:text-mist-400',
    icon: 'not-started',
    label: 'Not Started'
  }
  // unsubmitted: {
  //   className:
  //     'size-5 aspect-square flex items-center justify-center gap-0! px-0! border-mist-500/10 bg-mist-500/10 text-mist-600 dark:text-mist-400',
  //   icon: 'draft',
  //   label: ''
  // }
}

/**
 * Presentation for a `verificationEntries` row's `status`. An entry is created
 * as a `draft`, goes `active` once an operator starts working on it, and settles on
 * `submitted`, `cancelled`, or `failed`.
 */
export const verificationEntryStatus: Record<
  VerificationEntryStatus,
  { className: string; icon: IconName; label: string }
> = {
  draft: {
    className: 'border-taupe-500/30 bg-taupe-500/8 text-taupe-700 dark:text-taupe-300',
    icon: 'draft',
    label: 'Draft'
  },
  active: {
    className: 'border-active/50 bg-active/8 text-active dark:active',
    icon: 'bolt',
    label: 'Active'
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
    className: 'border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400',
    icon: 'circle-check',
    label: 'Completed'
  },
  active: {
    className: 'border-active/25 bg-active/8 text-active dark:active',
    icon: 'bolt',
    label: 'Active'
  },
  pending: {
    className: 'border-orange-500/50 bg-orange-500/8 text-orange-700 dark:text-orange-300',
    icon: 'pending',
    label: 'Pending'
  },
  abandoned: {
    className: 'border-slate-500/15 bg-slate-500/8 text-slate-600 dark:text-slate-400',
    icon: 'alert-triangle',
    label: 'Abandoned'
  },
  cancelled: {
    className: 'border-mauve-500/15 bg-mauve-500/8 text-mauve-600 dark:text-mauve-400',
    icon: 'octagon',
    label: 'Cancelled'
  },
  invalidated: {
    className: 'border border-rose-500/15 bg-rose-500/8 text-rose-600 dark:text-rose-400',
    icon: 'circle-minus',
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

interface AnalyticsAccumulator {
  accuracySamples: number
  accuracyTotal: number
  countryCode: string
  photoTotal: number
  snaps: number
  status: SnapSessionStatus
  submittedTotal: number
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

  const rows = Array.from(buckets.values(), (bucket): AnalyticsRow => ({
    accuracySamples: bucket.accuracySamples,
    accuracyTotal: bucket.accuracyTotal,
    countryCode: bucket.countryCode,
    id: `${bucket.countryCode}:${bucket.status}`,
    photoTotal: bucket.photoTotal,
    snaps: bucket.snaps,
    status: bucket.status,
    submittedTotal: bucket.submittedTotal
  }))

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
