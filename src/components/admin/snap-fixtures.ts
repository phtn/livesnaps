import { buildSnapObjectKey, SNAP_SLOTS, type SnapSlotIndex } from '@/lib/r2/snap-images'
import { CAPTURE_INTEGRITY_MODEL } from '@/lib/snaps/capture-integrity'
import type { AdminSnapListItem, AdminSnapPhoto } from '@/lib/snaps/admin-photo-types'

/**
 * Deterministic in-memory `snaps` rows for UI work.
 *
 * These are full `AdminSnapListItem` documents — the exact shape
 * `snaps.q.listForAdmin` returns — so a column, cell, or viewer built against
 * them behaves identically against live data. Photo keys are built with the
 * real `buildSnapObjectKey`, so they pass `isSnapObjectKey` and the photo
 * viewer resolves them (the images 404 without R2, which is the point: layout
 * and error states are what you are iterating on).
 *
 * No faker and no async: the lab page renders synchronously on first paint with
 * nothing pulled into the bundle. For volume/perf work use `seedSnapRows` in
 * `./data` instead.
 */

const FIXTURE_SEED = 0x5eed_5eed

// mulberry32 — small, fast, and stable across runs so screenshots and visual
// diffs do not churn between reloads.
const createRandom = (seed: number) => {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

const FIRST_NAMES = [
  'Mateo', 'Liwayway', 'Grace', 'Dexter', 'Ines', 'Rafael', 'Nori', 'Bea',
  'Caleb', 'Amihan', 'Jomar', 'Perla', 'Diego', 'Ruby', 'Elias', 'Tala'
]
const LAST_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Villanueva', 'Del Rosario',
  'Aguilar', 'Mercado', 'Navarro', 'Salazar', 'Domingo', 'Fernandez', 'Lim'
]
const STREETS = [
  'Katipunan Ave', 'Shaw Blvd', 'Ortigas Ave', 'Roxas Blvd', 'EDSA',
  'Marcos Hwy', 'Aurora Blvd', 'C5 Road', 'Commonwealth Ave', 'Taft Ave'
]
const CITIES = [
  ['Quezon City', 'Metro Manila', '1100'], ['Makati', 'Metro Manila', '1200'],
  ['Pasig', 'Metro Manila', '1600'], ['Cebu City', 'Central Visayas', '6000'],
  ['Davao City', 'Davao Region', '8000'], ['Taguig', 'Metro Manila', '1630']
] as const
const MAKES = ['Toyota', 'Honda', 'Mitsubishi', 'Nissan', 'Hyundai', 'Ford', 'Isuzu', 'Suzuki']
const MODELS = ['Vios', 'Civic', 'Montero', 'Navara', 'Tucson', 'Ranger', 'D-Max', 'Ertiga']
// `pending` is what `listForAdmin` falls back to when a snap has no location
// session, so the fixtures cover it too.
const STATUSES: AdminSnapListItem['status'][] = [
  'pending', 'active', 'abandoned', 'completed', 'cancelled', 'invalidated'
]
const HANDLERS = [
  { email: 'ops.dela.cruz@livesnapsnow.com', name: 'Ops Dela Cruz' },
  { email: 'ver.tan@livesnapsnow.com', name: 'Ver Tan' },
  { email: 'audit.reyes@livesnapsnow.com', name: 'Audit Reyes' }
]
const INTEGRITY_DISPOSITIONS = ['accepted', 'review', 'rejected'] as const

export interface SnapFixtureOptions {
  /** Fixed clock so relative timestamps stay stable between reloads. */
  now?: number
  seed?: number
}

