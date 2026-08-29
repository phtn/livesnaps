import type { Doc } from '../../../convex/_generated/dataModel'
import type { SnapCaptureIntegrity, SnapDeviceLocation } from '../../../convex/snaps/d'

export type SnapReportTone = 'danger' | 'info' | 'neutral' | 'success' | 'warning'

export interface SnapReportField {
  label: string
  mono?: boolean
  span?: 1 | 2
  value: string
}

export interface SnapReportSectionBlock {
  description?: string
  fields: SnapReportField[]
  id: string
  index: string
  kind: 'section'
  title: string
}

export interface SnapReportCalloutBlock {
  description: string
  fields: SnapReportField[]
  id: string
  index: string
  kind: 'callout'
  title: string
}

export interface SnapReportEvidenceItem {
  fields: SnapReportField[]
  index: string
  title: string
}

export interface SnapReportEvidenceBlock {
  description: string
  fields: SnapReportField[]
  id: string
  index: string
  items: SnapReportEvidenceItem[]
  kind: 'evidence'
  title: string
}

export type SnapReportBlock = SnapReportSectionBlock | SnapReportCalloutBlock | SnapReportEvidenceBlock

export interface SnapFullReportDocument {
  blocks: SnapReportBlock[]
  generatedAt: string
  kind: 'snap-full-row-report'
  metrics: Array<{
    label: string
    tone: SnapReportTone
    value: string
  }>
  recordId: string
  status: string
  statusTone: SnapReportTone
  subtitle: string
  title: string
  uploadId: string
  version: 1
}

const NOT_RECORDED = 'Not recorded'

const knownText = (value: string | null | undefined) => (value && value.length > 0 ? value : NOT_RECORDED)

const knownNumber = (value: number | null | undefined, suffix = '') =>
  value === null || value === undefined ? NOT_RECORDED : `${String(value)}${suffix}`

