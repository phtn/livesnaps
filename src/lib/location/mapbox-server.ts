import { parseMapboxAddress } from './mapbox'
import type { ReverseGeocodedAddress } from './type'

const MAPBOX_REVERSE_GEOCODING_URL = 'https://api.mapbox.com/search/geocode/v6/reverse'

export class MapboxGeocodingError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'MapboxGeocodingError'
  }
}

export const reverseGeocodeWithMapbox = async ({
  latitude,
  longitude
}: {
  latitude: number
  longitude: number
}): Promise<ReverseGeocodedAddress> => {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim()

  if (!token) {
    throw new MapboxGeocodingError('Mapbox reverse geocoding is not configured.', 500)
  }

  const endpoint = new URL(MAPBOX_REVERSE_GEOCODING_URL)
  endpoint.searchParams.set('longitude', String(longitude))
  endpoint.searchParams.set('latitude', String(latitude))
  endpoint.searchParams.set('permanent', 'true')
  endpoint.searchParams.set('access_token', token)

  const response = await fetch(endpoint, { cache: 'no-store' })

  if (!response.ok) {
    throw new MapboxGeocodingError('Mapbox could not resolve the device location.', response.status)
  }

  const address = parseMapboxAddress(await response.json().catch(() => null))

  if (!address) {
    throw new MapboxGeocodingError('No complete address was found for the device location.', 422)
  }

  return address
}