export const createSnapFixtures = (
  count = 60,
  { now = Date.UTC(2026, 8, 3, 9, 0, 0), seed = FIXTURE_SEED }: SnapFixtureOptions = {}
): AdminSnapListItem[] => {
  const random = createRandom(seed)
  const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)]
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))
  const hex = (length: number) =>
    Array.from({ length }, () => Math.floor(random() * 16).toString(16)).join('')

  // Matches the UUID shape `isSnapUploadId` enforces (version 1-8, variant 8-b).
  const uuid = () =>
    `${hex(8)}-${hex(4)}-4${hex(3)}-${pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`

  return Array.from({ length: count }, (_, index): AdminSnapListItem => {
    const firstName = pick(FIRST_NAMES)
    const lastName = pick(LAST_NAMES)
    const fullName = `${firstName} ${lastName}`
    const status = pick(STATUSES)
    const isCompleted = status === 'completed'
    const uploadId = uuid()

    // Only a finished capture has all five slots.
    const photoCount = isCompleted ? 5 : status === 'active' ? between(1, 4) : 0
    const createdAt = now - between(1, 120) * 86_400_000 - between(0, 86_399) * 1_000
    const updatedAt = createdAt + between(0, 6) * 3_600_000
    const [city, region, postcode] = pick(CITIES)
    const streetNumber = between(1, 3_500)
    const streetName = pick(STREETS)
    const fullAddress = `${streetNumber} ${streetName}, ${city}, ${region} ${postcode}`
    const accuracy = photoCount > 0 ? Math.round(between(30, 650) / 10) : null
    const matchesIpinfo = photoCount > 0 ? random() > 0.12 : null
    const verificationStatus = isCompleted ? (random() > 0.5 ? 'submitted' : 'draft') : undefined

    const photos: AdminSnapPhoto[] = Array.from({ length: photoCount }, (__, slotIndex) => {
      const slot = SNAP_SLOTS[slotIndex]
      const disposition = pick(INTEGRITY_DISPOSITIONS)

      return {
        capture_id: uuid(),
        capture_integrity: {
          analyzed_at: updatedAt,
          confidence: between(62, 99) / 100,
          disposition,
          model: CAPTURE_INTEGRITY_MODEL,
          signals: disposition === 'accepted' ? [] : ['moire_pattern'],
          status: 'completed',
          verdict: disposition === 'accepted' ? 'physical_scene' : 'uncertain'
        },
        captured_at: createdAt + slotIndex * 45_000,
        content_type: 'image/webp',
        label: slot.label,
        r2_key: buildSnapObjectKey(uploadId, slot.index as SnapSlotIndex, uuid()),
        size: between(180_000, 2_400_000),
        slot: slot.index
      }
    })

    const location =
      photoCount > 0
        ? {
            address: {
              city,
              country: 'Philippines',
              country_code: 'PH',
              country_code_alpha_3: 'PHL',
              feature_type: 'address',
              full_address: fullAddress,
              latitude: 14.5 + random(),
              locality: city,
              longitude: 120.9 + random(),
              mapbox_id: `dXJuOm1ieGFkcjo${hex(12)}`,
              postcode,
              provider: 'mapbox',
              region,
              street_name: streetName
            },
            best_accuracy_meters: accuracy ?? 0,
            country_code_matches_ipinfo: matchesIpinfo ?? false
          }
        : null

    return {
      _id: `sn_fixture_${String(index + 1).padStart(4, '0')}`,
      bestAccuracyMeters: accuracy,
      countryCode: 'PH',
      countryCodeMatchesIpinfo: matchesIpinfo,
      createdAt,
      email: `${firstName}.${lastName}@example.dev`.toLowerCase().replace(/\s+/g, ''),
      firebaseUid: hex(28),
      fullName,
      handler: verificationStatus === 'submitted' ? pick(HANDLERS) : undefined,
      location,
      location_session: undefined,
      locationLabel: photoCount > 0 ? fullAddress : '',
      make: pick(MAKES),
      mileage: isCompleted ? between(1_200, 320_000) : null,
      model: pick(MODELS),
      phone: `+639${between(100_000_000, 999_999_999)}`,
      photos,
      plateNumber: `${pick(['ABC', 'NGX', 'TPL', 'CVR', 'DKM'])} ${between(1000, 9999)}`,
      status,
      updatedAt,
      uploadId,
      verification_status: verificationStatus,
      year: between(2005, 2026)
    } as AdminSnapListItem
  })
}
