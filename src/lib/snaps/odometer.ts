export const MAX_VEHICLE_MILEAGE = 9_999_999.9
export const ODOMETER_DISTANCE_UNIT = 'km' as const

export type OdometerReading = {
  mileage_km: number | null
}

export const normalizeMileage = (value: unknown): number | null => {
  const candidate =
    typeof value === 'string' && value.trim()
      ? Number(value.replace(/[\s,]/g, ''))
      : typeof value === 'number'
        ? value
        : Number.NaN

  if (!Number.isFinite(candidate) || candidate < 0 || candidate > MAX_VEHICLE_MILEAGE) {
    return null
  }

  return Math.round(candidate * 10) / 10
}

export const normalizeOdometerReading = (value: unknown): number | null => {
  const reading = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return normalizeMileage(reading.mileage_km)
}
