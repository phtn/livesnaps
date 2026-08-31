import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import {
  createSnapFullReportDocument,
  flattenSnapAttributeFields,
  type SnapFullReportDocument
} from './full-report'

const snapId = 'snap_fixture_01' as Id<'snaps'>

const createSnap = (): Doc<'snaps'> => ({
  _creationTime: Date.parse('2026-08-09T01:00:00.000Z'),
  _id: snapId,
  email: 'ada@example.test',
  firebase_uid: 'firebase-ada',
  full_name: 'Ada Lovelace',
  ipinfo: {
    as_domain: 'example-network.test',
    as_name: 'Example Network',
    asn: 'AS64500',
    continent: 'Asia',
    continent_code: 'AS',
    country: 'Philippines',
    country_code: 'PH',
    ip: '203.0.113.10'
  },
  location: {
    address: {
      city: 'Makati',
      country: 'Philippines',
      country_code: 'PH',
      country_code_alpha_3: 'PHL',
      feature_type: 'address',
      full_address: '1 Example Street, Makati, Philippines',
      latitude: 14.5547,
      locality: 'Barangay Example',
      longitude: 121.0244,
      mapbox_id: 'mapbox.fixture',
      postcode: '1200',
      provider: 'mapbox',
      region: 'Metro Manila',
      street_name: 'Example Street'
    },
    best_accuracy_meters: 3.25,
    country_code_matches_ipinfo: false
  },
  location_session: {
    address: {
      address_number: '1',
      attribution: 'Mapbox fixture attribution',
      city: 'Makati',
      components: { barangay: 'Barangay Example', custom_zone: 'Zone 42' },
      country: 'Philippines',
      country_code: 'PH',
      country_code_alpha_3: 'PHL',
      feature_type: 'address',
      full_address: '1 Example Street, Makati, Philippines',
      latitude: 14.5547,
      locality: 'Barangay Example',
      longitude: 121.0244,
      mapbox_id: 'mapbox.fixture',
      postcode: '1200',
      provider: 'mapbox',
      region: 'Metro Manila',
      street_name: 'Example Street'
    },
    best_accuracy_meters: 3.25,
    country_code_matches_ipinfo: null,
    ended_at: Date.parse('2026-08-09T01:05:09.000Z'),
    initial: {
      accuracy_meters: 8.5,
      altitude_accuracy_meters: 2.25,
      altitude_meters: 18.75,
      captured_at: Date.parse('2026-08-09T01:00:02.000Z'),
      heading_degrees: 91.5,
      latitude: 14.5546,
      longitude: 121.0243,
      speed_meters_per_second: 0.5
    },
    latest: {
      accuracy_meters: 3.25,
      altitude_accuracy_meters: null,
      altitude_meters: null,
      captured_at: Date.parse('2026-08-09T01:05:08.000Z'),
      heading_degrees: null,
      latitude: 14.5547,
      longitude: 121.0244,
      speed_meters_per_second: null
    },
    started_at: Date.parse('2026-08-09T01:00:00.000Z'),
    status: 'completed'
  },
  make: 'Toyota',
  metadata: {
    applicant_token_identifier: 'firebase|applicant-token',
    attributes: {
      bytes: new Uint8Array([0, 15, 255]).buffer,
      flags: [true, false],
      nested: { count: BigInt('9007199254740993'), note: 'fixture-note' }
    },
    photos: [
      {
        capture_id: 'capture-front-01',
        capture_integrity: {
          analyzed_at: Date.parse('2026-08-09T01:01:02.000Z'),
          confidence: 0.98,
          disposition: 'accepted',
          model: 'command-a-vision-07-2025',
          signals: [],
          status: 'completed',
          verdict: 'physical_scene'
        },
        captured_at: Date.parse('2026-08-09T01:01:00.000Z'),
        content_type: 'image/webp',
        label: 'Front view',
        location: {
          accuracy_meters: 4.5,
          altitude_accuracy_meters: null,
          altitude_meters: 18,
          captured_at: Date.parse('2026-08-09T01:00:59.000Z'),
          heading_degrees: null,
          latitude: 14.55465,
          longitude: 121.02435,
          speed_meters_per_second: 0
        },
        r2_key: 'snaps/upload-fixture/1-front-capture-front-01.webp',
        size: 123_456,
        slot: 1
      }
    ],
    storage_prefix: 'snaps/',
    upload_id: 'upload-fixture'
  },
  mileage: 12_345,
  model: 'Vios',
  phone: '+63 900 000 0000',
  plate_number: 'ABC 1234',
  updated_at: Date.parse('2026-08-09T01:05:10.000Z'),
  video: 'proof-video-fixture.webm',
  year: 2024
})

