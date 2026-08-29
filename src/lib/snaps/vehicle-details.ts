export const MAX_PLATE_NUMBER_LENGTH = 32
export const MAX_VEHICLE_NAME_LENGTH = 80
export const CAPTURE_PLATE_NUMBER_MAX_LENGTH = 10
export const CAPTURE_PLATE_NUMBER_INPUT_PATTERN = '[A-Z0-9 -]{5,10}'
const CAPTURE_PLATE_NUMBER_STRICT_PATTERN = /^[A-Z]{3} [0-9]{4}$/

export type VehicleDetails = {
  plate_number: string
  make: string
  model: string
}

export const EMPTY_VEHICLE_DETAILS: VehicleDetails = {
  plate_number: '',
  make: '',
  model: ''
}

const UNAVAILABLE_VALUE_PATTERN = /^(?:n\/?a|none|not (?:available|visible)|unknown|unreadable)$/i
// Permissive plate: 5-10 chars, alphanumeric plus space/hyphen, must contain at least 2 letters and 2 digits
const COMPLETE_CAPTURE_PLATE_NUMBER_PERMISSIVE_PATTERN = /^[A-Z0-9][A-Z0-9 -]{3,8}[A-Z0-9]$/

const normalizeDetectedValue = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.trim().replace(/\s+/g, ' ')

  return UNAVAILABLE_VALUE_PATTERN.test(normalized) ? '' : normalized.slice(0, maxLength)
}

export const normalizePlateNumber = (value: unknown) =>
  normalizeDetectedValue(value, MAX_PLATE_NUMBER_LENGTH).toUpperCase()

export const formatCapturePlateNumber = (value: unknown) => {
  if (typeof value !== 'string') {
    return ''
  }

  // Preserve user-typed alphanumerics, spaces and hyphens; uppercase and collapse whitespace
  // Do NOT force AAA 1234 — that mangled non-BR plates and caused perceived "vision failure"
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CAPTURE_PLATE_NUMBER_MAX_LENGTH)

  // If the raw looks like a BR plate without space, insert it for convenience: ABC1234 -> ABC 1234
  const compact = normalized.replace(/[ -]/g, '')
  if (/^[A-Z]{3}[0-9]{4}$/.test(compact)) {
    console.info('[RAW]', value)
    console.info('[NORMALIZED]', normalized)
    console.info('[COMPACT]', `${compact.slice(0, 3)} ${compact.slice(3)}`)
    return value
  }

  return value
}

const hasMinPlateContent = (value: string) => {
  const letters = (value.match(/[A-Z]/g) ?? []).length
  const digits = (value.match(/[0-9]/g) ?? []).length
  return letters >= 3 && digits >= 4
}

export const isCompleteCapturePlateNumber = (value: unknown) => {
  if (typeof value !== 'string') return false
  const trimmed = value.trim().toUpperCase()
  if (CAPTURE_PLATE_NUMBER_STRICT_PATTERN.test(trimmed)) return true
  if (!COMPLETE_CAPTURE_PLATE_NUMBER_PERMISSIVE_PATTERN.test(trimmed)) return false
  return hasMinPlateContent(trimmed)
}

export const normalizeDetectedVehicleDetails = (value: unknown): VehicleDetails => {
  const details = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

  return {
    plate_number: normalizePlateNumber(details.plate_number),
    make: normalizeDetectedValue(details.make, MAX_VEHICLE_NAME_LENGTH),
    model: normalizeDetectedValue(details.model, MAX_VEHICLE_NAME_LENGTH)
  }
}

export const mergeDetectedVehicleDetails = (existing: VehicleDetails, detected: VehicleDetails): VehicleDetails => {
  const current = normalizeDetectedVehicleDetails(existing)
  const next = normalizeDetectedVehicleDetails(detected)

  return {
    plate_number: next.plate_number || current.plate_number,
    make: next.make || current.make,
    model: next.model || current.model
  }
}
