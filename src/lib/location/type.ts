export const MAX_SNAP_LOCATION_ACCURACY_METERS = 20
export const MAX_SNAP_LOCATION_AGE_MS = 30_000

export interface DeviceLocation {
  latitude: number
  longitude: number
  accuracy_meters: number
  altitude_meters: number | null
  altitude_accuracy_meters: number | null
  heading_degrees: number | null
  speed_meters_per_second: number | null
  captured_at: number
}

export interface ReverseGeocodedAddress {
  provider: 'mapbox'
  attribution: string
  mapbox_id: string
  feature_type: string
  full_address: string
  latitude: number
  longitude: number
  accuracy?: string
  address_number?: string
  street_name?: string
  secondary_address?: string
  secondary_designator?: string
  secondary_identifier?: string
  lot_number?: string
  neighborhood?: string
  locality?: string
  city?: string
  district?: string
  postcode?: string
  region?: string
  region_code?: string
  country?: string
  country_code?: string
  country_code_alpha_3?: string
  components: Record<string, string>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const readNullableNumber = (value: unknown): number | null | undefined => {
  if (value === null || value === undefined) {
    return null
  }

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export const parseDeviceLocation = (value: unknown): DeviceLocation | null => {
  if (!isRecord(value)) {
    return null
  }

  const latitude = readNullableNumber(value.latitude)
  const longitude = readNullableNumber(value.longitude)
  const accuracy = readNullableNumber(value.accuracy_meters)
  const altitude = readNullableNumber(value.altitude_meters)
  const altitudeAccuracy = readNullableNumber(value.altitude_accuracy_meters)
  const heading = readNullableNumber(value.heading_degrees)
  const speed = readNullableNumber(value.speed_meters_per_second)
  const capturedAt = readNullableNumber(value.captured_at)

  if (
    latitude === null ||
    latitude === undefined ||
    latitude < -90 ||
    latitude > 90 ||
    longitude === null ||
    longitude === undefined ||
    longitude < -180 ||
    longitude > 180 ||
    accuracy === null ||
    accuracy === undefined ||
    accuracy < 0 ||
    altitude === undefined ||
    altitudeAccuracy === undefined ||
    (altitudeAccuracy !== null && altitudeAccuracy < 0) ||
    heading === undefined ||
    (heading !== null && (heading < 0 || heading >= 360)) ||
    speed === undefined ||
    (speed !== null && speed < 0) ||
    capturedAt === null ||
    capturedAt === undefined ||
    capturedAt <= 0
  ) {
    return null
  }

  return {
    latitude,
    longitude,
    accuracy_meters: accuracy,
    altitude_meters: altitude,
    altitude_accuracy_meters: altitudeAccuracy,
    heading_degrees: heading,
    speed_meters_per_second: speed,
    captured_at: capturedAt
  }
}

export const isSnapLocationCurrentAndAccurate = (location: DeviceLocation, now = Date.now()) =>
  location.accuracy_meters <= MAX_SNAP_LOCATION_ACCURACY_METERS &&
  location.captured_at <= now + 5_000 &&
  now - location.captured_at <= MAX_SNAP_LOCATION_AGE_MS

export const deviceLocationFromPosition = (position: GeolocationPosition): DeviceLocation => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy_meters: position.coords.accuracy,
  altitude_meters: position.coords.altitude,
  altitude_accuracy_meters: position.coords.altitudeAccuracy,
  heading_degrees: Number.isNaN(position.coords.heading) ? null : position.coords.heading,
  speed_meters_per_second: Number.isNaN(position.coords.speed) ? null : position.coords.speed,
  captured_at: position.timestamp
})