const allReportValues = (report: SnapFullReportDocument) =>
  report.blocks.flatMap((block) => [
    ...block.fields.map((field) => field.value),
    ...(block.kind === 'evidence' ? block.items.flatMap((item) => item.fields.map((field) => field.value)) : [])
  ])

describe('full proof report reshaping', () => {
  test('maps the authoritative row into deduplicated semantic sections without losing stored data', () => {
    const report = createSnapFullReportDocument(createSnap(), new Date('2026-08-09T02:00:00.000Z'))
    const values = allReportValues(report)

    assert.equal(report.kind, 'snap-full-row-report')
    assert.equal(report.metrics.find((metric) => metric.label === 'IP country match')?.value, 'Unknown')
    assert.equal(report.blocks.some((block) => block.kind === 'callout'), false)

    for (const expected of [
      'Ada Lovelace',
      'ada@example.test',
      '+63 900 000 0000',
      'firebase-ada',
      'firebase|applicant-token',
      'ABC 1234',
      'Toyota',
      'Vios',
      '12345',
      '1 Example Street, Makati, Philippines',
      'Mapbox fixture attribution',
      'Zone 42',
      '203.0.113.10',
      'AS64500',
      'capture-front-01',
      'Accepted',
      'Physical scene',
      '98.0%',
      'None detected',
      'command-a-vision-07-2025',
      'snaps/upload-fixture/1-front-capture-front-01.webp',
      'proof-video-fixture.webm',
      'upload-fixture',
      snapId,
      '9007199254740993n',
      'bytes:3:000fff',
      'fixture-note'
    ]) {
      assert.ok(values.includes(expected), `expected report to retain ${expected}`)
    }
  })

  test('surfaces genuine snapshot differences while treating the known null-to-false projection as an alias', () => {
    const snap = createSnap()
    const report = createSnapFullReportDocument({
      ...snap,
      location: snap.location
        ? {
            ...snap.location,
            address: { ...snap.location.address, city: 'Pasig' }
          }
        : undefined
    })
    const callout = report.blocks.find((block) => block.kind === 'callout')

    assert.ok(callout && callout.kind === 'callout')
    assert.deepEqual(callout.fields.map((field) => field.label), ['City'])
    assert.match(callout.fields[0]?.value ?? '', /Session: Makati \| Snapshot: Pasig/)
  })

  test('uses the compact location as an explicit fallback for legacy rows', () => {
    const legacySnap = createSnap()
    delete legacySnap.location_session
    const report = createSnapFullReportDocument(legacySnap)
    const location = report.blocks.find((block) => block.id === 'location')

    assert.ok(location && location.kind === 'section')
    assert.match(location.description ?? '', /Legacy normalized location snapshot/)
    assert.equal(report.metrics.find((metric) => metric.label === 'IP country match')?.value, 'Mismatch')
  })

  test('flattens nested Convex values with stable paths and lossless scalar encodings', () => {
    const fields = flattenSnapAttributeFields({ z: [Number.NaN, Number.POSITIVE_INFINITY], a: new Uint8Array([1, 2]).buffer })

    assert.deepEqual(fields.map((field) => field.label), ['A', 'Z / Item 1', 'Z / Item 2'])
    assert.deepEqual(fields.map((field) => field.value), ['bytes:2:0102', 'NaN', 'Infinity'])
  })
})