const auditTimestamp = (value: number | null | undefined) => {
  if (value === null || value === undefined) return NOT_RECORDED

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

const statusTone = (status: string): SnapReportTone => {
  if (status === 'completed') return 'success'
  if (status === 'active') return 'info'
  if (status === 'abandoned') return 'neutral'
  if (status === 'invalidated') return 'danger'
  if (status === 'pending') return 'warning'
  return 'neutral'
}

const verdict = (value: boolean | null): { tone: SnapReportTone; value: string } =>
  value === true
    ? { tone: 'success', value: 'Verified' }
    : value === false
      ? { tone: 'danger', value: 'Mismatch' }
      : { tone: 'neutral', value: 'Unknown' }

const duration = (startedAt: number | undefined, endedAt: number | undefined) => {
  if (startedAt === undefined || endedAt === undefined || endedAt < startedAt) return NOT_RECORDED

  const elapsedSeconds = Math.floor((endedAt - startedAt) / 1_000)
  const hours = Math.floor(elapsedSeconds / 3_600)
  const minutes = Math.floor((elapsedSeconds % 3_600) / 60)
  const seconds = elapsedSeconds % 60

  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${seconds}s`].filter(Boolean).join(' ')
}

const telemetryFields = (location: SnapDeviceLocation, labelPrefix = ''): SnapReportField[] => {
  const prefix = labelPrefix ? `${labelPrefix} ` : ''

  return [
    {
      label: `${prefix}coordinates`,
      mono: true,
      span: 2,
      value: `${String(location.latitude)}, ${String(location.longitude)}`
    },
    { label: `${prefix}horizontal accuracy`, mono: true, value: `${String(location.accuracy_meters)} m` },
    { label: `${prefix}captured at`, mono: true, value: auditTimestamp(location.captured_at) },
    { label: `${prefix}altitude`, mono: true, value: knownNumber(location.altitude_meters, ' m') },
    {
      label: `${prefix}altitude accuracy`,
      mono: true,
      value: knownNumber(location.altitude_accuracy_meters, ' m')
    },
    { label: `${prefix}heading`, mono: true, value: knownNumber(location.heading_degrees, ' deg') },
    { label: `${prefix}speed`, mono: true, value: knownNumber(location.speed_meters_per_second, ' m/s') }
  ]
}

const humanize = (value: string) =>
  value
    .replaceAll('_', ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase())

const captureIntegrityFields = (captureIntegrity: SnapCaptureIntegrity | undefined): SnapReportField[] => {
  if (!captureIntegrity) {
    return [{ label: 'Capture integrity', span: 2, value: NOT_RECORDED }]
  }

  return [
    { label: 'Capture integrity', value: humanize(captureIntegrity.disposition) },
    { label: 'Integrity status', value: humanize(captureIntegrity.status) },
    { label: 'Integrity verdict', value: humanize(captureIntegrity.verdict) },
    { label: 'Integrity confidence', mono: true, value: `${(captureIntegrity.confidence * 100).toFixed(1)}%` },
    {
      label: 'Integrity signals',
      span: 2,
      value:
        captureIntegrity.signals.length > 0
          ? captureIntegrity.signals.map((signal) => humanize(signal)).join(', ')
          : 'None detected'
    },
    { label: 'Integrity model', mono: true, value: captureIntegrity.model },
    { label: 'Integrity analyzed at', mono: true, value: auditTimestamp(captureIntegrity.analyzed_at) }
  ]
}

const byteHex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('')

const dynamicScalar = (value: unknown): string => {
  if (value === null) return 'null'
  if (value instanceof ArrayBuffer) return `bytes:${value.byteLength}:${byteHex(value)}`
  if (typeof value === 'bigint') return `${value.toString()}n`
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return value.length === 0 ? 'Empty string' : value
  return String(value)
}

const attributeLabel = (path: string[]) =>
  path.map((part) => (/^\[\d+\]$/.test(part) ? `Item ${Number(part.slice(1, -1)) + 1}` : humanize(part))).join(' / ')

export const flattensnapAttributeFields = (value: unknown, path: string[] = []): SnapReportField[] => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [{ label: attributeLabel(path) || 'Attributes', mono: true, span: 2, value: 'Empty list' }]
    }

    return value.flatMap((item, index) => flattensnapAttributeFields(item, [...path, `[${index}]`]))
  }

  if (value && typeof value === 'object' && !(value instanceof ArrayBuffer)) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    )

    if (entries.length === 0) {
      return [{ label: attributeLabel(path) || 'Attributes', mono: true, span: 2, value: 'Empty object' }]
    }

    return entries.flatMap(([key, item]) => flattensnapAttributeFields(item, [...path, key]))
  }

  return [
    {
      label: attributeLabel(path) || 'Attribute',
      mono: typeof value !== 'string',
      span: 2,
      value: dynamicScalar(value)
    }
  ]
}

const normalizeComparable = (value: unknown) => (value === '' || value === undefined ? null : value)

const snapshotDiscrepancies = (snap: Doc<'snaps'>): SnapReportField[] => {
  const snapshot = snap.location
  const session = snap.location_session
  if (!snapshot || !session) return []

  const comparisons: Array<[string, unknown, unknown]> = [
    ['Full address', snapshot.address.full_address, session.address.full_address],
    ['Street name', snapshot.address.street_name, session.address.street_name],
    ['Locality', snapshot.address.locality, session.address.locality],
    ['City', snapshot.address.city, session.address.city],
    ['Postcode', snapshot.address.postcode, session.address.postcode],
    ['Region', snapshot.address.region, session.address.region],
    ['Country', snapshot.address.country, session.address.country],
    ['Country code', snapshot.address.country_code, session.address.country_code],
    ['Country code alpha-3', snapshot.address.country_code_alpha_3, session.address.country_code_alpha_3],
    ['Feature type', snapshot.address.feature_type, session.address.feature_type],
    ['Mapbox ID', snapshot.address.mapbox_id, session.address.mapbox_id],
    ['Address latitude', snapshot.address.latitude, session.address.latitude],
    ['Address longitude', snapshot.address.longitude, session.address.longitude],
    ['Best accuracy', snapshot.best_accuracy_meters, session.best_accuracy_meters]
  ]

  const fields = comparisons.flatMap(([label, compactValue, canonicalValue]): SnapReportField[] => {
    if (Object.is(normalizeComparable(compactValue), normalizeComparable(canonicalValue))) return []

    return [
      {
        label,
        mono: typeof compactValue === 'number' || typeof canonicalValue === 'number',
        span: 2,
        value: `Session: ${dynamicScalar(canonicalValue)} | Snapshot: ${dynamicScalar(compactValue)}`
      }
    ]
  })

  // The compact snapshot historically coerces a null session verdict to false.
  // Treat that pair as an alias, but surface every other genuine disagreement.
  if (
    !(session.country_code_matches_ipinfo === null && snapshot.country_code_matches_ipinfo === false) &&
    session.country_code_matches_ipinfo !== snapshot.country_code_matches_ipinfo
  ) {
    fields.push({
      label: 'IP country verdict',
      span: 2,
      value: `Session: ${verdict(session.country_code_matches_ipinfo).value} | Snapshot: ${verdict(snapshot.country_code_matches_ipinfo).value}`
    })
  }

  return fields
}

const canonicalLocationFields = (snap: Doc<'snaps'>): { description: string; fields: SnapReportField[] } => {
  if (snap.location_session) {
    const address = snap.location_session.address
    const fields: SnapReportField[] = [
      { label: 'Full address', span: 2, value: knownText(address.full_address) },
      {
        label: 'Resolved coordinates',
        mono: true,
        span: 2,
        value: `${String(address.latitude)}, ${String(address.longitude)}`
      },
      { label: 'Provider', value: knownText(address.provider) },
      { label: 'Feature type', value: knownText(address.feature_type) },
      { label: 'Mapbox ID', mono: true, span: 2, value: knownText(address.mapbox_id) },
      { label: 'Attribution', span: 2, value: knownText(address.attribution) }
    ]

    const optionalAddressFields: Array<[string, string | undefined]> = [
      ['Accuracy class', address.accuracy],
      ['Address number', address.address_number],
      ['Street name', address.street_name],
      ['Secondary address', address.secondary_address],
      ['Secondary designator', address.secondary_designator],
      ['Secondary identifier', address.secondary_identifier],
      ['Lot number', address.lot_number],
      ['Neighborhood', address.neighborhood],
      ['Locality', address.locality],
      ['City', address.city],
      ['District', address.district],
      ['Postcode', address.postcode],
      ['Region', address.region],
      ['Region code', address.region_code],
      ['Country', address.country],
      ['Country code', address.country_code],
      ['Country code alpha-3', address.country_code_alpha_3]
    ]

    for (const [label, value] of optionalAddressFields) {
      if (value !== undefined && value.length > 0) fields.push({ label, value })
    }

    for (const [key, value] of Object.entries(address.components).sort(([left], [right]) =>
      left.localeCompare(right)
    )) {
      fields.push({ label: `Component / ${humanize(key)}`, value: knownText(value) })
    }

    return {
      description: 'Canonical reverse-geocoded address stored with the verification session.',
      fields
    }
  }

  if (snap.location) {
    const address = snap.location.address
    return {
      description: 'Legacy normalized location snapshot; no rich verification session was stored.',
      fields: [
        { label: 'Full address', span: 2, value: knownText(address.full_address) },
        {
          label: 'Resolved coordinates',
          mono: true,
          span: 2,
          value: `${String(address.latitude)}, ${String(address.longitude)}`
        },
        { label: 'Provider', value: knownText(address.provider) },
        { label: 'Feature type', value: knownText(address.feature_type) },
        { label: 'Street name', value: knownText(address.street_name) },
        { label: 'Locality', value: knownText(address.locality) },
        { label: 'City', value: knownText(address.city) },
        { label: 'Postcode', value: knownText(address.postcode) },
        { label: 'Region', value: knownText(address.region) },
        { label: 'Country', value: knownText(address.country) },
        { label: 'Country code', value: knownText(address.country_code) },
        { label: 'Country code alpha-3', value: knownText(address.country_code_alpha_3) },
        { label: 'Mapbox ID', mono: true, span: 2, value: knownText(address.mapbox_id) }
      ]
    }
  }

  return {
    description: 'No verified or normalized location was stored for this snap.',
    fields: [{ label: 'Location data', span: 2, value: NOT_RECORDED }]
  }
}

export const createsnapFullReportDocument = (snap: Doc<'snaps'>, generatedAt = new Date()): SnapFullReportDocument => {
  const session = snap.location_session
  const status = session?.status ?? 'pending'
  const accuracy = session?.best_accuracy_meters ?? snap.location?.best_accuracy_meters ?? null
  const countryMatch = session
    ? session.country_code_matches_ipinfo
    : (snap.location?.country_code_matches_ipinfo ?? null)
  const countryVerdict = verdict(countryMatch)
  const location = canonicalLocationFields(snap)
  const discrepancies = snapshotDiscrepancies(snap)
  const vehicleName = [snap.year, snap.make, snap.model]
    .filter((value) => value !== undefined && value !== '')
    .join(' ')

  const blocks: SnapReportBlock[] = [
    {
      description: 'Authoritative session state and verification outcomes. All timestamps are UTC ISO 8601.',
      fields: [
        { label: 'Session status', value: status },
        { label: 'Session duration', mono: true, value: duration(session?.started_at, session?.ended_at) },
        { label: 'Session started', mono: true, value: auditTimestamp(session?.started_at) },
        { label: 'Session ended', mono: true, value: auditTimestamp(session?.ended_at) },
        { label: 'Best horizontal accuracy', mono: true, value: knownNumber(accuracy, ' m') },
        { label: 'IP country verdict', value: countryVerdict.value },
        { label: 'Invalidation reason', span: 2, value: knownText(session?.invalidation_reason) }
      ],
      id: 'verification',
      index: '01',
      kind: 'section',
      title: 'Verification overview'
    },
    {
      fields: [
        { label: 'Full name', span: 2, value: knownText(snap.full_name) },
        { label: 'Email', span: 2, value: knownText(snap.email) },
        { label: 'Phone', value: knownText(snap.phone) },
        { label: 'UID', mono: true, value: knownText(snap.firebase_uid) },
        {
          label: 'Applicant token identifier',
          mono: true,
          span: 2,
          value: knownText(snap.metadata.applicant_token_identifier)
        }
      ],
      id: 'applicant',
      index: '02',
      kind: 'section',
      title: 'Applicant and identity'
    },
    {
      fields: [
        { label: 'Plate number', mono: true, value: knownText(snap.plate_number) },
        { label: 'Year', mono: true, value: knownNumber(snap.year) },
        { label: 'Make', value: knownText(snap.make) },
        { label: 'Model', value: knownText(snap.model) },
        { label: 'Odometer', mono: true, value: knownNumber(snap.mileage) }
      ],
      id: 'vehicle',
      index: '03',
      kind: 'section',
      title: 'Vehicle'
    },
    {
      description: location.description,
      fields: location.fields,
      id: 'location',
      index: '04',
      kind: 'section',
      title: 'Verified location'
    }
  ]

  if (session) {
    blocks.push(
      {
        description: 'First accepted device fix for the verification session.',
        fields: telemetryFields(session.initial),
        id: 'initial-telemetry',
        index: '05A',
        kind: 'section',
        title: 'Initial device telemetry'
      },
      {
        description: 'Most recent accepted device fix stored with the session.',
        fields: telemetryFields(session.latest),
        id: 'latest-telemetry',
        index: '05B',
        kind: 'section',
        title: 'Latest device telemetry'
      }
    )
  }

  if (discrepancies.length > 0) {
    blocks.push({
      description:
        'The normalized snapshot and canonical session record contain different stored values. Both sources are retained below.',
      fields: discrepancies,
      id: 'snapshot-discrepancies',
      index: '!',
      kind: 'callout',
      title: 'Stored snapshot differences'
    })
  }

  blocks.push({
    description: 'Every evidence item stored in the Convex row. Image bytes remain in protected object storage.',
    fields: [
      { label: 'Evidence items', mono: true, value: String(snap.metadata.photos.length) },
      { label: 'Storage prefix', mono: true, value: snap.metadata.storage_prefix },
      { label: 'Video reference', mono: true, span: 2, value: knownText(snap.video) }
    ],
    id: 'evidence',
    index: '06',
    items: snap.metadata.photos.map((photo, photoIndex) => ({
      fields: [
        { label: 'Slot', mono: true, value: String(photo.slot) },
        { label: 'Capture ID', mono: true, value: knownText(photo.capture_id) },
        { label: 'Captured at', mono: true, value: auditTimestamp(photo.captured_at) },
        { label: 'Content type', mono: true, value: photo.content_type },
        { label: 'Size', mono: true, value: `${photo.size.toLocaleString('en-US')} bytes (${String(photo.size)})` },
        { label: 'R2 object key', mono: true, span: 2, value: photo.r2_key },
        ...captureIntegrityFields(photo.capture_integrity),
        ...(photo.location ? telemetryFields(photo.location, 'Capture') : [])
      ],
      index: String(photoIndex + 1).padStart(2, '0'),
      title: knownText(photo.label)
    })),
    kind: 'evidence',
    title: 'Evidence manifest'
  })

  blocks.push({
    description: snap.ipinfo ? 'Network provenance captured at snap creation.' : 'No network provenance was stored.',
    fields: snap.ipinfo
      ? [
          { label: 'IP address', mono: true, value: snap.ipinfo.ip },
          { label: 'ASN', mono: true, value: snap.ipinfo.asn },
          { label: 'AS name', value: snap.ipinfo.as_name },
          { label: 'AS domain', mono: true, value: snap.ipinfo.as_domain },
          { label: 'Country', value: snap.ipinfo.country },
          { label: 'Country code', mono: true, value: snap.ipinfo.country_code },
          { label: 'Continent', value: snap.ipinfo.continent },
          { label: 'Continent code', mono: true, value: snap.ipinfo.continent_code }
        ]
      : [{ label: 'Network data', span: 2, value: NOT_RECORDED }],
    id: 'network',
    index: '07',
    kind: 'section',
    title: 'Network provenance'
  })

  if (snap.metadata.attributes !== undefined) {
    blocks.push({
      description: 'Supplemental Convex values flattened into stable field paths without lossy JSON conversion.',
      fields: flattensnapAttributeFields(snap.metadata.attributes),
      id: 'attributes',
      index: '08',
      kind: 'section',
      title: 'Supplemental attributes'
    })
  }

  blocks.push({
    description: 'Stable identifiers and lifecycle timestamps for the authoritative Convex document.',
    fields: [
      { label: 'snap record ID', mono: true, span: 2, value: snap._id },
      { label: 'Upload ID', mono: true, span: 2, value: snap.metadata.upload_id },
      { label: 'Record created', mono: true, value: auditTimestamp(snap._creationTime) },
      { label: 'Record updated', mono: true, value: auditTimestamp(snap.updated_at) }
    ],
    id: 'record',
    index: '09',
    kind: 'section',
    title: 'Record provenance'
  })

  return {
    blocks,
    generatedAt: generatedAt.toISOString(),
    kind: 'snap-full-row-report',
    metrics: [
      { label: 'Session status', tone: statusTone(status), value: status },
      { label: 'IP country match', tone: countryVerdict.tone, value: countryVerdict.value },
      {
        label: 'Best accuracy',
        tone: accuracy !== null && accuracy <= 20 ? 'success' : accuracy === null ? 'neutral' : 'warning',
        value: knownNumber(accuracy, ' meters')
      },
      {
        label: 'Evidence items',
        tone: snap.metadata.photos.length > 0 ? 'info' : 'warning',
        value: String(snap.metadata.photos.length)
      }
    ],
    recordId: snap._id,
    status,
    statusTone: statusTone(status),
    subtitle: [vehicleName || 'Vehicle details pending', snap.full_name || 'Applicant details pending'].join(' / '),
    title: snap.plate_number || snap.metadata.upload_id,
    uploadId: snap.metadata.upload_id,
    version: 1
  }
}
