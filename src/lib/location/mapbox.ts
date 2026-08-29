import type { ReverseGeocodedAddress } from './type'

const MAX_COMPONENTS = 256

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const readString = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

const readContextRecord = (context: Record<string, unknown>, key: string) => {
  const value = context[key]
  return isRecord(value) ? value : null
}

const readContextString = (context: Record<string, unknown>, key: string, field = 'name') =>
  readString(readContextRecord(context, key)?.[field])

const flattenScalars = (
  value: unknown,
  output: Record<string, string>,
  path = '',
  depth = 0
): Record<string, string> => {
  if (Object.keys(output).length >= MAX_COMPONENTS || depth > 5) {
    return output
  }

  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    if (path) {
      output[path] = String(value)
    }

    return output
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      flattenScalars(item, output, path ? `${path}.${index}` : String(index), depth + 1)
    }

    return output
  }

  if (!isRecord(value)) {
    return output
  }

  for (const [key, item] of Object.entries(value)) {
    flattenScalars(item, output, path ? `${path}.${key}` : key, depth + 1)
  }

  return output
}

export const parseMapboxAddress = (value: unknown): ReverseGeocodedAddress | null => {
  if (!isRecord(value) || !Array.isArray(value.features)) {
    return null
  }

  const features = value.features.filter(isRecord)
  const feature =
    features.find((candidate) => {
      const properties = isRecord(candidate.properties) ? candidate.properties : null
      return properties?.feature_type === 'secondary_address'
    }) ??
    features.find((candidate) => {
      const properties = isRecord(candidate.properties) ? candidate.properties : null
      return properties?.feature_type === 'address'
    }) ??
    features[0]
  const properties = feature && isRecord(feature.properties) ? feature.properties : null
  const coordinates = properties && isRecord(properties.coordinates) ? properties.coordinates : null
  const context = properties && isRecord(properties.context) ? properties.context : {}
  const longitude = coordinates?.longitude
  const latitude = coordinates?.latitude
  const mapboxId = readString(properties?.mapbox_id)
  const featureType = readString(properties?.feature_type)
  const fullAddress =
    readString(properties?.full_address) ??
    [readString(properties?.name_preferred) ?? readString(properties?.name), readString(properties?.place_formatted)]
      .filter(Boolean)
      .join(', ')

  if (
    !properties ||
    !coordinates ||
    !mapboxId ||
    !featureType ||
    !fullAddress ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude)
  ) {
    return null
  }

  const secondaryAddress = readContextRecord(context, 'secondary_address')
  const secondaryDesignator = readString(secondaryAddress?.designator)
  const secondaryIdentifier = readString(secondaryAddress?.identifier)
  const lotNumber = secondaryDesignator?.toLowerCase() === 'lot' ? secondaryIdentifier : undefined
  const addressNumber = readContextString(context, 'address', 'address_number')
  const streetName =
    readContextString(context, 'address', 'street_name') ?? readContextString(context, 'street')
  const optionalFields = {
    accuracy: readString(coordinates.accuracy),
    address_number: addressNumber,
    street_name: streetName,
    secondary_address: readString(secondaryAddress?.name),
    secondary_designator: secondaryDesignator,
    secondary_identifier: secondaryIdentifier,
    lot_number: lotNumber,
    neighborhood: readContextString(context, 'neighborhood'),
    locality: readContextString(context, 'locality'),
    city: readContextString(context, 'place'),
    district: readContextString(context, 'district'),
    postcode: readContextString(context, 'postcode'),
    region: readContextString(context, 'region'),
    region_code: readContextString(context, 'region', 'region_code'),
    country: readContextString(context, 'country'),
    country_code: readContextString(context, 'country', 'country_code'),
    country_code_alpha_3: readContextString(context, 'country', 'country_code_alpha_3')
  }

  return {
    provider: 'mapbox',
    attribution: readString(value.attribution) ?? '© Mapbox',
    mapbox_id: mapboxId,
    feature_type: featureType,
    full_address: fullAddress,
    latitude,
    longitude,
    ...Object.fromEntries(Object.entries(optionalFields).filter((entry): entry is [string, string] => Boolean(entry[1]))),
    components: flattenScalars(properties, {})
  } as ReverseGeocodedAddress
}
