import type { VerificationEntryRow } from '@/components/admin/data'
import { countBy, median, ratio, type Segment, toDailySeries, toSegments, windowTotals } from '@/lib/overview/metrics'
import type { AdminSnapListItem } from '@/lib/snaps/admin-photo-types'

/**
 * Turns the two lists the admin tables already poll into the readings the
 * overview shows. Nothing here fetches — the page owns that — so each reading
 * is a pure function of rows the operator can also see in the tables below.
 */

export const TREND_DAYS = 30
export const COMPARISON_DAYS = 7

/**
 * One status vocabulary across both pipelines, so a colour means the same thing
 * wherever it appears: reached its end, in flight, needs a human, stopped
 * cleanly, failed. Every segment is direct-labelled in the legend, which is what
 * makes the sub-3:1 light-mode steps legal.
 */
const TONE_RESOLVED = 'bg-chart-good'
const TONE_IN_FLIGHT = 'bg-chart-info'
const TONE_ATTENTION = 'bg-chart-warn'
const TONE_STOPPED = 'bg-chart-idle'
const TONE_FAILED = 'bg-chart-critical'

const SNAP_STATUSES = ['pending', 'active', 'abandoned', 'completed', 'cancelled', 'invalidated'] as const
const ENTRY_STATUSES = ['draft', 'active', 'submitted', 'cancelled', 'failed'] as const

export interface CaptureReadings {
  /** Daily capture counts, oldest first. */
  trend: number[]
  totals: { current: number; previous: number }
  /** Every session, including the ones still open. */
  total: number
  /** Sessions that reached an end, of any kind. */
  settled: number
  completed: number
  completionRate: number
  segments: Segment[]
}

export function readCaptures(snaps: readonly AdminSnapListItem[], now = Date.now()): CaptureReadings {
  const createdAt = snaps.map((snap) => snap.createdAt)
  const counts = countBy(snaps, SNAP_STATUSES, (snap) => snap.status)

  // `pending` and `active` are folded together: both mean the session is still
  // open, and splitting them would spend a colour on a distinction the operator
  // cannot act on from here.
  const inFlight = counts.pending + counts.active
  const settled = counts.completed + counts.abandoned + counts.cancelled + counts.invalidated

  return {
    trend: toDailySeries(createdAt, TREND_DAYS, now).map((bucket) => bucket.value),
    totals: windowTotals(createdAt, COMPARISON_DAYS, now),
    total: snaps.length,
    settled,
    completed: counts.completed,
    completionRate: ratio(counts.completed, settled),
    segments: toSegments([
      { key: 'completed', label: 'Completed', value: counts.completed, tone: TONE_RESOLVED },
      { key: 'in-flight', label: 'In progress', value: inFlight, tone: TONE_IN_FLIGHT },
      { key: 'abandoned', label: 'Abandoned', value: counts.abandoned, tone: TONE_ATTENTION },
      { key: 'cancelled', label: 'Cancelled', value: counts.cancelled, tone: TONE_STOPPED },
      { key: 'invalidated', label: 'Invalidated', value: counts.invalidated, tone: TONE_FAILED }
    ])
  }
}

export interface VerificationReadings {
  trend: number[]
  totals: { current: number; previous: number }
  total: number
  submitted: number
  /** Unsent work: the one number on this page that is a to-do list. */
  drafts: number
  failed: number
  segments: Segment[]
}

export function readVerifications(entries: readonly VerificationEntryRow[], now = Date.now()): VerificationReadings {
  const createdAt = entries.map((entry) => entry.createdAt)
  const counts = countBy(entries, ENTRY_STATUSES, (entry) => entry.status)

  return {
    trend: toDailySeries(createdAt, TREND_DAYS, now).map((bucket) => bucket.value),
    totals: windowTotals(createdAt, COMPARISON_DAYS, now),
    total: entries.length,
    submitted: counts.submitted,
    drafts: counts.draft,
    failed: counts.failed,
    segments: toSegments([
      { key: 'submitted', label: 'Submitted', value: counts.submitted, tone: TONE_RESOLVED },
      { key: 'active', label: 'In flight', value: counts.active, tone: TONE_IN_FLIGHT },
      { key: 'draft', label: 'Draft', value: counts.draft, tone: TONE_ATTENTION },
      { key: 'cancelled', label: 'Cancelled', value: counts.cancelled, tone: TONE_STOPPED },
      { key: 'failed', label: 'Failed', value: counts.failed, tone: TONE_FAILED }
    ])
  }
}

