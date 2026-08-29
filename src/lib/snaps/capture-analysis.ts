import { normalizePlateNumber, type VehicleDetails } from './vehicle-details'

export type VehicleInspectionView = 'front' | 'back'

export const getVehicleInspectionView = (
  slotIndex: number,
  existing: VehicleDetails | string
): VehicleInspectionView | null => {
  if (slotIndex === 1) {
    return 'front'
  }

  if (slotIndex === 2) {
    if (typeof existing === 'string') {
      // legacy string path — only plate matters (keeps existing unit tests green)
      return !normalizePlateNumber(existing) ? 'back' : null
    }

    const hasPlate = Boolean(normalizePlateNumber(existing.plate_number))
    const hasMake = Boolean(existing.make?.trim())
    const hasModel = Boolean(existing.model?.trim())

    // Run back view if plate missing OR make/model missing — front alone is not enough for vehicle identity
    if (!hasPlate || !hasMake || !hasModel) {
      return 'back'
    }
  }

  return null
}
