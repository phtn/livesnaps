/** The field catalogue follows the full-report PDF, including conditional fields. */
const telemetry = [
  'coordinates',
  'horizontal accuracy',
  'captured at',
  'altitude',
  'altitude accuracy',
  'heading',
  'speed'
]
const address = [
  'Full address',
  'Resolved coordinates',
  'Provider',
  'Feature type',
  'Mapbox ID',
  'Attribution',
  'Accuracy class',
  'Address number',
  'Street name',
  'Secondary address',
  'Secondary designator',
  'Secondary identifier',
  'Lot number',
  'Neighborhood',
  'Locality',
  'City',
  'District',
  'Postcode',
  'Region',
  'Region code',
  'Country',
  'Country code',
  'Country code alpha-3',
  'Address components',
  'Location data'
]
export const reportFieldKey = (group: string, label: string) =>
  `${group}:${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-$/, '')}`
const group = (id: string, title: string, labels: string[]) => ({
  id,
  title,
  fields: labels.map((label) => ({ key: reportFieldKey(id, label), label }))
})
export const REPORT_FIELD_GROUPS = [
  group('header', 'Summary', [
    'Generated timestamp',
    'Record ID',
    'Upload ID',
    'Plate number',
    'Vehicle',
    'Applicant',
    'Session status',
    'IP country match',
    'Best accuracy',
    'Evidence items'
  ]),
  group('verification', '01 · Verification', [
    'Session status',
    'Session duration',
    'Session started',
    'Session ended',
    'Best horizontal accuracy',
    'IP country verdict',
    'Invalidation reason'
  ]),
  group('applicant', '02 · Applicant Identity', ['Full name', 'Email', 'Phone', 'UID', 'Applicant token identifier']),
  group('vehicle', '03 · Vehicle', ['Plate number', 'Year', 'Make', 'Model', 'Odometer']),
  group('location', '04 · Location', address),
  group('initial-telemetry', '05A · Initial Telemetry', telemetry),
  group('latest-telemetry', '05B · Latest Telemetry', telemetry),
  group('snapshot-discrepancies', 'Snapshot Differences', [
    'Full address',
    'Street name',
    'Locality',
    'City',
    'Postcode',
    'Region',
    'Country',
    'Country code',
    'Country code alpha-3',
    'Feature type',
    'Mapbox ID',
    'Address latitude',
    'Address longitude',
    'Best accuracy',
    'IP country verdict'
  ]),
  group('evidence', '06 · Evidence Manifest', ['Evidence items', 'Storage prefix', 'Video reference']),
  group('evidence-item', '06 · Evidence Item', [
    'Label',
    'Slot',
    'Capture ID',
    'Captured at',
    'Content type',
    'Size',
    'R2 object key',
    'Capture integrity',
    'Integrity status',
    'Integrity verdict',
    'Integrity confidence',
    'Integrity signals',
    'Integrity model',
    'Integrity analyzed at',
    ...telemetry.map((label) => `Capture ${label}`)
  ]),
  group('network', '07 · Network Provenance', [
    'IP address',
    'ASN',
    'AS name',
    'AS domain',
    'Country',
    'Country code',
    'Continent',
    'Continent code',
    'Network data'
  ]),
  group('attributes', '08 · Supplemental Attributes', ['All supplemental attributes']),
  group('record', '09 · Record Provenance', ['snap record ID', 'Upload ID', 'Record created', 'Record updated'])
]
export const REPORT_FIELD_KEYS = new Set(REPORT_FIELD_GROUPS.flatMap((group) => group.fields.map((field) => field.key)))
export type ReportSettings = { excludedFields: string[]; updatedAt: number | null }