/**
 * How long a capture waits before someone acts on it.
 *
 * Entries carry the `uploadId` of the snap they verify, which is the only link
 * between the two tables. Snaps captured before an entry existed are simply
 * absent from the sample rather than counted as infinite.
 */
export function readTurnaround(snaps: readonly AdminSnapListItem[], entries: readonly VerificationEntryRow[]) {
  const capturedAt = new Map(snaps.map((snap) => [snap.uploadId, snap.createdAt]))
  const waits: number[] = []

  for (const entry of entries) {
    const captured = capturedAt.get(entry.uploadId)
    // A clock skew between the two writes would otherwise show as a negative wait.
    if (captured !== undefined && entry.createdAt >= captured) waits.push(entry.createdAt - captured)
  }

  return { median: median(waits), sampled: waits.length }
}

export interface IntegrityReadings {
  /** Snaps whose reported country agreed with the IP lookup. */
  geoMatched: number
  geoChecked: number
  geoMatchRate: number
  /** Sessions whose best GPS fix landed inside `PRECISE_FIX_METRES`. */
  preciseFixes: number
  locatedSessions: number
  preciseRate: number
  medianAccuracyMetres: number | null
  photos: number
  photosPerSession: number | null
}

/** The radius under which a fix is good enough to place a vehicle on a street. */
export const PRECISE_FIX_METRES = 50

export function readIntegrity(snaps: readonly AdminSnapListItem[]): IntegrityReadings {
  let geoMatched = 0
  let geoChecked = 0
  let preciseFixes = 0
  let photos = 0
  const accuracies: number[] = []

  for (const snap of snaps) {
    if (snap.countryCodeMatchesIpinfo !== null) {
      geoChecked += 1
      if (snap.countryCodeMatchesIpinfo) geoMatched += 1
    }

    if (snap.bestAccuracyMeters !== null) {
      accuracies.push(snap.bestAccuracyMeters)
      if (snap.bestAccuracyMeters <= PRECISE_FIX_METRES) preciseFixes += 1
    }

    photos += snap.photos.length
  }

  return {
    geoMatched,
    geoChecked,
    geoMatchRate: ratio(geoMatched, geoChecked),
    preciseFixes,
    locatedSessions: accuracies.length,
    preciseRate: ratio(preciseFixes, accuracies.length),
    medianAccuracyMetres: median(accuracies),
    photos,
    photosPerSession: snaps.length === 0 ? null : photos / snaps.length
  }
}

export interface ActivityEvent {
  id: string
  at: number
  kind: 'capture' | 'verification'
  /** Who the row is about — the applicant, either way. */
  actor: string
  plate: string
  detail: string
  status: string
  tone: string
}

const SNAP_EVENT_TONE: Record<string, string> = {
  completed: TONE_RESOLVED,
  pending: TONE_IN_FLIGHT,
  active: TONE_IN_FLIGHT,
  abandoned: TONE_ATTENTION,
  cancelled: TONE_STOPPED,
  invalidated: TONE_FAILED
}

const ENTRY_EVENT_TONE: Record<string, string> = {
  submitted: TONE_RESOLVED,
  active: TONE_IN_FLIGHT,
  draft: TONE_ATTENTION,
  cancelled: TONE_STOPPED,
  failed: TONE_FAILED
}

/** The newest events from both tables on one clock. */
export function readActivity(
  snaps: readonly AdminSnapListItem[],
  entries: readonly VerificationEntryRow[],
  limit = 7
): ActivityEvent[] {
  const captures: ActivityEvent[] = snaps.map((snap) => ({
    id: `snap-${snap._id}`,
    at: snap.createdAt,
    kind: 'capture',
    actor: snap.fullName || snap.email || 'Unknown applicant',
    plate: snap.plateNumber,
    detail: [snap.make, snap.model].filter(Boolean).join(' ') || snap.locationLabel || '—',
    status: snap.status,
    tone: SNAP_EVENT_TONE[snap.status] ?? TONE_STOPPED
  }))

  const verifications: ActivityEvent[] = entries.map((entry) => ({
    id: `entry-${entry._id}`,
    at: entry.createdAt,
    kind: 'verification',
    actor: entry.applicant,
    plate: entry.plateNumber,
    detail: entry.emailToAddress,
    status: entry.status,
    tone: ENTRY_EVENT_TONE[entry.status] ?? TONE_STOPPED
  }))

  return [...captures, ...verifications].sort((a, b) => b.at - a.at).slice(0, limit)
}
