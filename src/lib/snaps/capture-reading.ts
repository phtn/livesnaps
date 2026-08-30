import type { SnapSlotIndex } from '@/lib/r2/snap-images'
import { normalizeMileage } from './odometer'
import { normalizeDetectedVehicleDetails, type VehicleDetails } from './vehicle-details'

export type CaptureReading = {
  vehicle: VehicleDetails | null
  mileageKm: number | null
}

export const parseCaptureReading = (value: unknown, slot: SnapSlotIndex): CaptureReading => {
  const response = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const isVehicleSlot = slot === 1 || slot === 2

  return {
    vehicle: isVehicleSlot && response.vehicle && typeof response.vehicle === 'object'
      ? normalizeDetectedVehicleDetails(response.vehicle)
      : null,
    mileageKm: slot === 5 ? normalizeMileage(response.mileage) : null
  }
}
