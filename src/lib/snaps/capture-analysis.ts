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
    const plateNumber = typeof existing === 'string' ? existing : existing.plate_number
    return normalizePlateNumber(plateNumber) ? null : 'back'
  }

  return null
}
